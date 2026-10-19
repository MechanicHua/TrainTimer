// One running job and one latest waiting job. Aborting a caller never grows an
// unbounded worker message queue; the bounded running calculation may finish.
export class LatestWorker {
  constructor(createWorker) {
    this.createWorker = createWorker;
    this.worker = null;
    this.active = null;
    this.waiting = null;
    this.sequence = 0;
  }
  request(payload, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const job = { id: ++this.sequence, payload, resolve, reject, signal };
      job.abort = () => {
        this.settle(job, abortError());
        if (this.waiting === job) this.waiting = null;
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      if (this.waiting) this.settle(this.waiting, abortError());
      this.waiting = job;
      this.pump();
    });
  }
  settle(job, error, value) {
    if (!job || job.settled) return;
    job.settled = true;
    job.signal?.removeEventListener('abort', job.abort);
    error ? job.reject(error) : job.resolve(value);
  }
  pump() {
    if (this.active || !this.waiting) return;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }) => {
          if (data.id !== this.active?.id) return;
          clearTimeout(this.timer);
          this.settle(this.active, data.error ? new Error(data.error) : null, data.result);
          this.active = null;
          this.pump();
        };
        const current = this.worker;
        this.worker.onerror = () => { if (this.worker === current) this.destroy(new Error('计算线程不可用')); };
      }
      this.active = this.waiting;
      this.waiting = null;
      this.timer = setTimeout(() => this.destroy(new Error('计算线程超时')), 5000);
      this.worker.postMessage({ id: this.active.id, ...this.active.payload });
    } catch (error) { this.destroy(error); }
  }
  destroy(error = abortError()) {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.settle(this.active, error);
    this.settle(this.waiting, error);
    this.active = this.waiting = null;
  }
}

function abortError() {
  const error = new Error('计算已取消');
  error.name = 'AbortError';
  return error;
}
