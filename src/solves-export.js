import { countMoveSteps } from './move-metrics.js';

const exportColumns = [
  'id',
  'sessionId',
  'sessionName',
  'createdAt',
  'durationMs',
  'duration',
  'penalty',
  'effectiveDurationMs',
  'effectiveDuration',
  'scramble',
  'scrambleSource',
  'scramblePuzzle',
  'inspectionEnabled',
  'timerSource',
  'timerStartedAt',
  'timerStartedAtMs',
  'timerFinishedAt',
  'timerFinishedAtMs',
  'bluetoothMoves',
  'bluetoothMoveLog',
  'bluetoothMoveCount',
  'bluetoothTps',
  'bluetoothDeviceName',
  'bluetoothProtocols',
  'bluetoothSources',
  'cfopStages',
  'opEvents',
  'tags',
  'comment',
];

export function scopedExportHistory(history, scope, sessionId) {
  if (scope !== 'session') return history;
  const solves = history.solves.filter((solve) => solve.sessionId === sessionId);
  const sessions = history.sessions.filter((session) => session.id === sessionId);
  return {
    sessions: sessions.length > 0 ? sessions : [{ id: sessionId, name: sessionId }],
    solves,
  };
}

export function selectedExportHistory(solves, sessions, selectedIds) {
  const idSet = new Set(selectedIds);
  const selectedSolves = solves.filter((solve) => idSet.has(solve.id));
  return exportHistoryForSolves(selectedSolves, sessions);
}

export function exportHistoryForSolves(exportSolves, sessions) {
  return {
    sessions: sessionsForSolves(exportSolves, sessions),
    solves: exportSolves,
  };
}

export function createExportPayload(scope, sessions, solves, exportedAt = new Date().toISOString()) {
  return {
    version: 2,
    exportedAt,
    scope,
    sessions,
    solves,
  };
}

export function solvesToCsv(solves, sessions = []) {
  const sessionNames = new Map(sessions.map((session) => [session.id, session.name]));
  const rows = [
    exportColumns,
    ...solves.map((solve) => [
      solve.id,
      solve.sessionId,
      sessionNames.get(solve.sessionId) || solve.sessionId,
      solve.createdAt,
      solve.durationMs,
      solve.duration,
      solve.penalty,
      solve.effectiveDurationMs ?? '',
      solve.effectiveDuration,
      solve.scramble,
      solve.scrambleSource,
      solve.scramblePuzzle || 'three',
      solve.inspectionEnabled,
      solve.timerSource || 'manual',
      solve.timerStartedAt || '',
      solve.timerStartedAtMs ?? '',
      solve.timerFinishedAt || '',
      solve.timerFinishedAtMs ?? '',
      Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.join(' ') : '',
      structuredJsonCell(solve.bluetoothMoveLog),
      solve.bluetoothMoveCount ?? (Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.length : 0),
      solve.bluetoothTps ?? '',
      solve.bluetoothDeviceName || '',
      Array.isArray(solve.bluetoothProtocols) ? solve.bluetoothProtocols.join(';') : '',
      Array.isArray(solve.bluetoothSources) ? solve.bluetoothSources.join(';') : '',
      structuredJsonCell(solve.cfopStages),
      structuredJsonCell(solve.opEvents),
      Array.isArray(solve.tags) ? solve.tags.join(';') : '',
      solve.comment,
    ]),
  ];

  return `${rows.map((row) => row.map((value) => csvCell(value)).join(',')).join('\n')}\n`;
}

export function solvesToCstimerCsv(solves) {
  const rows = [
    ['No.', 'Time', 'Comment', 'Scramble', 'Date', 'P.1'],
    ...solves.map((solve, index) => [
      index + 1,
      cstimerTime(solve),
      solve.comment || '',
      solve.scramble || '',
      cstimerDate(solve.createdAt),
      '',
    ]),
  ];

  return `${rows.map((row) => row.map((value) => csvCell(value, ';')).join(';')).join('\n')}\n`;
}

export function solvesToCstimerJson(solves, sessions = []) {
  const exportSessions = sessionsForSolves(solves, sessions);
  const sessionData = {};
  const output = {};

  exportSessions.forEach((session, index) => {
    const sessionNumber = index + 1;
    const sessionSolves = solves
      .filter((solve) => (solve.sessionId || 'default') === session.id);
    const scramblePuzzle = session.scramblePuzzle || sessionSolves.find((solve) => solve.scramblePuzzle)?.scramblePuzzle || 'three';
    const cstimerSolves = sessionSolves
      .map((solve) => [
        [cstimerPenaltyFlag(solve), Math.max(0, Math.round(Number(solve.durationMs) || 0))],
        solve.scramble || '',
        solve.comment || '',
        cstimerTimestamp(solve.createdAt),
      ]);

    sessionData[String(sessionNumber)] = {
      name: session.name || session.id || `Session ${sessionNumber}`,
      scramblePuzzle,
      scrType: cstimerScrambleType(scramblePuzzle),
    };
    output[`session${sessionNumber}`] = JSON.stringify(cstimerSolves);
  });

  output.properties = JSON.stringify({
    sessionData: JSON.stringify(sessionData),
  });

  return `${JSON.stringify(output, null, 2)}\n`;
}

