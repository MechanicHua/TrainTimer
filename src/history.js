import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { averageOfLast, bestAverageOf, bestMeanOf, meanOfLast } from './rolling-averages.js';

const defaultHistoryPath = join(homedir(), '.train-timer', 'solves.json');
const defaultSession = { id: 'default', name: '默认' };

export function getHistoryPath() {
  return process.env.TRAIN_TIMER_HISTORY || defaultHistoryPath;
}

export async function loadHistory(historyPath = getHistoryPath()) {
  try {
    const raw = await readFile(historyPath, 'utf8');
    return normalizeHistory(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeHistory({});
    throw error;
  }
}

export async function loadSolves(historyPath = getHistoryPath()) {
  return (await loadHistory(historyPath)).solves;
}

export async function loadSessions(historyPath = getHistoryPath()) {
  return (await loadHistory(historyPath)).sessions;
}

export async function saveSolve(solve, historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  const nextSolve = normalizeSolve(solve);
  const nextHistory = normalizeHistory({
    ...history,
    sessions: ensureSession(history.sessions, nextSolve.sessionId),
    solves: [...history.solves, nextSolve],
  });
  await writeHistory(nextHistory, historyPath);
  return nextHistory.solves;
}

export async function replaceSolves(solves, historyPath = getHistoryPath(), sessions = []) {
  const nextHistory = normalizeHistory({ sessions, solves });
  await writeHistory(nextHistory, historyPath);
  return nextHistory.solves;
}

export async function updateSolve(id, updates, historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  let updatedSolve = null;
  const nextSolves = history.solves.map((solve) => {
    if (solve.id !== id) return solve;
    updatedSolve = normalizeSolve({ ...solve, ...updates });
    return updatedSolve;
  });

  if (!updatedSolve) return null;
  const nextHistory = normalizeHistory({ ...history, solves: nextSolves });
  await writeHistory(nextHistory, historyPath);
  return { solve: updatedSolve, solves: nextHistory.solves, sessions: nextHistory.sessions };
}

export async function updateSolves(ids, updates, historyPath = getHistoryPath()) {
  const idSet = new Set(ids);
  const history = await loadHistory(historyPath);
  const nextHistory = normalizeHistory({
    ...history,
    solves: history.solves.map((solve) => (idSet.has(solve.id) ? { ...solve, ...updates } : solve)),
  });
  await writeHistory(nextHistory, historyPath);
  return { solves: nextHistory.solves, sessions: nextHistory.sessions };
}

export async function deleteSolves(ids, historyPath = getHistoryPath()) {
  const idSet = new Set(ids);
  const history = await loadHistory(historyPath);
  const nextHistory = normalizeHistory({
    ...history,
    solves: history.solves.filter((solve) => !idSet.has(solve.id)),
  });
  await writeHistory(nextHistory, historyPath);
  return nextHistory.solves;
}

export async function moveSolves(ids, sessionId, historyPath = getHistoryPath()) {
  const targetSessionId = typeof sessionId === 'string' && sessionId ? sessionId : defaultSession.id;
  const idSet = new Set(ids);
  const history = await loadHistory(historyPath);
  const nextHistory = normalizeHistory({
    ...history,
    sessions: ensureSession(history.sessions, targetSessionId),
    solves: history.solves.map((solve) => (idSet.has(solve.id) ? { ...solve, sessionId: targetSessionId } : solve)),
  });
  await writeHistory(nextHistory, historyPath);
  return { solves: nextHistory.solves, sessions: nextHistory.sessions };
}

export async function clearSolves(historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  await writeHistory({ ...history, solves: [] }, historyPath);
  return [];
}

export async function createSession(name, historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  const session = normalizeSession({ id: randomId('session'), name });
  const nextHistory = normalizeHistory({
    ...history,
    sessions: [...history.sessions, session],
  });
  await writeHistory(nextHistory, historyPath);
  return { session, sessions: nextHistory.sessions, solves: nextHistory.solves };
}

export async function duplicateSession(id, name, historyPath = getHistoryPath()) {
  const sourceSessionId = typeof id === 'string' && id ? id : defaultSession.id;
  const history = await loadHistory(historyPath);
  const sourceSession = history.sessions.find((session) => session.id === sourceSessionId);
  if (!sourceSession) return null;

  const session = normalizeSession({
    id: randomId('session'),
    name: typeof name === 'string' && name.trim() ? name : `${sourceSession.name} 副本`,
  });
  const copiedSolves = history.solves
    .filter((solve) => solve.sessionId === sourceSessionId)
    .map((solve) => ({
      ...solve,
      id: randomId('solve'),
      sessionId: session.id,
    }));
  const nextHistory = normalizeHistory({
    ...history,
    sessions: [...history.sessions, session],
    solves: [...history.solves, ...copiedSolves],
  });
  await writeHistory(nextHistory, historyPath);
  return { session, sessions: nextHistory.sessions, solves: nextHistory.solves };
}

export async function mergeSession(sourceId, targetId, historyPath = getHistoryPath()) {
  const sourceSessionId = typeof sourceId === 'string' && sourceId ? sourceId : defaultSession.id;
  const targetSessionId = typeof targetId === 'string' && targetId ? targetId : defaultSession.id;
  if (sourceSessionId === defaultSession.id || sourceSessionId === targetSessionId) return null;

  const history = await loadHistory(historyPath);
  const sourceSession = history.sessions.find((session) => session.id === sourceSessionId);
  const targetSession = history.sessions.find((session) => session.id === targetSessionId);
  if (!sourceSession || !targetSession) return null;

  const nextHistory = normalizeHistory({
    sessions: history.sessions.filter((session) => session.id !== sourceSessionId),
    solves: history.solves.map((solve) => (
      solve.sessionId === sourceSessionId ? { ...solve, sessionId: targetSessionId } : solve
    )),
  });
  await writeHistory(nextHistory, historyPath);
  return { sourceSession, targetSession, sessions: nextHistory.sessions, solves: nextHistory.solves };
}

export async function renameSession(id, name, historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  const sessions = history.sessions.map((session) => (session.id === id ? normalizeSession({ ...session, name }) : session));
  const nextHistory = normalizeHistory({ ...history, sessions });
  await writeHistory(nextHistory, historyPath);
  return { sessions: nextHistory.sessions, solves: nextHistory.solves };
}

export async function deleteSession(id, historyPath = getHistoryPath()) {
  if (id === defaultSession.id) return null;
  const history = await loadHistory(historyPath);
  const nextHistory = normalizeHistory({
    sessions: history.sessions.filter((session) => session.id !== id),
    solves: history.solves.filter((solve) => solve.sessionId !== id),
  });
  await writeHistory(nextHistory, historyPath);
  return { sessions: nextHistory.sessions, solves: nextHistory.solves };
}

export function normalizeSolve(solve) {
  const durationMs = Math.max(0, Math.round(Number(solve.durationMs) || 0));
  const penalty = ['ok', '+2', 'dnf'].includes(solve.penalty) ? solve.penalty : 'ok';
  const effectiveDurationMs = penalty === 'dnf' ? null : durationMs + (penalty === '+2' ? 2000 : 0);
  const effectiveDuration = effectiveDurationMs == null ? 'DNF' : formatTime(effectiveDurationMs);
  const bluetoothMoves = normalizeBluetoothMoves(solve.bluetoothMoves);
  const importedBluetoothMoveCount = Number(solve.bluetoothMoveCount);
  const bluetoothMoveCount = bluetoothMoves.length > 0
    ? bluetoothMoves.length
    : (Number.isFinite(importedBluetoothMoveCount) ? Math.max(0, Math.round(importedBluetoothMoveCount)) : 0);
  const bluetoothTpsText = String(solve.bluetoothTps ?? '').trim();
  const importedBluetoothTps = Number(bluetoothTpsText);
  const computedBluetoothTps = bluetoothMoveCount > 0 && durationMs > 0
    ? Math.round((bluetoothMoveCount / (durationMs / 1000)) * 1000) / 1000
    : null;
  const bluetoothTps = bluetoothTpsText && Number.isFinite(importedBluetoothTps)
    ? Math.max(0, importedBluetoothTps)
    : computedBluetoothTps;

  return {
    ...solve,
    id: typeof solve.id === 'string' && solve.id ? solve.id : randomId('solve'),
    durationMs,
    duration: solve.duration || formatTime(durationMs),
    penalty,
    effectiveDurationMs,
    effectiveDuration,
    scramble: typeof solve.scramble === 'string' ? solve.scramble : '',
    scrambleSource: typeof solve.scrambleSource === 'string' ? solve.scrambleSource : '',
    sessionId: typeof solve.sessionId === 'string' && solve.sessionId ? solve.sessionId : defaultSession.id,
    comment: typeof solve.comment === 'string' ? solve.comment : '',
    tags: normalizeTags(solve.tags),
    timerSource: solve.timerSource === 'bluetooth' ? 'bluetooth' : 'manual',
    bluetoothMoves,
    bluetoothMoveCount,
    bluetoothTps,
  };
}

export function normalizeTags(tags) {
  const rawTags = Array.isArray(tags)
    ? tags
    : String(tags || '').split(/[;,，；]/);
  const seen = new Set();
  const normalized = [];

  for (const tag of rawTags) {
    const value = String(tag || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeBluetoothMoves(moves) {
  const rawMoves = Array.isArray(moves)
    ? moves
    : String(moves || '').split(/[,\s;，；]+/);
  const normalized = [];

  for (const move of rawMoves) {
    const value = String(typeof move === 'object' && move ? move.move : move || '')
      .trim()
      .replace(/[’′`]/g, "'")
      .toUpperCase();
    if (/^[URFDLB](?:2|')?$/.test(value)) normalized.push(value);
  }

  return normalized;
}

export function formatTime(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  return `${seconds}.${String(millis).padStart(3, '0')}`;
}

export function summarizeSolves(solves) {
  if (solves.length === 0) {
    return {
      count: 0,
      validCount: 0,
      dnfCount: 0,
      plus2Count: 0,
      bluetoothSolveCount: 0,
      best: null,
      worst: null,
      latest: null,
      average: null,
      standardDeviation: null,
      averageBluetoothMoveCount: null,
      averageBluetoothTps: null,
      bestBluetoothTps: null,
      mo3: null,
      ao5: null,
      ao12: null,
      ao50: null,
      ao100: null,
      bestMo3: null,
      bestAo5: null,
      bestAo12: null,
      bestAo50: null,
      bestAo100: null,
    };
  }

  const normalized = solves.map(normalizeSolve);
  const dnfCount = normalized.filter((solve) => solve.penalty === 'dnf').length;
  const plus2Count = normalized.filter((solve) => solve.penalty === '+2').length;
  const bluetoothStats = summarizeBluetoothSolves(normalized);
  const times = normalized
    .map((solve) => solve.effectiveDurationMs)
    .filter((value) => Number.isFinite(value));
  const latestSolve = normalized.at(-1);

  if (times.length === 0) {
    return {
      count: normalized.length,
      validCount: 0,
      dnfCount,
      plus2Count,
      ...bluetoothStats,
      best: null,
      worst: null,
      latest: latestSolve?.effectiveDurationMs ?? null,
      average: null,
      standardDeviation: null,
      averageBluetoothMoveCount: bluetoothStats.averageBluetoothMoveCount,
      averageBluetoothTps: bluetoothStats.averageBluetoothTps,
      bestBluetoothTps: bluetoothStats.bestBluetoothTps,
      mo3: null,
      ao5: null,
      ao12: null,
      ao50: null,
      ao100: null,
      bestMo3: null,
      bestAo5: null,
      bestAo12: null,
      bestAo50: null,
      bestAo100: null,
    };
  }

  const total = times.reduce((sum, value) => sum + value, 0);
  const average = total / times.length;
  const variance = times.reduce((sum, value) => sum + (value - average) ** 2, 0) / times.length;

  return {
    count: normalized.length,
    validCount: times.length,
    dnfCount,
    plus2Count,
    ...bluetoothStats,
    best: Math.min(...times),
    worst: Math.max(...times),
    latest: latestSolve?.effectiveDurationMs ?? null,
    average,
    standardDeviation: Math.sqrt(variance),
    mo3: meanOfLast(normalized, 3),
    ao5: averageOfLast(normalized, 5),
    ao12: averageOfLast(normalized, 12),
    ao50: averageOfLast(normalized, 50),
    ao100: averageOfLast(normalized, 100),
    bestMo3: bestMeanOf(normalized, 3),
    bestAo5: bestAverageOf(normalized, 5),
    bestAo12: bestAverageOf(normalized, 12),
    bestAo50: bestAverageOf(normalized, 50),
    bestAo100: bestAverageOf(normalized, 100),
  };
}

function summarizeBluetoothSolves(solves) {
  const bluetoothSolves = solves.filter((solve) => Number.isFinite(solve.bluetoothMoveCount) && solve.bluetoothMoveCount > 0);
  const moveCounts = bluetoothSolves.map((solve) => solve.bluetoothMoveCount);
  const tpsValues = bluetoothSolves.map((solve) => solve.bluetoothTps).filter((value) => Number.isFinite(value));

  return {
    bluetoothSolveCount: bluetoothSolves.length,
    averageBluetoothMoveCount: moveCounts.length > 0 ? averageNumber(moveCounts) : null,
    averageBluetoothTps: tpsValues.length > 0 ? averageNumber(tpsValues) : null,
    bestBluetoothTps: tpsValues.length > 0 ? Math.max(...tpsValues) : null,
  };
}

function averageNumber(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeHistory(history) {
  const rawSolves = Array.isArray(history.solves) ? history.solves : [];
  const usedSolveIds = new Set();
  const solves = rawSolves.map((solve) => dedupeSolveId(normalizeSolve(solve), usedSolveIds));
  const sessionMap = new Map();
  sessionMap.set(defaultSession.id, defaultSession);

  for (const session of Array.isArray(history.sessions) ? history.sessions : []) {
    const normalized = normalizeSession(session);
    sessionMap.set(normalized.id, normalized);
  }

  for (const solve of solves) {
    if (!sessionMap.has(solve.sessionId)) {
      sessionMap.set(solve.sessionId, normalizeSession({ id: solve.sessionId, name: solve.sessionId }));
    }
  }

  return {
    version: 2,
    sessions: [...sessionMap.values()],
    solves,
  };
}

function normalizeSession(session) {
  const id = typeof session.id === 'string' && session.id ? session.id : randomId('session');
  const name = typeof session.name === 'string' && session.name.trim() ? session.name.trim() : id;
  return { id, name };
}

function dedupeSolveId(solve, usedIds) {
  if (!usedIds.has(solve.id)) {
    usedIds.add(solve.id);
    return solve;
  }

  let suffix = 2;
  let nextId = `${solve.id}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${solve.id}-${suffix}`;
  }

  usedIds.add(nextId);
  return { ...solve, id: nextId };
}

function ensureSession(sessions, sessionId) {
  if (sessions.some((session) => session.id === sessionId)) return sessions;
  return [...sessions, normalizeSession({ id: sessionId, name: sessionId })];
}

async function writeHistory(history, historyPath) {
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(
    historyPath,
    `${JSON.stringify(normalizeHistory(history), null, 2)}\n`,
    'utf8',
  );
}

function randomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
