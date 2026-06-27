#!/usr/bin/env node
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { drawScrambleSvg, generateScramble } from './scramble.js';
import { decodeGanBluetoothPacket, encodeGanBluetoothRequests } from './gan-bluetooth.js';
import { solveCorrectionToScrambleTarget, stopCubeCorrectionSolver, warmCubeCorrectionSolver } from './cube-solver.js';
import {
  clearSolves,
  createSession,
  deleteSolves,
  deleteSession,
  duplicateSession,
  formatTime,
  getHistoryPath,
  loadHistory,
  loadHistoryForBootstrap,
  mergeSession,
  moveSolves,
  replaceSolves,
  saveSolve,
  summarizeSolves,
  updateSolve,
  updateSolves,
  updateSession,
} from './history.js';
import { createExportPayload, safeExportFilename, scopedExportHistory, solvesToCsv, solvesToCstimerCsv, solvesToCstimerJson } from './solves-export.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRoot = join(projectRoot, 'public');
const srcRoot = join(projectRoot, 'src');
const publicSrcModules = new Set(['algorithm-trainer-cases.js', 'algorithm-trainer-utils.js', 'bluetooth-moves.js', 'cfop-analysis.js', 'cube-state.js', 'inspection.js', 'move-metrics.js', 'op-analysis.js', 'op-case-diagrams.js', 'op-case-svg.js', 'op-formula-library.js', 'op-pdf-algorithms.js', 'op-poster-diagram-shapes.js', 'op-stats.js', 'replay-timing.js', 'rolling-averages.js', 'solve-summary.js', 'solves-export.js', 'solves-import.js', 'stats-summary.js']);
const requestedPort = Number(process.env.PORT || 3211);
const host = process.env.HOST || '127.0.0.1';
let currentPort = requestedPort;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (request.url?.startsWith('/api/')) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const staticHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

let cubeCorrectionWarmupPromise = null;

function bootstrapScrambleTimeoutMs() {
  return positiveIntegerEnv('TRAIN_TIMER_BOOTSTRAP_SCRAMBLE_TIMEOUT_MS', 2500);
}

function scrambleTimeoutMs() {
  return positiveIntegerEnv('TRAIN_TIMER_SCRAMBLE_TIMEOUT_MS', 7000);
}

function scramblePreviewTimeoutMs() {
  return positiveIntegerEnv('TRAIN_TIMER_SCRAMBLE_PREVIEW_TIMEOUT_MS', 5000);
}

function bootstrapSolveLimit() {
  return positiveIntegerEnv('TRAIN_TIMER_BOOTSTRAP_SOLVE_LIMIT', 80);
}

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function serverStatusPath() {
  return join(dirname(getHistoryPath()), 'server-status.json');
}

async function writeServerStatus(url, port) {
  const statusPath = serverStatusPath();
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, JSON.stringify({
    app: 'TrainTimer',
    host,
    port,
    url,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    runtimeRoot: projectRoot,
  }, null, 2));
}

function clearServerStatus() {
  try {
    rmSync(serverStatusPath(), { force: true });
  } catch {
    // Process shutdown should not be blocked by status cleanup.
  }
}