export function solvesToTextTable(solves, sessions = [], options = {}) {
  const sessionNames = new Map(sessions.map((session) => [session.id, session.name]));
  const title = options.title || 'TrainTimer 成绩列表';
  const scope = String(options.scope || '').trim();
  const exportedAt = options.exportedAt || new Date().toISOString();
  const metadataRows = [
    [title],
    scope ? [`范围: ${scope}`] : null,
    [`数量: ${solves.length}`],
    [`导出: ${exportedAt}`],
    [],
  ].filter((row) => row !== null);
  const rows = [
    ['#', '成绩', '罚时', '来源', '转动', 'TPS', '时间', '会话', '类型', '标签', '备注', '打乱'],
    ...solves.map((solve, index) => [
      index + 1,
      displaySolveTime(solve),
      penaltyLabel(solve.penalty),
      solve.timerSource === 'bluetooth' ? '蓝牙' : '手动',
      bluetoothMoveCount(solve),
      bluetoothTpsText(solve),
      solve.createdAt || '',
      sessionNames.get(solve.sessionId) || solve.sessionId || 'default',
      puzzleLabel(solve.scramblePuzzle || 'three'),
      Array.isArray(solve.tags) ? solve.tags.join(', ') : '',
      solve.comment || '',
      solve.scramble || '',
    ]),
  ];

  return `${[...metadataRows, ...rows].map((row) => row.map(textCell).join('\t')).join('\n')}\n`;
}

export function safeExportFilename(value) {
  return String(value).replaceAll(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'session';
}

function sessionsForSolves(solves, sessions) {
  const sessionIds = new Set(solves.map((solve) => solve.sessionId || 'default'));
  const knownSessions = sessions.filter((session) => sessionIds.has(session.id));
  const knownIds = new Set(knownSessions.map((session) => session.id));
  const missingSessions = [...sessionIds]
    .filter((id) => !knownIds.has(id))
    .map((id) => ({
      id,
      name: id,
      scramblePuzzle: solves.find((solve) => (solve.sessionId || 'default') === id)?.scramblePuzzle || 'three',
    }));
  return [...knownSessions, ...missingSessions];
}

function cstimerTime(solve) {
  const duration = solve.duration || formatMilliseconds(solve.durationMs);
  if (solve.penalty === 'dnf') return `DNF(${duration})`;
  if (solve.penalty === '+2') return `${duration}+`;
  return duration;
}

function cstimerDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ');
}

function cstimerTimestamp(value) {
  const date = new Date(value || Date.now());
  return Math.floor((Number.isNaN(date.getTime()) ? Date.now() : date.getTime()) / 1000);
}

function cstimerPenaltyFlag(solve) {
  if (solve.penalty === 'dnf') return -1;
  if (solve.penalty === '+2') return 2000;
  return 0;
}

function cstimerScrambleType(scramblePuzzle) {
  const map = new Map([
    ['two', '222'],
    ['three', '333'],
    ['four', '444'],
    ['five', '555'],
    ['six', '666'],
    ['seven', '777'],
    ['clock', 'clock'],
    ['skewb', 'skewb'],
    ['sq1', 'sq1'],
  ]);
  return map.get(scramblePuzzle) || '333';
}

function displaySolveTime(solve) {
  if (solve.penalty === 'dnf') return 'DNF';
  const rawMs = Math.max(0, Math.round(Number(solve.durationMs) || 0));
  if (solve.penalty === '+2') return `${formatMilliseconds(rawMs + 2000)}+`;
  return solve.duration || formatMilliseconds(rawMs);
}

function penaltyLabel(penalty) {
  if (penalty === '+2') return '+2';
  if (penalty === 'dnf') return 'DNF';
  return 'OK';
}

function bluetoothMoveCount(solve) {
  if (Number.isFinite(solve.bluetoothMoveCount)) return solve.bluetoothMoveCount;
  return Array.isArray(solve.bluetoothMoves) ? countMoveSteps(solve.bluetoothMoves) : '';
}

function bluetoothTpsText(solve) {
  return Number.isFinite(solve.bluetoothTps) ? solve.bluetoothTps.toFixed(3) : '';
}

function puzzleLabel(scramblePuzzle) {
  const map = new Map([
    ['two', '2x2'],
    ['three', '3x3'],
    ['four', '4x4'],
    ['five', '5x5'],
    ['six', '6x6'],
    ['seven', '7x7'],
    ['clock', 'Clock'],
    ['skewb', 'Skewb'],
    ['sq1', 'Square-1'],
  ]);
  return map.get(scramblePuzzle) || scramblePuzzle || '3x3';
}

function formatMilliseconds(value) {
  const ms = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  const secondText = minutes > 0 ? String(seconds).padStart(2, '0') : String(seconds);
  return `${minutes > 0 ? `${minutes}:` : ''}${secondText}.${String(milliseconds).padStart(3, '0')}`;
}

function csvCell(value, delimiter = ',') {
  const text = String(value ?? '');
  const pattern = new RegExp(`[${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\n]`);
  return pattern.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function structuredJsonCell(value) {
  return Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : '';
}

function textCell(value) {
  return String(value ?? '').replaceAll(/\s*\r?\n\s*/g, ' ').replaceAll('\t', ' ').trim();
}
