import { Worker } from 'node:worker_threads';
import { analysisInputKey } from './analysis-input.js';

let worker = null, active = null, nextId = 0, idleTimer = null;
const queue = [], pending = new Map();

export function analyzeSolveInBackground(solve, options = {}) {
  const key = `${solve.id || ''}:${analysisInputKey(solve)}`;
  if (pending.has(key)) return pending.get(key);
  if (queue.length >= 64) return Promise.reject(new Error('分析队列繁忙，请稍后重试'));
  const promise = new Promise((resolve, reject) => {
    const job = { id: ++nextId, solve, resolve, reject, key };
    if (options.priority) queue.unshift(job); else queue.push(job);
  });
  pending.set(key, promise);
  pump();
  return promise;
}

function pump() {
  clearTimeout(idleTimer);
  if (active) return;
  if (!queue.length) {
    idleTimer = setTimeout(() => stopAnalysisWorker(), 60000);
    idleTimer.unref();
    worker?.unref();
    return;
  }
  active = queue.shift();
  try {
    if (!worker) {
      worker = new Worker(new URL('./analysis-worker.js', import.meta.url));
      worker.on('message', ({ id, result, error }) => {
        if (active?.id !== id) return;
        clearTimeout(active.timer);
        const job = active;
        active = null;
        pending.delete(job.key);
        error ? job.reject(new Error(error)) : job.resolve(result);
        pump();
      });
      const current = worker;
      worker.on('error', (error) => { if (worker === current) stopAnalysisWorker(error); });
      worker.on('exit', () => { if (worker === current) stopAnalysisWorker(new Error('分析线程退出')); });
    }
    worker.ref();
    active.timer = setTimeout(() => stopAnalysisWorker(new Error('分析超时')), 30000);
    worker.postMessage({ id: active.id, solve: active.solve });
  } catch (error) { stopAnalysisWorker(error); }
}

export function stopAnalysisWorker(error = new Error('分析线程已关闭')) {
  clearTimeout(idleTimer);
  const current = worker;
  worker = null;
  void current?.terminate();
  const jobs = active ? [active, ...queue] : [...queue];
  active = null;
  queue.length = 0;
  pending.clear();
  for (const job of jobs) { clearTimeout(job.timer); job.reject(error); }
}