listen(requestedPort);
process.once('exit', () => {
  stopCubeCorrectionSolver();
  clearServerStatus();
});
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function shutdown() {
  stopCubeCorrectionSolver();
  clearServerStatus();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

function listen(port) {
  const handleError = (error) => {
    server.off('listening', handleListening);
    if (error.code === 'EADDRINUSE' && port < requestedPort + 20) {
      listen(port + 1);
      return;
    }
    throw error;
  };

  const handleListening = () => {
    server.off('error', handleError);
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    currentPort = actualPort;
    const url = `http://${host}:${actualPort}`;
    console.log(`TrainTimer web UI: ${url}`);
    console.log(`History file: ${getHistoryPath()}`);
    void writeServerStatus(url, actualPort);
  };

  server.once('error', handleError);
  server.once('listening', handleListening);
  server.listen(port, host);
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      app: 'TrainTimer',
      host,
      port: currentPort,
      url: `http://${host}:${currentPort}`,
      pid: process.pid,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    const puzzle = url.searchParams.get('puzzle') || undefined;
    const history = await loadHistoryForBootstrap(undefined, { limit: bootstrapSolveLimit() });
    const summarySolves = history.summarySolves || history.solves;
    if (url.searchParams.get('historyOnly') === '1') {
      sendJson(response, 200, {
        scramble: null,
        solves: bootstrapSolves(history.solves),
        sessions: history.sessions,
        summary: summarizeSolves(summarySolves),
        sessionSummaries: summarizeSolvesBySession(summarySolves),
        historyPartial: history.historyPartial === true,
        historyTotal: history.historyTotal ?? history.solves.length,
        historyPath: getHistoryPath(),
      });
      return;
    }

    const scramble = await generateScramble(puzzle, { timeoutMs: bootstrapScrambleTimeoutMs() });
    sendJson(response, 200, {
      scramble,
      solves: bootstrapSolves(history.solves),
      sessions: history.sessions,
      summary: summarizeSolves(summarySolves),
      sessionSummaries: summarizeSolvesBySession(summarySolves),
      historyPartial: history.historyPartial === true,
      historyTotal: history.historyTotal ?? history.solves.length,
      historyPath: getHistoryPath(),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scramble') {
    const body = await readJsonBody(request);
    sendJson(response, 200, { scramble: await generateScramble(body.puzzle, { timeoutMs: scrambleTimeoutMs() }) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scramble-preview') {
    const body = await readJsonBody(request);
    const preview = await drawScrambleSvg(body.scramble, body.puzzle, { timeoutMs: scramblePreviewTimeoutMs() });
    sendJson(response, 200, preview || { svg: null, source: 'local-js-preview' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/cube-correction/warmup') {
    sendJson(response, 200, await warmCubeCorrectionSolverOnce());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/cube-correction') {
    const body = await readJsonBody(request);
    const abortController = new AbortController();
    let completed = false;
    const abortCorrection = () => {
      if (!completed) abortController.abort();
    };
    request.once('aborted', abortCorrection);
    response.once('close', abortCorrection);
    try {
      const result = await solveCorrectionToScrambleTarget(
        body.target,
        body.facelets,
        {
          relativeFacelets: body.relativeFacelets,
          targetFacelets: body.targetFacelets,
          maxDepth: body.maxDepth,
          probeMax: body.probeMax,
          timeoutMs: body.timeoutMs,
          signal: abortController.signal,
        },
      );
      if (abortController.signal.aborted) return;
      completed = true;
      sendJson(response, 200, result);
    } catch (error) {
      if (abortController.signal.aborted || error?.name === 'AbortError') return;
      completed = true;
      sendJson(response, 400, { error: error.message || 'Unable to solve cube correction' });
    } finally {
      completed = true;
      request.off('aborted', abortCorrection);
      response.off('close', abortCorrection);
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/bluetooth/gan/requests') {
    const body = await readJsonBody(request);
    sendJson(response, 200, {
      requests: encodeGanBluetoothRequests({
        protocol: body.protocol,
        mac: body.mac,
        keyVersion: body.keyVersion,
      }),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/bluetooth/gan/decode') {
    const body = await readJsonBody(request);
    sendJson(response, 200, decodeGanBluetoothPacket({
      protocol: body.protocol,
      mac: body.mac,
      keyVersion: body.keyVersion,
      bytes: body.bytes,
    }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/solves') {
    const history = await loadHistory();
    sendJson(response, 200, {
      solves: history.solves,
      sessions: history.sessions,
      summary: summarizeSolves(history.solves),
      sessionSummaries: summarizeSolvesBySession(history.solves),
      historyPartial: false,
      historyTotal: history.solves.length,
      historyPath: getHistoryPath(),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readJsonBody(request);
    const result = await createSession(String(body.name || '新会话'), undefined, {
      scramblePuzzle: String(body.scramblePuzzle || 'three'),
      targetCount: body.targetCount,
    });
    sendJson(response, 201, {
      session: result.session,
      sessions: result.sessions,
      solves: result.solves,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/merge')) {
    const id = decodeURIComponent(url.pathname.slice('/api/sessions/'.length, -'/merge'.length));
    const body = await readJsonBody(request);
    const result = await mergeSession(id, String(body.targetSessionId || ''));
    if (!result) {
      sendJson(response, 400, { error: 'Session cannot be merged' });
      return;
    }

    sendJson(response, 200, {
      sourceSession: result.sourceSession,
      targetSession: result.targetSession,
      sessions: result.sessions,
      solves: result.solves,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/duplicate')) {
    const id = decodeURIComponent(url.pathname.slice('/api/sessions/'.length, -'/duplicate'.length));
    const body = await readJsonBody(request);
    const result = await duplicateSession(id, String(body.name || ''));
    if (!result) {
      sendJson(response, 404, { error: 'Session not found' });
      return;
    }

    sendJson(response, 201, {
      session: result.session,
      sessions: result.sessions,
      solves: result.solves,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/sessions/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/sessions/'.length));
    const body = await readJsonBody(request);
    const updates = {};
    if (Object.hasOwn(body, 'name')) updates.name = String(body.name || id);
    if (Object.hasOwn(body, 'scramblePuzzle')) updates.scramblePuzzle = String(body.scramblePuzzle || 'three');
    if (Object.hasOwn(body, 'targetCount')) updates.targetCount = body.targetCount;
    const result = await updateSession(id, updates);
    if (!result) {
      sendJson(response, 404, { error: 'Session not found' });
      return;
    }
    sendJson(response, 200, {
      session: result.session,
      sessions: result.sessions,
      solves: result.solves,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/sessions/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/sessions/'.length));
    const result = await deleteSession(id);
    if (!result) {
      sendJson(response, 400, { error: 'Default session cannot be deleted' });
      return;
    }

    sendJson(response, 200, {
      sessions: result.sessions,
      solves: result.solves,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/export') {
    const history = await loadHistory();
    const format = url.searchParams.get('format') || 'json';
    const scope = url.searchParams.get('scope') === 'session' ? 'session' : 'all';
    const sessionId = url.searchParams.get('sessionId') || 'default';
    const exportHistory = scopedExportHistory(history, scope, sessionId);
    const suffix = scope === 'session' ? `-${safeExportFilename(sessionId)}` : '';

    if (format === 'csv') {
      sendText(response, 200, solvesToCsv(exportHistory.solves, exportHistory.sessions), 'text/csv; charset=utf-8', {
        'Content-Disposition': `attachment; filename="traintimer-solves${suffix}.csv"`,
      });
      return;
    }

    if (format === 'cstimer') {
      sendText(response, 200, solvesToCstimerCsv(exportHistory.solves), 'text/csv; charset=utf-8', {
        'Content-Disposition': `attachment; filename="traintimer-cstimer${suffix}.csv"`,
      });
      return;
    }

    if (format === 'cstimer-json') {
      sendText(response, 200, solvesToCstimerJson(exportHistory.solves, exportHistory.sessions), 'application/json; charset=utf-8', {
        'Content-Disposition': `attachment; filename="traintimer-cstimer${suffix}.json"`,
      });
      return;
    }

    sendText(response, 200, `${JSON.stringify(createExportPayload(scope, exportHistory.sessions, exportHistory.solves), null, 2)}\n`, 'application/json; charset=utf-8', {
      'Content-Disposition': `attachment; filename="traintimer-solves${suffix}.json"`,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/solves') {
    const body = await readJsonBody(request);
    const durationMs = Number(body.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      sendJson(response, 400, { error: 'durationMs must be a non-negative number' });
      return;
    }
    const createdAt = Object.hasOwn(body, 'createdAt') ? new Date(body.createdAt) : new Date();
    if (!Number.isFinite(createdAt.getTime())) {
      sendJson(response, 400, { error: 'createdAt must be a valid date' });
      return;
    }

    const solve = {
      id: randomUUID(),
      createdAt: createdAt.toISOString(),
      timerStartedAt: typeof body.timerStartedAt === 'string' ? body.timerStartedAt : '',
      timerStartedAtMs: Number.isFinite(Number(body.timerStartedAtMs)) ? Math.max(0, Math.round(Number(body.timerStartedAtMs))) : null,
      timerFinishedAt: typeof body.timerFinishedAt === 'string' ? body.timerFinishedAt : '',
      timerFinishedAtMs: Number.isFinite(Number(body.timerFinishedAtMs)) ? Math.max(0, Math.round(Number(body.timerFinishedAtMs))) : null,
      durationMs: Math.round(durationMs),
      duration: formatTime(durationMs),
      scramble: String(body.scramble || ''),
      scrambleSource: String(body.scrambleSource || 'unknown'),
      scramblePuzzle: String(body.scramblePuzzle || 'three'),
      inspectionEnabled: Boolean(body.inspectionEnabled),
      sessionId: String(body.sessionId || 'default'),
      penalty: body.penalty,
      comment: typeof body.comment === 'string' ? body.comment : '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      timerSource: body.timerSource === 'bluetooth' ? 'bluetooth' : 'manual',
      bluetoothMoves: Array.isArray(body.bluetoothMoves) ? body.bluetoothMoves : [],
      bluetoothMoveLog: Array.isArray(body.bluetoothMoveLog) ? body.bluetoothMoveLog : [],
      bluetoothStateCorrections: Array.isArray(body.bluetoothStateCorrections) ? body.bluetoothStateCorrections : [],
      bluetoothSolvedByStatePacket: body.bluetoothSolvedByStatePacket === true,
      cfopStages: Array.isArray(body.cfopStages) ? body.cfopStages : [],
      opEvents: Array.isArray(body.opEvents) ? body.opEvents : [],
      bluetoothDeviceName: typeof body.bluetoothDeviceName === 'string' ? body.bluetoothDeviceName : '',
      bluetoothProtocols: Array.isArray(body.bluetoothProtocols) ? body.bluetoothProtocols : [],
      bluetoothSources: Array.isArray(body.bluetoothSources) ? body.bluetoothSources : [],
    };
    const solves = await saveSolve(solve);
    const savedSolve = solves.find((item) => item.id === solve.id) || solve;
    const history = await loadHistory();
    sendJson(response, 201, {
      solve: savedSolve,
      solves,
      sessions: history.sessions,
      summary: summarizeSolves(solves),
    });
    return;
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/solves/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/solves/'.length));
    const body = await readJsonBody(request);
    const updates = {};
    if (Object.hasOwn(body, 'durationMs')) {
      const durationMs = Number(body.durationMs);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        sendJson(response, 400, { error: 'durationMs must be a non-negative number' });
        return;
      }
      updates.durationMs = Math.round(durationMs);
      updates.duration = formatTime(durationMs);
    }
    if (Object.hasOwn(body, 'penalty')) updates.penalty = body.penalty;
    if (Object.hasOwn(body, 'scramble')) updates.scramble = String(body.scramble || '');
    if (Object.hasOwn(body, 'scrambleSource')) updates.scrambleSource = String(body.scrambleSource || '');
    if (Object.hasOwn(body, 'scramblePuzzle')) updates.scramblePuzzle = String(body.scramblePuzzle || 'three');
    if (Object.hasOwn(body, 'comment')) updates.comment = body.comment;
    if (Object.hasOwn(body, 'tags')) updates.tags = body.tags;
    if (Object.hasOwn(body, 'bluetoothDeviceName')) updates.bluetoothDeviceName = String(body.bluetoothDeviceName || '');
    if (Object.hasOwn(body, 'bluetoothMoveLog')) updates.bluetoothMoveLog = body.bluetoothMoveLog;
    if (Object.hasOwn(body, 'bluetoothStateCorrections')) updates.bluetoothStateCorrections = body.bluetoothStateCorrections;
    if (Object.hasOwn(body, 'cfopStages')) updates.cfopStages = body.cfopStages;
    if (Object.hasOwn(body, 'opEvents')) updates.opEvents = body.opEvents;
    if (Object.hasOwn(body, 'bluetoothProtocols')) updates.bluetoothProtocols = body.bluetoothProtocols;
    if (Object.hasOwn(body, 'bluetoothSources')) updates.bluetoothSources = body.bluetoothSources;
    if (Object.hasOwn(body, 'createdAt')) {
      const createdAt = new Date(body.createdAt);
      if (!Number.isFinite(createdAt.getTime())) {
        sendJson(response, 400, { error: 'createdAt must be a valid date' });
        return;
      }
      updates.createdAt = createdAt.toISOString();
    }
    if (Object.hasOwn(body, 'timerStartedAt')) updates.timerStartedAt = String(body.timerStartedAt || '');
    if (Object.hasOwn(body, 'timerFinishedAt')) updates.timerFinishedAt = String(body.timerFinishedAt || '');
    if (Object.hasOwn(body, 'timerStartedAtMs')) updates.timerStartedAtMs = Number.isFinite(Number(body.timerStartedAtMs)) ? Math.max(0, Math.round(Number(body.timerStartedAtMs))) : null;
    if (Object.hasOwn(body, 'timerFinishedAtMs')) updates.timerFinishedAtMs = Number.isFinite(Number(body.timerFinishedAtMs)) ? Math.max(0, Math.round(Number(body.timerFinishedAtMs))) : null;
    if (Object.hasOwn(body, 'sessionId')) updates.sessionId = String(body.sessionId || 'default');
    const result = await updateSolve(id, updates);

    if (!result) {
      sendJson(response, 404, { error: 'Solve not found' });
      return;
    }

    sendJson(response, 200, {
      solve: result.solve,
      solves: result.solves,
      sessions: result.sessions,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/solves/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/solves/'.length));
    const solves = await deleteSolves([id]);
    sendJson(response, 200, { solves, summary: summarizeSolves(solves) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/solves/delete') {
    const body = await readJsonBody(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const solves = await deleteSolves(ids);
    sendJson(response, 200, { solves, summary: summarizeSolves(solves) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/solves/update') {
    const body = await readJsonBody(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const updates = {};
    if (Object.hasOwn(body, 'penalty')) updates.penalty = body.penalty;
    if (Object.hasOwn(body, 'scramblePuzzle')) updates.scramblePuzzle = String(body.scramblePuzzle || 'three');
    if (Object.hasOwn(body, 'tags')) updates.tags = body.tags;
    if (Object.hasOwn(body, 'comment')) updates.comment = String(body.comment || '');
    const result = await updateSolves(ids, updates);
    sendJson(response, 200, {
      solves: result.solves,
      sessions: result.sessions,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/solves/move') {
    const body = await readJsonBody(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const sessionId = String(body.sessionId || 'default');
    const result = await moveSolves(ids, sessionId);
    sendJson(response, 200, {
      solves: result.solves,
      sessions: result.sessions,
      summary: summarizeSolves(result.solves),
    });
    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/api/solves') {
    const solves = await clearSolves();
    sendJson(response, 200, { solves, summary: summarizeSolves(solves) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/import') {
    const body = await readJsonBody(request);
    const incoming = Array.isArray(body.solves) ? body.solves : [];
    const incomingSessions = Array.isArray(body.sessions) ? body.sessions : [];
    const mode = body.mode === 'replace' ? 'replace' : 'append';
    const existing = mode === 'replace' ? { solves: [], sessions: [] } : await loadHistory();
    const solves = await replaceSolves([...existing.solves, ...incoming], undefined, [...existing.sessions, ...incomingSessions]);
    const history = await loadHistory();
    sendJson(response, 200, { solves, sessions: history.sessions, summary: summarizeSolves(solves), mode });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function summarizeSolvesBySession(solves) {
  const bySession = new Map();
  for (const solve of solves) {
    const sessionId = typeof solve.sessionId === 'string' && solve.sessionId ? solve.sessionId : 'default';
    if (!bySession.has(sessionId)) bySession.set(sessionId, []);
    bySession.get(sessionId).push(solve);
  }

  const summaries = {};
  for (const [sessionId, sessionSolves] of bySession) summaries[sessionId] = summarizeSolves(sessionSolves);
  if (!summaries.default) summaries.default = summarizeSolves([]);
  return summaries;
}

function bootstrapSolves(solves) {
  return solves.map((solve) => {
    const { bluetoothMoveLog, ...rest } = solve;
    return rest;
  });
}

async function warmCubeCorrectionSolverOnce() {
  if (!cubeCorrectionWarmupPromise) {
    const startedAt = performance.now();
    cubeCorrectionWarmupPromise = warmCubeCorrectionSolver()
      .then((warmed) => ({
        warmed,
        durationMs: performance.now() - startedAt,
      }))
      .finally(() => {
        cubeCorrectionWarmupPromise = null;
      });
  }
  return cubeCorrectionWarmupPromise;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const root = publicSrcModules.has(relativePath) ? srcRoot : publicRoot;
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { ...staticHeaders, 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, content, contentType, headers = {}) {
  response.writeHead(status, { ...corsHeaders, 'Content-Type': contentType, ...headers });
  response.end(content);
}
