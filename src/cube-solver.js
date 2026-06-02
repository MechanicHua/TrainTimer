import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  relativeFaceletsForScrambleTarget,
  relativeFaceletsForScrambleTargetFacelets,
  solvedFaceletString,
} from './cube-state.js';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundledTnoodleJar = resolve(projectRoot, 'vendor', 'tnoodle-cli-1.1.1.jar');
const min2PhaseHelper = resolve(projectRoot, 'vendor', 'Min2PhaseCli.java');
let solverProcess = null;
let solverStdoutBuffer = '';
let solverRequestId = 0;
let solverLastStderr = '';
let solverReadyPromise = null;
let solverReadyResolve = null;
let solverReadyReject = null;
let solverIdleTimer = null;
let solverProcessWarmed = false;
const solverPending = new Map();
const solutionCache = new Map();
const solutionPending = new Map();
const solutionCacheLimit = 256;
const solverJitWarmupRelativeFacelets = 'FUUFUULLDFBBFRRBLBDFRDFRFLULBRBDDURRDDBFLBFRULLLUBUDDR';
let solverIdleMs = clampInteger(
  globalThis.process?.env?.TRAIN_TIMER_CUBE_SOLVER_IDLE_MS,
  0,
  60 * 60 * 1000,
  10 * 60 * 1000,
);

export async function solveCorrectionToScrambleTarget(targetMoves, currentFacesOrFacelets, options = {}) {
  throwIfAborted(options.signal);
  const startedAt = performance.now();
  const relativeFacelets = options.relativeFacelets
    ? normalizeRelativeFacelets(options.relativeFacelets)
    : options.targetFacelets
    ? relativeFaceletsForScrambleTargetFacelets(options.targetFacelets, currentFacesOrFacelets)
    : relativeFaceletsForScrambleTarget(targetMoves, currentFacesOrFacelets);
  const cachedMoves = solutionCache.get(relativeFacelets);
  if (cachedMoves) {
    return {
      moves: [...cachedMoves],
      correction: cachedMoves.join(' '),
      source: 'min2phase-cache',
      relativeFacelets,
      durationMs: performance.now() - startedAt,
    };
  }

  if (relativeFacelets === solvedFaceletString) {
    return {
      moves: [],
      correction: '',
      source: 'min2phase',
      relativeFacelets,
      durationMs: performance.now() - startedAt,
    };
  }

  if (!existsSync(bundledTnoodleJar) || !existsSync(min2PhaseHelper)) {
    throw new Error('Bundled min2phase solver is unavailable');
  }

  const maxDepth = clampInteger(options.maxDepth, 1, 30, 25);
  const probeMax = clampInteger(options.probeMax, 1000, 100000000, 1000000);
  const timeout = clampInteger(options.timeoutMs, 500, 15000, 4000);
  const { moves, shared } = await solveRelativeFaceletsCached(relativeFacelets, {
    maxDepth,
    probeMax,
    timeout,
    signal: options.signal,
  });

  return {
    moves: [...moves],
    correction: moves.join(' '),
    source: shared ? 'min2phase-shared' : 'min2phase',
    relativeFacelets,
    durationMs: performance.now() - startedAt,
  };
}

async function solveRelativeFaceletsCached(relativeFacelets, options) {
  const pending = solutionPending.get(relativeFacelets);
  if (pending) {
    return {
      moves: [...await abortablePromise(pending, options.signal)],
      shared: true,
    };
  }

  throwIfAborted(options.signal);
  const solverOptions = {
    ...options,
    signal: null,
  };
  const promise = solveRelativeFacelets(relativeFacelets, solverOptions)
    .then((output) => {
      if (/^Error\b/i.test(output)) throw new Error(`min2phase solver failed: ${output}`);
      const moves = output ? output.split(/\s+/).filter(Boolean) : [];
      rememberSolution(relativeFacelets, moves);
      return moves;
    })
    .finally(() => {
      solutionPending.delete(relativeFacelets);
      scheduleCubeCorrectionSolverIdleStop();
    });
  solutionPending.set(relativeFacelets, promise);
  return {
    moves: [...await abortablePromise(promise, options.signal)],
    shared: false,
  };
}

function normalizeRelativeFacelets(facelets) {
  const text = String(facelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(text)) throw new Error('Invalid relative 3x3 facelet string');
  return text;
}

