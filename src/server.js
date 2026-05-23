#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { drawScrambleSvg, generateScramble } from './scramble.js';
import {
  clearSolves,
  createSession,
  deleteSolves,
  deleteSession,
  duplicateSession,
  formatTime,
  getHistoryPath,
  loadHistory,
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
const publicSrcModules = new Set(['bluetooth-moves.js', 'cube-state.js', 'rolling-averages.js', 'solve-summary.js', 'solves-export.js', 'solves-import.js', 'stats-summary.js']);
const requestedPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  try {
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

listen(requestedPort);

function listen(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < requestedPort + 20) {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(`TrainTimer web UI: ${url}`);
    console.log(`History file: ${getHistoryPath()}`);
  });
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    const puzzle = url.searchParams.get('puzzle') || undefined;
    const [history, scramble] = await Promise.all([loadHistory(), generateScramble(puzzle)]);
    sendJson(response, 200, {
      scramble,
      solves: history.solves,
      sessions: history.sessions,
      summary: summarizeSolves(history.solves),
      historyPath: getHistoryPath(),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scramble') {
    const body = await readJsonBody(request);
    sendJson(response, 200, { scramble: await generateScramble(body.puzzle) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scramble-preview') {
    const body = await readJsonBody(request);
    const preview = await drawScrambleSvg(body.scramble, body.puzzle);
    sendJson(response, 200, preview || { svg: null, source: 'local-js-preview' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/solves') {
    const history = await loadHistory();
    sendJson(response, 200, {
      solves: history.solves,
      sessions: history.sessions,
      summary: summarizeSolves(history.solves),
      historyPath: getHistoryPath(),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readJsonBody(request);
    const result = await createSession(String(body.name || '新会话'), undefined, {
      scramblePuzzle: String(body.scramblePuzzle || 'three'),
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

    const solve = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
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
    if (Object.hasOwn(body, 'createdAt')) {
      const createdAt = new Date(body.createdAt);
      if (!Number.isFinite(createdAt.getTime())) {
        sendJson(response, 400, { error: 'createdAt must be a valid date' });
        return;
      }
      updates.createdAt = createdAt.toISOString();
    }
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
    if (Object.hasOwn(body, 'tags')) updates.tags = body.tags;
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

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const root = publicSrcModules.has(relativePath) ? srcRoot : publicRoot;
  const filePath = normalize(join(root, publicSrcModules.has(relativePath) ? relativePath : relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
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
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, content, contentType, headers = {}) {
  response.writeHead(status, { 'Content-Type': contentType, ...headers });
  response.end(content);
}
