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
  'inspectionEnabled',
  'timerSource',
  'bluetoothMoves',
  'bluetoothMoveCount',
  'bluetoothTps',
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
      solve.inspectionEnabled,
      solve.timerSource || 'manual',
      Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.join(' ') : '',
      solve.bluetoothMoveCount ?? (Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.length : 0),
      solve.bluetoothTps ?? '',
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

export function safeExportFilename(value) {
  return String(value).replaceAll(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'session';
}

function sessionsForSolves(solves, sessions) {
  const sessionIds = new Set(solves.map((solve) => solve.sessionId || 'default'));
  const knownSessions = sessions.filter((session) => sessionIds.has(session.id));
  const knownIds = new Set(knownSessions.map((session) => session.id));
  const missingSessions = [...sessionIds]
    .filter((id) => !knownIds.has(id))
    .map((id) => ({ id, name: id }));
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