function rememberSolution(relativeFacelets, moves) {
  if (solutionCache.has(relativeFacelets)) solutionCache.delete(relativeFacelets);
  solutionCache.set(relativeFacelets, [...moves]);
  while (solutionCache.size > solutionCacheLimit) {
    solutionCache.delete(solutionCache.keys().next().value);
  }
}

export async function warmCubeCorrectionSolver() {
  if (!existsSync(bundledTnoodleJar) || !existsSync(min2PhaseHelper)) return false;
  try {
    ensureSolverProcess();
    await solverReadyPromise;
    if (solverProcessWarmed) {
      scheduleCubeCorrectionSolverIdleStop();
      return true;
    }
    await solveRelativeFaceletsCached(solverJitWarmupRelativeFacelets, {
      maxDepth: 25,
      probeMax: 1000000,
      timeout: 10000,
    });
    solverProcessWarmed = true;
    scheduleCubeCorrectionSolverIdleStop();
    return true;
  } catch {
    return false;
  }
}

export function stopCubeCorrectionSolver() {
  stopCubeCorrectionSolverWithError(new Error('min2phase solver stopped'));
}

export function cubeCorrectionSolverStatus() {
  return {
    running: Boolean(solverProcess && !solverProcess.killed),
    ready: Boolean(solverProcess && !solverReadyResolve && !solverReadyReject),
    warmed: solverProcessWarmed,
    pendingRequests: solverPending.size,
    pendingSolutions: solutionPending.size,
    cacheSize: solutionCache.size,
    idleTimer: Boolean(solverIdleTimer),
    idleMs: solverIdleMs,
  };
}

function stopCubeCorrectionSolverWithError(error) {
  clearCubeCorrectionSolverIdleTimer();
  for (const pending of solverPending.values()) {
    pending.cleanup?.();
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  solverPending.clear();
  solutionPending.clear();
  const processToStop = solverProcess;
  solverProcess = null;
  solverStdoutBuffer = '';
  solverLastStderr = '';
  solverProcessWarmed = false;
  rejectSolverReady(error);
  if (!processToStop) return;

  processToStop.stdin?.destroy?.();
  processToStop.stdout?.destroy?.();
  processToStop.stderr?.destroy?.();
  if (processToStop.exitCode == null && processToStop.signalCode == null) {
    processToStop.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (processToStop.exitCode == null && processToStop.signalCode == null) {
        processToStop.kill('SIGKILL');
      }
    }, 250);
    killTimer.unref?.();
  }
  processToStop.unref?.();
}

async function solveRelativeFacelets(facelets, options) {
  try {
    return await solveRelativeFaceletsWithServer(facelets, options);
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (solverProcess) stopCubeCorrectionSolver();
    if (isSolverTimeoutError(error)) throw error;
    return solveRelativeFaceletsOneShot(facelets, options);
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function isSolverTimeoutError(error) {
  return /timed out/i.test(error?.message || '');
}

async function solveRelativeFaceletsWithServer(facelets, options) {
  throwIfAborted(options.signal);
  const process = ensureSolverProcess();
  await abortablePromise(solverReadyPromise, options.signal);
  throwIfAborted(options.signal);
  const id = String(++solverRequestId);
  const timeout = clampInteger(options.timeout, 500, 15000, 4000);
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    const cleanup = () => {
      signal?.removeEventListener?.('abort', abortHandler);
    };
    const rejectRequest = (error, options = {}) => {
      const pending = solverPending.get(id);
      if (!pending) return;
      pending.cleanup?.();
      clearTimeout(pending.timer);
      solverPending.delete(id);
      pending.reject(error);
      if (options.stopProcess) stopCubeCorrectionSolverWithError(error);
      else scheduleCubeCorrectionSolverIdleStop();
    };
    const abortHandler = () => {
      rejectRequest(createAbortError());
    };
    const timer = setTimeout(() => {
      rejectRequest(new Error('min2phase solver timed out'), { stopProcess: true });
    }, timeout);
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });
    solverPending.set(id, { resolve, reject, timer, cleanup });
    if (signal?.aborted) {
      abortHandler();
      return;
    }
    process.stdin.write([
      id,
      facelets,
      String(options.maxDepth),
      String(options.probeMax),
    ].join('\t') + '\n', 'utf8', (error) => {
      if (!error) return;
      rejectRequest(error, { stopProcess: true });
    });
  });
}

