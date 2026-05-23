export function parseSolveImport(fileName, text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('文件内容为空');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonImport(trimmed, options);

  if (looksLikeCstimerCsv(trimmed)) return parseCstimerCsvImport(trimmed, options);

  const isCsv = /\.csv$/i.test(fileName || '') || looksLikeCsv(trimmed);
  return isCsv
    ? parseCsvImport(trimmed, options)
    : parseJsonImport(trimmed, options);
}

function parseJsonImport(text, options = {}) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) && !Array.isArray(parsed.solves) && looksLikeCstimerJson(parsed)) {
    return parseCstimerJsonImport(parsed, options);
  }

  const solves = Array.isArray(parsed) ? parsed : parsed.solves;
  if (!Array.isArray(solves)) throw new Error('JSON 中没有 solves 数组');

  return {
    source: 'json',
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    solves,
  };
}

function parseCstimerJsonImport(data, options = {}) {
  const sessionKeys = cstimerSessionKeys(data);
  if (sessionKeys.length === 0) throw new Error('csTimer JSON 中没有 session 数据');

  const sessionMeta = cstimerSessionMeta(data);
  const sessions = sessionKeys.map((key) => {
    const sessionId = cstimerSessionId(key);
    return {
      id: sessionId,
      name: String(sessionMeta.get(key)?.name || `csTimer Session ${key}`),
    };
  });
  const solves = [];

  for (const key of sessionKeys) {
    const sessionSolves = parseMaybeJson(data[`session${key}`]);
    if (!Array.isArray(sessionSolves)) throw new Error(`csTimer session${key} 不是成绩数组`);

    sessionSolves.forEach((solve, index) => {
      solves.push(parseCstimerJsonSolve(solve, cstimerSessionId(key), key, index, options));
    });
  }

  return {
    source: 'cstimer-json',
    sessions,
    solves,
  };
}

function parseCsvImport(text, options = {}) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) throw new Error('CSV 中没有成绩记录');

  const header = rows[0].map((cell) => cell.trim());
  const lowerHeader = header.map((cell) => cell.toLowerCase());
  const sessions = new Map();
  const solves = rows.slice(1).map((row, index) => {
    const value = (name) => row[lowerHeader.indexOf(name.toLowerCase())] ?? '';
    const sessionId = value('sessionId') || 'default';
    const sessionName = value('sessionName') || sessionId;
    if (sessionId) sessions.set(sessionId, { id: sessionId, name: sessionName });

    const durationMs = value('durationMs')
      ? parseMillisecondValue(value('durationMs'))
      : parseDurationMs(value('duration'));
    if (durationMs == null) throw new Error(`CSV 第 ${index + 2} 行缺少有效成绩`);

    return {
      id: value('id') || createImportId(options),
      sessionId,
      createdAt: value('createdAt') || new Date().toISOString(),
      durationMs,
      duration: value('duration') || undefined,
      penalty: value('penalty') || 'ok',
      scramble: value('scramble'),
      scrambleSource: value('scrambleSource') || 'csv',
      inspectionEnabled: parseBoolean(value('inspectionEnabled')),
      timerSource: value('timerSource') || 'manual',
      bluetoothMoves: parseMoves(value('bluetoothMoves')),
      bluetoothMoveCount: parseOptionalInteger(value('bluetoothMoveCount')),
      bluetoothTps: parseOptionalNumber(value('bluetoothTps')),
      tags: parseTags(value('tags')),
      comment: value('comment'),
    };
  });

  return {
    source: 'csv',
    sessions: [...sessions.values()],
    solves,
  };
}

function parseCstimerCsvImport(text, options = {}) {
  const rows = parseCsvRows(text, ';').filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) throw new Error('csTimer CSV 中没有成绩记录');

  const header = rows[0].map((cell) => cell.trim());
  const lowerHeader = header.map((cell) => cell.toLowerCase());
  const sessionId = options.sessionId || 'cstimer-import';
  const sessionName = options.sessionName || 'csTimer Import';
  const solves = rows.slice(1).map((row, index) => {
    const value = (name) => row[lowerHeader.indexOf(name.toLowerCase())] ?? '';
    const parsedTime = parseCstimerTime(value('Time'));
    if (!parsedTime) throw new Error(`csTimer CSV 第 ${index + 2} 行缺少有效成绩`);

    return {
      id: value('id') || createImportId(options),
      sessionId,
      createdAt: parseDateValue(value('Date')) || new Date().toISOString(),
      durationMs: parsedTime.durationMs,
      penalty: parsedTime.penalty,
      scramble: value('Scramble'),
      scrambleSource: 'cstimer-csv',
      inspectionEnabled: false,
      timerSource: 'manual',
      bluetoothMoves: [],
      tags: [],
      comment: value('Comment'),
    };
  });

  return {
    source: 'cstimer-csv',
    sessions: [{ id: sessionId, name: sessionName }],
    solves,
  };
}

function looksLikeCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0].toLowerCase();
  return firstLine.includes(',') && firstLine.includes('duration');
}

function looksLikeCstimerCsv(text) {
  return /^No\.;Time;Comment;Scramble;Date(?:;|$)/i.test(text.split(/\r?\n/, 1)[0]);
}

function looksLikeCstimerJson(data) {
  return Boolean(data && typeof data === 'object' && cstimerSessionKeys(data).length > 0);
}

function cstimerSessionKeys(data) {
  return Object.keys(data || {})
    .map((key) => key.match(/^session(\d+)$/)?.[1])
    .filter(Boolean)
    .sort((left, right) => Number(left) - Number(right));
}

function cstimerSessionMeta(data) {
  const properties = parseMaybeJson(data?.properties);
  const sessionData = parseMaybeJson(properties?.sessionData ?? data?.sessionData);
  const meta = new Map();
  if (!sessionData || typeof sessionData !== 'object') return meta;

  for (const [key, value] of Object.entries(sessionData)) {
    if (value && typeof value === 'object') meta.set(String(key), value);
  }
  return meta;
}

function parseCstimerJsonSolve(record, sessionId, sessionKey, index, options) {
  if (!Array.isArray(record) || !Array.isArray(record[0])) {
    throw new Error(`csTimer session${sessionKey} 第 ${index + 1} 条成绩格式无效`);
  }

  const timeParts = record[0];
  const durationMs = parseMillisecondValue(timeParts[1]);
  if (durationMs == null) throw new Error(`csTimer session${sessionKey} 第 ${index + 1} 条缺少有效成绩`);

  const penaltyFlag = Number(timeParts[0]);
  const penalty = penaltyFlag === -1 ? 'dnf' : (penaltyFlag > 0 ? '+2' : 'ok');
  return {
    id: createImportId(options),
    sessionId,
    createdAt: parseDateValue(record[3]) || new Date().toISOString(),
    durationMs,
    penalty,
    scramble: String(record[1] || ''),
    scrambleSource: 'cstimer-json',
    inspectionEnabled: false,
    timerSource: 'manual',
    bluetoothMoves: [],
    tags: [],
    comment: String(record[2] || ''),
  };
}

function cstimerSessionId(key) {
  return `cstimer-${key}`;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseCsvRows(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV 引号未闭合');
  row.push(cell);
  rows.push(row);
  return rows;
}

function parseCstimerTime(value) {
  const text = String(value || '').trim();
  const dnfMatch = text.match(/^DNF\((.+)\)$/i);
  const penalty = dnfMatch ? 'dnf' : (text.endsWith('+') ? '+2' : 'ok');
  const timeText = dnfMatch ? dnfMatch[1] : text.replace(/\+$/, '');
  const durationMs = parseDurationMs(timeText);
  if (durationMs == null) return null;

  return { durationMs, penalty };
}

function parseDateValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 100000000000 ? numeric * 1000 : numeric;
    return new Date(milliseconds).toISOString();
  }

  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDurationMs(value) {
  const text = String(value || '').trim();
  if (!text || /^dnf$/i.test(text)) return null;
  const match = text.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?\+?$/) || text.match(/^(\d+)(?:\.(\d{1,3}))?\+?$/);
  if (!match) return null;

  if (text.includes(':')) {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    if (seconds >= 60) return null;
    return minutes * 60000 + seconds * 1000 + fractionToMs(match[3]);
  }

  return Number(match[1]) * 1000 + fractionToMs(match[2]);
}

function parseMillisecondValue(value) {
  const numeric = Number(String(value || '').trim());
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function parseOptionalInteger(value) {
  const numeric = parseOptionalNumber(value);
  return numeric == null ? undefined : Math.max(0, Math.round(numeric));
}

function parseOptionalNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function fractionToMs(fraction = '') {
  return Number(String(fraction).padEnd(3, '0'));
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', '开启'].includes(String(value || '').trim().toLowerCase());
}

function parseTags(value) {
  return String(value || '')
    .split(/[;,，；]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseMoves(value) {
  return String(value || '')
    .split(/[,\s;，；]+/)
    .map((move) => move.trim())
    .filter(Boolean);
}

function createImportId(options) {
  if (typeof options.createId === 'function') return options.createId();
  if (globalThis.crypto?.randomUUID) return `import-${globalThis.crypto.randomUUID()}`;
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
