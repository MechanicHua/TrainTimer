import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { countMoveSteps } from './move-metrics.js';
import { averageOfLast, bestAverageOf, bestMeanOf, chronologicalSolves, meanOfLast } from './rolling-averages.js';

const defaultHistoryPath = join(homedir(), '.train-timer', 'solves.json');
const defaultSession = { id: 'default', name: '默认', scramblePuzzle: 'three', targetCount: null };

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

export async function loadHistoryForBootstrap(historyPath = getHistoryPath(), options = {}) {
  try {
    const raw = await readFile(historyPath, 'utf8');
    return normalizeHistoryForBootstrap(JSON.parse(raw), options);
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeHistoryForBootstrap({}, options);
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

export async function createSession(name, historyPath = getHistoryPath(), options = {}) {
  const history = await loadHistory(historyPath);
  const session = normalizeSession({
    id: randomId('session'),
    name,
    scramblePuzzle: options.scramblePuzzle,
    targetCount: options.targetCount,
  });
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
    scramblePuzzle: sourceSession.scramblePuzzle,
    targetCount: sourceSession.targetCount,
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
  return updateSession(id, { name }, historyPath);
}

export async function updateSession(id, updates, historyPath = getHistoryPath()) {
  const history = await loadHistory(historyPath);
  let updatedSession = null;
  const sessions = history.sessions.map((session) => {
    if (session.id !== id) return session;
    updatedSession = normalizeSession({ ...session, ...updates });
    return updatedSession;
  });
  if (!updatedSession) return null;
  const nextHistory = normalizeHistory({ ...history, sessions });
  await writeHistory(nextHistory, historyPath);
  return { session: updatedSession, sessions: nextHistory.sessions, solves: nextHistory.solves };
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
  const bluetoothMoveLog = normalizeBluetoothMoveLog(solve.bluetoothMoveLog, bluetoothMoves);
  const bluetoothStateCorrections = normalizeBluetoothStateCorrections(solve.bluetoothStateCorrections);
  const bluetoothStateLog = normalizeBluetoothStateLog(solve.bluetoothStateLog);
  const importedBluetoothMoveCount = Number(solve.bluetoothMoveCount);
  const bluetoothMoveCount = bluetoothMoves.length > 0
    ? countMoveSteps(bluetoothMoves)
    : (Number.isFinite(importedBluetoothMoveCount) ? Math.max(0, Math.round(importedBluetoothMoveCount)) : 0);
  const bluetoothTpsText = String(solve.bluetoothTps ?? '').trim();
  const importedBluetoothTps = Number(bluetoothTpsText);
  const computedBluetoothTps = bluetoothMoveCount > 0 && durationMs > 0
    ? Math.round((bluetoothMoveCount / (durationMs / 1000)) * 1000) / 1000
    : null;
  const bluetoothTps = bluetoothTpsText && Number.isFinite(importedBluetoothTps)
    ? Math.max(0, importedBluetoothTps)
    : computedBluetoothTps;
  const cfopStages = normalizeCfopStages(solve.cfopStages);
  const opEvents = normalizeOpEvents(solve.opEvents);
  const cfopAnalysisVersion = normalizedAnalysisVersion(solve.cfopAnalysisVersion, cfopStages);
  const opAnalysisVersion = normalizedAnalysisVersion(solve.opAnalysisVersion, opEvents);
  const timerStartedAtMs = Number(solve.timerStartedAtMs);
  const timerFinishedAtMs = Number(solve.timerFinishedAtMs);

  return {
    ...solve,
    id: typeof solve.id === 'string' && solve.id ? solve.id : randomId('solve'),
    durationMs,
    duration: solve.duration || formatTime(durationMs),
    timerStartedAt: typeof solve.timerStartedAt === 'string' ? solve.timerStartedAt : '',
    timerStartedAtMs: Number.isFinite(timerStartedAtMs) ? Math.max(0, Math.round(timerStartedAtMs)) : null,
    timerFinishedAt: typeof solve.timerFinishedAt === 'string' ? solve.timerFinishedAt : '',
    timerFinishedAtMs: Number.isFinite(timerFinishedAtMs) ? Math.max(0, Math.round(timerFinishedAtMs)) : null,
    penalty,
    effectiveDurationMs,
    effectiveDuration,
    scramble: typeof solve.scramble === 'string' ? solve.scramble : '',
    scrambleSource: typeof solve.scrambleSource === 'string' ? solve.scrambleSource : '',
    scramblePuzzle: typeof solve.scramblePuzzle === 'string' && solve.scramblePuzzle ? solve.scramblePuzzle : 'three',
    sessionId: typeof solve.sessionId === 'string' && solve.sessionId ? solve.sessionId : defaultSession.id,
    comment: typeof solve.comment === 'string' ? solve.comment : '',
    tags: normalizeTags(solve.tags),
    timerSource: solve.timerSource === 'bluetooth' ? 'bluetooth' : 'manual',
    bluetoothMoves,
    bluetoothMoveLog,
    bluetoothStateCorrections,
    bluetoothStateLog,
    bluetoothSolvedByStatePacket: solve.bluetoothSolvedByStatePacket === true,
    cfopStages,
    cfopAnalysisVersion,
    opEvents,
    opAnalysisVersion,
    bluetoothMoveCount,
    bluetoothTps,
    bluetoothDeviceName: typeof solve.bluetoothDeviceName === 'string' ? solve.bluetoothDeviceName : '',
    bluetoothProtocols: normalizeStringList(solve.bluetoothProtocols),
    bluetoothSources: normalizeStringList(solve.bluetoothSources),
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
    if (/^[URFDLBMES](?:2|')?$/.test(value)) normalized.push(value);
  }

  return normalized;
}

function normalizeBluetoothMoveLog(moveLog, fallbackMoves = []) {
  const rawEntries = Array.isArray(moveLog) ? moveLog : [];
  const entries = rawEntries
    .map((entry, index) => normalizeBluetoothMoveLogEntry(entry, index))
    .filter(Boolean);

  if (entries.length > 0) return entries.map((entry, index) => ({ ...entry, step: index + 1 }));

  return fallbackMoves.map((move, index) => ({
    step: index + 1,
    move,
    source: '',
    protocol: '',
    deviceName: '',
    time: '',
    isoTime: '',
    elapsedMs: null,
  }));
}

function normalizeBluetoothMoveLogEntry(entry, index) {
  const move = normalizeBluetoothMoves([entry])[0];
  if (!move) return null;
  const elapsedMs = Number(entry?.elapsedMs);
  const timestampMs = Number(entry?.timestampMs);
  const solveStartedAtMs = Number(entry?.solveStartedAtMs);
  return {
    step: Number.isFinite(Number(entry?.step)) ? Math.max(1, Math.round(Number(entry.step))) : index + 1,
    move,
    source: typeof entry?.source === 'string' ? entry.source : '',
    protocol: typeof entry?.protocol === 'string' ? entry.protocol : '',
    deviceName: typeof entry?.deviceName === 'string' ? entry.deviceName : '',
    time: typeof entry?.time === 'string' ? entry.time : '',
    isoTime: typeof entry?.isoTime === 'string' ? entry.isoTime : '',
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null,
    timestampMs: Number.isFinite(timestampMs) ? Math.max(0, Math.round(timestampMs)) : null,
    solveStartedAtMs: Number.isFinite(solveStartedAtMs) ? Math.max(0, Math.round(solveStartedAtMs)) : null,
    solveStartedAtIsoTime: typeof entry?.solveStartedAtIsoTime === 'string' ? entry.solveStartedAtIsoTime : '',
  };
}

function normalizeBluetoothStateCorrections(corrections) {
  if (!Array.isArray(corrections)) return [];
  return corrections
    .map(normalizeBluetoothStateCorrection)
    .filter(Boolean)
    .map((entry, index) => ({ ...entry, index: index + 1 }));
}

function normalizeBluetoothStateCorrection(entry) {
  const facelets = normalizeFacelets(entry?.facelets);
  if (!facelets) return null;
  const step = Number(entry?.step);
  const elapsedMs = Number(entry?.elapsedMs);
  const timestampMs = Number(entry?.timestampMs);
  const moveCounter = Number(entry?.moveCounter);
  return {
    step: Number.isFinite(step) ? Math.max(0, Math.round(step)) : 0,
    facelets,
    solved: entry?.solved === true,
    source: typeof entry?.source === 'string' ? entry.source : '',
    protocol: typeof entry?.protocol === 'string' ? entry.protocol : '',
    deviceName: typeof entry?.deviceName === 'string' ? entry.deviceName : '',
    reason: typeof entry?.reason === 'string' ? entry.reason : '',
    stateSignature: typeof entry?.stateSignature === 'string' ? entry.stateSignature : '',
    moveCounter: Number.isFinite(moveCounter) ? Math.max(0, Math.round(moveCounter)) : null,
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null,
    timestampMs: Number.isFinite(timestampMs) ? Math.max(0, Math.round(timestampMs)) : null,
    isoTime: typeof entry?.isoTime === 'string' ? entry.isoTime : '',
  };
}

function normalizeBluetoothStateLog(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(normalizeBluetoothStateLogEntry)
    .filter(Boolean)
    .map((entry, index) => ({ ...entry, index: index + 1 }));
}

function normalizeBluetoothStateLogEntry(entry) {
  const facelets = normalizeFacelets(entry?.facelets);
  const step = Number(entry?.step);
  const elapsedMs = Number(entry?.elapsedMs);
  const timestampMs = Number(entry?.timestampMs);
  const solveStartedAtMs = Number(entry?.solveStartedAtMs);
  const moveCounter = Number(entry?.moveCounter);
  const counterModulo = Number(entry?.counterModulo);
  const moves = normalizeBluetoothMoves(entry?.moves);
  const hasPacketPayload = facelets
    || typeof entry?.raw === 'string'
    || typeof entry?.stateSignature === 'string'
    || entry?.stateSolved === true
    || entry?.stateSolved === false
    || Number.isFinite(moveCounter);
  if (!hasPacketPayload) return null;

  return {
    step: Number.isFinite(step) ? Math.max(0, Math.round(step)) : 0,
    facelets,
    solved: entry?.solved === true,
    trustedSolved: entry?.trustedSolved === true,
    stateSolved: entry?.stateSolved === true ? true : (entry?.stateSolved === false ? false : null),
    stateSolvedUntrusted: entry?.stateSolvedUntrusted === true,
    source: typeof entry?.source === 'string' ? entry.source : '',
    protocol: typeof entry?.protocol === 'string' ? entry.protocol : '',
    deviceName: typeof entry?.deviceName === 'string' ? entry.deviceName : '',
    characteristicUuid: typeof entry?.characteristicUuid === 'string' ? entry.characteristicUuid : '',
    mode: typeof entry?.mode === 'string' ? entry.mode : '',
    stateSignature: typeof entry?.stateSignature === 'string' ? entry.stateSignature : '',
    moveCounter: Number.isFinite(moveCounter) ? Math.max(0, Math.round(moveCounter)) : null,
    counterModulo: Number.isFinite(counterModulo) ? Math.max(0, Math.round(counterModulo)) : null,
    raw: typeof entry?.raw === 'string' ? entry.raw : '',
    moves,
    duplicateMovePacket: entry?.duplicateMovePacket === true,
    physicalStateChanged: entry?.physicalStateChanged === true,
    time: typeof entry?.time === 'string' ? entry.time : '',
    isoTime: typeof entry?.isoTime === 'string' ? entry.isoTime : '',
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null,
    timestampMs: Number.isFinite(timestampMs) ? Math.max(0, Math.round(timestampMs)) : null,
    solveStartedAtMs: Number.isFinite(solveStartedAtMs) ? Math.max(0, Math.round(solveStartedAtMs)) : null,
    solveStartedAtIsoTime: typeof entry?.solveStartedAtIsoTime === 'string' ? entry.solveStartedAtIsoTime : '',
  };
}

function normalizeCfopStages(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.map((stage) => {
    const turns = Number(stage?.turns);
    const durationMs = Number(stage?.durationMs);
    const tps = Number(stage?.tps);
    const completedAt = Number(stage?.completedAt);
    const startStep = Number(stage?.startStep);
    const endStep = Number(stage?.endStep);
    const physicalCompletedAt = Number(stage?.physicalCompletedAt);
    const physicalStartStep = Number(stage?.physicalStartStep);
    const physicalEndStep = Number(stage?.physicalEndStep);
    const physicalTurns = Number(stage?.physicalTurns);
    const startedAtElapsedMs = Number(stage?.startedAtElapsedMs);
    const firstMoveElapsedMs = Number(stage?.firstMoveElapsedMs);
    const completedAtElapsedMs = Number(stage?.completedAtElapsedMs);
    const observationMs = Number(stage?.observationMs);
    const startedAtTimestampMs = Number(stage?.startedAtTimestampMs);
    const firstMoveTimestampMs = Number(stage?.firstMoveTimestampMs);
    const completedAtTimestampMs = Number(stage?.completedAtTimestampMs);
    return {
      key: typeof stage?.key === 'string' ? stage.key : '',
      label: typeof stage?.label === 'string' ? stage.label : '',
      name: typeof stage?.name === 'string' ? stage.name : '',
      completed: Boolean(stage?.completed),
      completedAt: Number.isFinite(completedAt) ? Math.max(0, Math.round(completedAt)) : null,
      startStep: Number.isFinite(startStep) ? Math.max(0, Math.round(startStep)) : null,
      endStep: Number.isFinite(endStep) ? Math.max(0, Math.round(endStep)) : null,
      turns: Number.isFinite(turns) ? Math.max(0, Math.round(turns)) : 0,
      physicalCompletedAt: Number.isFinite(physicalCompletedAt) ? Math.max(0, Math.round(physicalCompletedAt)) : null,
      physicalStartStep: Number.isFinite(physicalStartStep) ? Math.max(0, Math.round(physicalStartStep)) : null,
      physicalEndStep: Number.isFinite(physicalEndStep) ? Math.max(0, Math.round(physicalEndStep)) : null,
      physicalTurns: Number.isFinite(physicalTurns) ? Math.max(0, Math.round(physicalTurns)) : null,
      stateTransitionObserved: stage?.stateTransitionObserved === true,
      unobservedTurns: stage?.unobservedTurns === true,
      completionSource: typeof stage?.completionSource === 'string' ? stage.completionSource : '',
      skipped: stage?.skipped === true,
      skipAdjustment: typeof stage?.skipAdjustment === 'string' ? stage.skipAdjustment : '',
      analysisVersion: normalizedAnalysisVersion(stage?.analysisVersion),
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
      tps: Number.isFinite(tps) ? Math.max(0, tps) : null,
      startedAtElapsedMs: Number.isFinite(startedAtElapsedMs) ? Math.max(0, Math.round(startedAtElapsedMs)) : null,
      firstMoveElapsedMs: Number.isFinite(firstMoveElapsedMs) ? Math.max(0, Math.round(firstMoveElapsedMs)) : null,
      completedAtElapsedMs: Number.isFinite(completedAtElapsedMs) ? Math.max(0, Math.round(completedAtElapsedMs)) : null,
      observationMs: Number.isFinite(observationMs) ? Math.max(0, Math.round(observationMs)) : null,
      startedAtTimestampMs: Number.isFinite(startedAtTimestampMs) ? Math.max(0, Math.round(startedAtTimestampMs)) : null,
      firstMoveTimestampMs: Number.isFinite(firstMoveTimestampMs) ? Math.max(0, Math.round(firstMoveTimestampMs)) : null,
      completedAtTimestampMs: Number.isFinite(completedAtTimestampMs) ? Math.max(0, Math.round(completedAtTimestampMs)) : null,
      startedAtIsoTime: typeof stage?.startedAtIsoTime === 'string' ? stage.startedAtIsoTime : '',
      firstMoveIsoTime: typeof stage?.firstMoveIsoTime === 'string' ? stage.firstMoveIsoTime : '',
      completedAtIsoTime: typeof stage?.completedAtIsoTime === 'string' ? stage.completedAtIsoTime : '',
    };
  }).filter((stage) => stage.label || stage.name);
}

function normalizeOpEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => {
    const matchCount = optionalNumber(event?.matchCount);
    const startStep = optionalNumber(event?.startStep);
    const endStep = optionalNumber(event?.endStep);
    const completedAt = optionalNumber(event?.completedAt);
    const turns = optionalNumber(event?.turns);
    const durationMs = optionalNumber(event?.durationMs);
    const observationMs = optionalNumber(event?.observationMs);
    const tps = optionalNumber(event?.tps);
    const startedAtElapsedMs = optionalNumber(event?.startedAtElapsedMs);
    const firstMoveElapsedMs = optionalNumber(event?.firstMoveElapsedMs);
    const completedAtElapsedMs = optionalNumber(event?.completedAtElapsedMs);
    const startedAtTimestampMs = optionalNumber(event?.startedAtTimestampMs);
    const firstMoveTimestampMs = optionalNumber(event?.firstMoveTimestampMs);
    const completedAtTimestampMs = optionalNumber(event?.completedAtTimestampMs);
    return {
      kind: ['oll', 'pll'].includes(event?.kind) ? event.kind : '',
      caseId: typeof event?.caseId === 'string' ? event.caseId : '',
      name: typeof event?.name === 'string' ? event.name : '',
      group: typeof event?.group === 'string' ? event.group : '',
      algorithm: typeof event?.algorithm === 'string' ? event.algorithm : '',
      pdfLabel: typeof event?.pdfLabel === 'string' ? event.pdfLabel : '',
      source: typeof event?.source === 'string' ? event.source : '',
      confidence: typeof event?.confidence === 'string' ? event.confidence : '',
      matchCount: matchCount != null ? Math.max(0, Math.round(matchCount)) : 0,
      startStep: startStep != null ? Math.max(0, Math.round(startStep)) : null,
      endStep: endStep != null ? Math.max(0, Math.round(endStep)) : null,
      completedAt: completedAt != null ? Math.max(0, Math.round(completedAt)) : null,
      turns: turns != null ? Math.max(0, Math.round(turns)) : 0,
      durationMs: durationMs != null ? Math.max(0, Math.round(durationMs)) : null,
      observationMs: observationMs != null ? Math.max(0, Math.round(observationMs)) : null,
      tps: tps != null ? Math.max(0, tps) : null,
      moves: normalizeBluetoothMoves(event?.moves),
      startedAtElapsedMs: startedAtElapsedMs != null ? Math.max(0, Math.round(startedAtElapsedMs)) : null,
      firstMoveElapsedMs: firstMoveElapsedMs != null ? Math.max(0, Math.round(firstMoveElapsedMs)) : null,
      completedAtElapsedMs: completedAtElapsedMs != null ? Math.max(0, Math.round(completedAtElapsedMs)) : null,
      startedAtTimestampMs: startedAtTimestampMs != null ? Math.max(0, Math.round(startedAtTimestampMs)) : null,
      firstMoveTimestampMs: firstMoveTimestampMs != null ? Math.max(0, Math.round(firstMoveTimestampMs)) : null,
      completedAtTimestampMs: completedAtTimestampMs != null ? Math.max(0, Math.round(completedAtTimestampMs)) : null,
      startedAtIsoTime: typeof event?.startedAtIsoTime === 'string' ? event.startedAtIsoTime : '',
      firstMoveIsoTime: typeof event?.firstMoveIsoTime === 'string' ? event.firstMoveIsoTime : '',
      completedAtIsoTime: typeof event?.completedAtIsoTime === 'string' ? event.completedAtIsoTime : '',
      startFacelets: normalizeFacelets(event?.startFacelets),
      signature: typeof event?.signature === 'string' ? event.signature : '',
      formulaAccepted: event?.formulaAccepted === true,
      formulaReason: typeof event?.formulaReason === 'string' ? event.formulaReason : '',
      recoveredFromStateLog: event?.recoveredFromStateLog === true,
      analysisVersion: normalizedAnalysisVersion(event?.analysisVersion),
      moveTimings: normalizeOpMoveTimings(event?.moveTimings),
    };
  }).filter((event) => event.kind && event.caseId);
}

function normalizedAnalysisVersion(value, items = []) {
  const version = Number(value);
  if (Number.isFinite(version)) return Math.max(0, Math.round(version));
  return (Array.isArray(items) ? items : []).reduce((highest, item) => {
    const itemVersion = Number(item?.analysisVersion);
    return Number.isFinite(itemVersion) ? Math.max(highest, Math.max(0, Math.round(itemVersion))) : highest;
  }, 0);
}

function normalizeOpMoveTimings(moveTimings) {
  if (!Array.isArray(moveTimings)) return [];
  return moveTimings.map((entry, index) => {
    const move = normalizeBluetoothMoves([entry])[0];
    if (!move) return null;
    const step = optionalNumber(entry?.step);
    const elapsedMs = optionalNumber(entry?.elapsedMs);
    const deltaMs = optionalNumber(entry?.deltaMs);
    const timestampMs = optionalNumber(entry?.timestampMs);
    return {
      step: step != null ? Math.max(1, Math.round(step)) : index + 1,
      move,
      elapsedMs: elapsedMs != null ? Math.max(0, Math.round(elapsedMs)) : null,
      deltaMs: deltaMs != null ? Math.max(0, Math.round(deltaMs)) : null,
      timestampMs: timestampMs != null ? Math.max(0, Math.round(timestampMs)) : null,
      isoTime: typeof entry?.isoTime === 'string' ? entry.isoTime : '',
    };
  }).filter(Boolean);
}

function normalizeFacelets(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[URFDLB]{54}$/.test(text) ? text : '';
}

function optionalNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStringList(values) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values || '').split(/[;,，；]/);
  const seen = new Set();
  const normalized = [];

  for (const value of rawValues) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
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

  const normalized = chronologicalSolves(solves.map(normalizeSolve));
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

export function normalizeHistoryForBootstrap(history, options = {}) {
  const rawSolves = Array.isArray(history.solves) ? history.solves : [];
  const limit = Math.max(0, Math.round(Number(options.limit) || 0));
  const recentRawSolves = limit > 0 ? rawSolves.slice(-limit) : rawSolves;
  const usedSummarySolveIds = new Set();
  const usedRecentSolveIds = new Set();
  const summarySolves = rawSolves
    .map(stripHeavySolveForBootstrap)
    .map((solve) => dedupeSolveId(normalizeSolve(solve), usedSummarySolveIds));
  const solves = recentRawSolves
    .map(stripHeavySolveForBootstrap)
    .map((solve) => dedupeSolveId(normalizeSolve(solve), usedRecentSolveIds));
  const sessionMap = new Map();
  sessionMap.set(defaultSession.id, defaultSession);

  for (const session of Array.isArray(history.sessions) ? history.sessions : []) {
    const normalized = normalizeSession(session);
    sessionMap.set(normalized.id, normalized);
  }

  for (const solve of summarySolves) {
    if (!sessionMap.has(solve.sessionId)) {
      sessionMap.set(solve.sessionId, normalizeSession({ id: solve.sessionId, name: solve.sessionId }));
    }
  }

  return {
    version: 2,
    sessions: [...sessionMap.values()],
    solves,
    summarySolves,
    historyPartial: solves.length < summarySolves.length,
    historyTotal: summarySolves.length,
  };
}

function stripHeavySolveForBootstrap(solve = {}) {
  const {
    bluetoothMoveLog,
    bluetoothMoves,
    bluetoothStateCorrections,
    bluetoothStateLog,
    bluetoothMoveCount,
    ...rest
  } = solve || {};
  const importedBluetoothMoveCount = Number(bluetoothMoveCount);
  const normalizedBluetoothMoves = Number.isFinite(importedBluetoothMoveCount)
    ? []
    : normalizeBluetoothMoves(bluetoothMoves);
  const lightweightBluetoothMoveCount = Number.isFinite(importedBluetoothMoveCount)
    ? Math.max(0, Math.round(importedBluetoothMoveCount))
    : countMoveSteps(normalizedBluetoothMoves);

  return {
    ...rest,
    bluetoothMoves: [],
    bluetoothMoveCount: lightweightBluetoothMoveCount,
  };
}

function normalizeSession(session) {
  const id = typeof session.id === 'string' && session.id ? session.id : randomId('session');
  const name = typeof session.name === 'string' && session.name.trim() ? session.name.trim() : id;
  const scramblePuzzle = typeof session.scramblePuzzle === 'string' && session.scramblePuzzle
    ? session.scramblePuzzle
    : 'three';
  const targetCount = normalizeSessionTargetCount(session.targetCount);
  return { id, name, scramblePuzzle, targetCount };
}

function normalizeSessionTargetCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0 || count > 9999) return null;
  return count;
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