function ensureSolverProcess() {
  clearCubeCorrectionSolverIdleTimer();
  if (solverProcess && !solverProcess.killed) return solverProcess;
  solverStdoutBuffer = '';
  solverLastStderr = '';
  solverProcessWarmed = false;
  solverReadyPromise = new Promise((resolve, reject) => {
    solverReadyResolve = resolve;
    solverReadyReject = reject;
  });
  solverProcess = spawn('java', [
    '-cp',
    bundledTnoodleJar,
    min2PhaseHelper,
    '--server',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  solverProcess.stdout.setEncoding('utf8');
  solverProcess.stderr.setEncoding('utf8');
  solverProcess.stdout.on('data', handleSolverStdout);
  solverProcess.stderr.on('data', (chunk) => {
    solverLastStderr = `${solverLastStderr}${chunk}`.slice(-2000);
  });
  const spawnedProcess = solverProcess;
  spawnedProcess.once('error', (error) => handleSolverExit(spawnedProcess, error));
  spawnedProcess.once('exit', (code, signal) => handleSolverExit(spawnedProcess, signal || code));
  return solverProcess;
}

function handleSolverStdout(chunk) {
  solverStdoutBuffer += chunk;
  let newline = solverStdoutBuffer.indexOf('\n');
  while (newline !== -1) {
    const line = solverStdoutBuffer.slice(0, newline).trimEnd();
    solverStdoutBuffer = solverStdoutBuffer.slice(newline + 1);
    handleSolverLine(line);
    newline = solverStdoutBuffer.indexOf('\n');
  }
}

function handleSolverLine(line) {
  if (!line) return;
  if (line === 'READY') {
    resolveSolverReady();
    return;
  }
  const [id, status, payload = ''] = line.split('\t', 3);
  const pending = solverPending.get(id);
  if (!pending) return;
  pending.cleanup?.();
  clearTimeout(pending.timer);
  solverPending.delete(id);
  if (status === 'OK') pending.resolve(payload.trim());
  else pending.reject(new Error(payload || 'min2phase solver failed'));
  scheduleCubeCorrectionSolverIdleStop();
}

function handleSolverExit(exitedProcess, errorOrCode) {
  if (exitedProcess !== solverProcess) return;
  const message = errorOrCode instanceof Error
    ? errorOrCode.message
    : `min2phase solver exited${solverLastStderr ? `: ${solverLastStderr.trim()}` : ''}`;
  rejectSolverReady(new Error(message));
  for (const pending of solverPending.values()) {
    pending.cleanup?.();
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  solverPending.clear();
  solverProcess = null;
  solverStdoutBuffer = '';
  solverProcessWarmed = false;
  clearCubeCorrectionSolverIdleTimer();
}

function resolveSolverReady() {
  solverReadyResolve?.(true);
  solverReadyResolve = null;
  solverReadyReject = null;
}

function rejectSolverReady(error) {
  solverReadyReject?.(error);
  solverReadyResolve = null;
  solverReadyReject = null;
  solverReadyPromise = null;
}

function scheduleCubeCorrectionSolverIdleStop() {
  if (!solverProcess || solverProcess.killed || solverIdleTimer || solverPending.size > 0 || solutionPending.size > 0) return;
  if (solverIdleMs <= 0) {
    stopCubeCorrectionSolverWithError(new Error('min2phase solver idle'));
    return;
  }
  solverIdleTimer = setTimeout(() => {
    solverIdleTimer = null;
    if (solverPending.size > 0 || solutionPending.size > 0) return;
    stopCubeCorrectionSolverWithError(new Error('min2phase solver idle'));
  }, solverIdleMs);
  solverIdleTimer.unref?.();
}

function clearCubeCorrectionSolverIdleTimer() {
  if (!solverIdleTimer) return;
  clearTimeout(solverIdleTimer);
  solverIdleTimer = null;
}

async function solveRelativeFaceletsOneShot(facelets, options) {
  const { stdout } = await execFileAsync('java', [
    '-cp',
    bundledTnoodleJar,
    min2PhaseHelper,
    facelets,
    String(options.maxDepth),
    String(options.probeMax),
  ], {
    timeout: options.timeout,
    signal: options.signal,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function abortablePromise(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abortHandler = () => reject(createAbortError());
    signal.addEventListener('abort', abortHandler, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abortHandler);
    });
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError() {
  const error = new Error('Cube correction solve aborted');
  error.name = 'AbortError';
  return error;
}
