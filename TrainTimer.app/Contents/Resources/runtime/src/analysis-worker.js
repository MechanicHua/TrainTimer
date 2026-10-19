import { parentPort } from 'node:worker_threads';
import { analyzeSolve } from './solve-analysis.js';

parentPort.on('message', ({ id, solve }) => {
  try { parentPort.postMessage({ id, result: analyzeSolve(solve) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
