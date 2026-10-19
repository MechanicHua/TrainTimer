import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let worker = null, sequence = 0, idleTimer;
const pending = new Map();

export function requestTnoodle(command, puzzle, scramble = '', timeout = 15000) {
  if (!/^[a-z0-9_]+$/i.test(puzzle)) return Promise.reject(new Error('Invalid puzzle'));
  if (pending.size >= 8) return Promise.reject(new Error('TNoodle queue is full'));
  clearTimeout(idleTimer);
  if (!worker) {
    const current = spawn('java', ['-cp', fileURLToPath(new URL('../vendor/tnoodle-cli-1.1.1.jar', import.meta.url)),
      fileURLToPath(new URL('../vendor/TnoodleServer.java', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
    worker = current;
    let buffer = '';
    current.stdout.setEncoding('utf8');
    current.stdout.on('data', (chunk) => {
      if (current !== worker) return;
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const [id, status, payload] = line.trimEnd().split('\t');
        const job = pending.get(id);
        if (!job) continue;
        clearTimeout(job.timer); pending.delete(id);
        const value = Buffer.from(payload || '', 'base64').toString('utf8');
        status === 'OK' ? job.resolve(value) : job.reject(new Error(value));
      }
      if (!pending.size) {
        for (const handle of [current, current.stdin, current.stdout, current.stderr]) handle.unref?.();
        idleTimer = setTimeout(() => stopTnoodle(), 60000); idleTimer.unref();
      }
    });
    current.stderr.resume();
    const failed = (error) => { if (worker === current) stopTnoodle(error instanceof Error ? error : new Error('TNoodle exited')); };
    current.on('error', failed); current.on('exit', failed);
    current.stdin.on('error', failed);
  }
  const current = worker;
  for (const handle of [current, current.stdin, current.stdout, current.stderr]) handle.ref?.();
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => stopTnoodle(new Error('TNoodle timed out')), timeout);
    pending.set(id, { resolve, reject, timer });
    current.stdin.write([id, command, puzzle, Buffer.from(scramble).toString('base64')].join('\t') + '\n');
  });
}

export function stopTnoodle(error = new Error('TNoodle stopped')) {
  clearTimeout(idleTimer);
  const current = worker; worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear();
  if (!current) return;
  current.stdin.destroy(); current.stdout.destroy(); current.stderr.destroy();
  current.kill(); current.unref();
}
