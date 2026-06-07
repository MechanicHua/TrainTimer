export function parseSolveImport(fileName, text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('文件内容为空');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonImport(trimmed, options);

  if (looksLikeCstimerCsv(trimmed)) return parseCstimerCsvImport(trimmed, options);
  if (looksLikeCubedeskCsv(trimmed)) return parseCubedeskCsvImport(trimmed, options);

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
  if (looksLikeExternalTimerJsonSolves(solves)) {
    return parseExternalTimerJsonImport(Array.isArray(parsed) ? {} : parsed, solves, options);
  }

  return {
    source: 'json',
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    solves,
  };
}

function parseExternalTimerJsonImport(data, records, options = {}) {
  const source = looksLikeCubedeskJsonSolves(records) ? 'cubedesk-json' : 'timer-json';
  const sessions = new Map();
  const solves = records.map((record, index) => parseExternalTimerJsonSolve(record, index, data, sessions, source, options));

  return {
    source,
    sessions: [...sessions.values()],
    solves,
  };
}

function parseExternalTimerJsonSolve(record, index, data, sessions, source, options) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`JSON 第 ${index + 1} 条成绩格式无效`);
  }
  const duration = parseExternalTimerDuration(record);
  if (!duration) throw new Error(`JSON 第 ${index + 1} 条缺少有效成绩`);

  const puzzle = normalizePuzzle(firstDefined(
    record.scramblePuzzle,
    record.scramble_puzzle,
    record.cube_type,
    record.cubeType,
    record.event,
    record.puzzle,
  ));
  const rawSessionId = firstDefined(record.sessionId, record.session_id, record.session?.id, record.session);
  const sessionId = externalTimerSessionId(rawSessionId, puzzle, source);
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      name: externalTimerSessionName(data, rawSessionId, puzzle, source),
      scramblePuzzle: puzzle,
    });
  }

  const bluetoothMoves = parseMoves(firstDefined(record.smart_turns, record.bluetoothMoves, record.moves));
  const smartTurnCount = parseOptionalInteger(firstDefined(record.smart_turn_count, record.bluetoothMoveCount));
  const deviceName = String(firstDefined(record.smart_device_id, record.bluetoothDeviceName, '') || '');
  const smartCube = parseBoolean(firstDefined(record.is_smart_cube, record.isSmartCube, record.smartCube));

  return {
    id: String(firstDefined(record.id, record.solve_id, record.uuid, '') || '') || createImportId(options),
    sessionId,
    createdAt: parseDateValue(firstDefined(record.createdAt, record.created_at, record.ended_at, record.started_at, record.date)) || new Date().toISOString(),
    durationMs: duration.durationMs,
    penalty: externalTimerPenalty(record, duration.penalty),
    scramble: String(firstDefined(record.scramble, record.scramble_text, '') || ''),
    scrambleSource: source,
    scramblePuzzle: puzzle,
    inspectionEnabled: parseBoolean(firstDefined(record.inspectionEnabled, record.inspection_enabled, '')) || Number(record.inspection_time) > 0,
    timerSource: smartCube || bluetoothMoves.length > 0 ? 'bluetooth' : 'manual',
    bluetoothMoves,
    bluetoothMoveCount: smartTurnCount,
    bluetoothTps: parseOptionalNumber(firstDefined(record.bluetoothTps, record.smart_tps)),
    bluetoothDeviceName: deviceName,
    bluetoothProtocols: source === 'cubedesk-json' && (smartCube || bluetoothMoves.length > 0) ? ['cubedesk-smart-cube'] : [],
    bluetoothSources: deviceName ? [deviceName] : [],
    tags: parseExternalTags(record),
    comment: String(firstDefined(record.notes, record.comment, record.description, '') || ''),
  };
}

function parseCubedeskCsvImport(text, options = {}) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) throw new Error('CubeDesk CSV 中没有成绩记录');

  const header = rows[0];
  const sessionId = options.sessionId || 'cubedesk-import';
  const sessionName = options.sessionName || 'CubeDesk Import';
  const solves = rows.slice(1).map((row, index) => {
    const value = (aliases) => csvValue(row, header, aliases);
    const time = parseCstimerTime(value(['Time', '成绩']));
    if (!time) throw new Error(`CubeDesk CSV 第 ${index + 2} 行缺少有效成绩`);
    return {
      id: createImportId(options),
      sessionId,
      createdAt: parseDateValue(value(['Date', 'Created At', 'Ended At', '日期'])) || new Date().toISOString(),
      durationMs: time.durationMs,
      penalty: time.penalty,
      scramble: value(['Scramble', '打乱']),
      scrambleSource: 'cubedesk-csv',
      scramblePuzzle: normalizePuzzle(value(['Cube Type', 'cube_type', 'Puzzle', '类型'])),
      inspectionEnabled: false,
      timerSource: 'manual',
      bluetoothMoves: [],
      tags: [],
      comment: value(['Notes', 'Comment', '备注']),
    };
  });

  return {
    source: 'cubedesk-csv',
    sessions: [{ id: sessionId, name: sessionName, scramblePuzzle: options.scramblePuzzle || solves.find((solve) => solve.scramblePuzzle)?.scramblePuzzle || 'three' }],
    solves,
  };
}

function parseCstimerJsonImport(data, options = {}) {
  const sessionKeys = cstimerSessionKeys(data);
  if (sessionKeys.length === 0) throw new Error('csTimer JSON 中没有 session 数据');

  const sessionMeta = cstimerSessionMeta(data);
  const sessions = sessionKeys.map((key) => {
    const sessionId = cstimerSessionId(key);
    const meta = sessionMeta.get(key);
    return {
      id: sessionId,
      name: String(meta?.name || `csTimer Session ${key}`),
      scramblePuzzle: cstimerSessionPuzzle(meta),
    };
  });
  const solves = [];

  for (const key of sessionKeys) {
    const sessionSolves = parseMaybeJson(data[`session${key}`]);
    if (!Array.isArray(sessionSolves)) throw new Error(`csTimer session${key} 不是成绩数组`);

    sessionSolves.forEach((solve, index) => {
      solves.push(parseCstimerJsonSolve(solve, cstimerSessionId(key), key, index, options, cstimerSessionPuzzle(sessionMeta.get(key))));
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
    if (sessionId && !sessions.has(sessionId)) {
      sessions.set(sessionId, { id: sessionId, name: sessionName, scramblePuzzle: value('scramblePuzzle') || 'three' });
    }

    const durationMs = value('durationMs')
      ? parseMillisecondValue(value('durationMs'))
      : parseDurationMs(value('duration'));
    if (durationMs == null) throw new Error(`CSV 第 ${index + 2} 行缺少有效成绩`);

    const solve = {
      id: value('id') || createImportId(options),
      sessionId,
      createdAt: value('createdAt') || new Date().toISOString(),
      durationMs,
      duration: value('duration') || undefined,
      penalty: value('penalty') || 'ok',
      scramble: value('scramble'),
      scrambleSource: value('scrambleSource') || 'csv',
      scramblePuzzle: value('scramblePuzzle') || 'three',
      inspectionEnabled: parseBoolean(value('inspectionEnabled')),
      timerSource: value('timerSource') || 'manual',
      bluetoothMoves: parseMoves(value('bluetoothMoves')),
      bluetoothMoveCount: parseOptionalInteger(value('bluetoothMoveCount')),
      bluetoothTps: parseOptionalNumber(value('bluetoothTps')),
      bluetoothDeviceName: value('bluetoothDeviceName'),
      bluetoothProtocols: parseTags(value('bluetoothProtocols')),
      bluetoothSources: parseTags(value('bluetoothSources')),
      tags: parseTags(value('tags')),
      comment: value('comment'),
    };
    assignOptionalString(solve, 'timerStartedAt', value('timerStartedAt'));
    assignOptionalNumber(solve, 'timerStartedAtMs', value('timerStartedAtMs'));
    assignOptionalString(solve, 'timerFinishedAt', value('timerFinishedAt'));
    assignOptionalNumber(solve, 'timerFinishedAtMs', value('timerFinishedAtMs'));
    assignOptionalArray(solve, 'bluetoothMoveLog', value('bluetoothMoveLog'), index + 2);
    assignOptionalArray(solve, 'cfopStages', value('cfopStages'), index + 2);
    assignOptionalArray(solve, 'opEvents', value('opEvents'), index + 2);
    return solve;
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
      scramblePuzzle: options.scramblePuzzle || 'three',
      inspectionEnabled: false,
      timerSource: 'manual',
      bluetoothMoves: [],
      tags: [],
      comment: value('Comment'),
    };
  });

  return {
    source: 'cstimer-csv',
    sessions: [{ id: sessionId, name: sessionName, scramblePuzzle: options.scramblePuzzle || 'three' }],
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

function looksLikeCubedeskCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const header = parseCsvRows(firstLine)[0] || [];
  const normalized = new Set(header.map(normalizeHeaderName));
  return normalized.has('index') && normalized.has('time');
}

function looksLikeCstimerJson(data) {
  return Boolean(data && typeof data === 'object' && cstimerSessionKeys(data).length > 0);
}

function looksLikeExternalTimerJsonSolves(solves) {
  const records = solves.filter((solve) => solve && typeof solve === 'object' && !Array.isArray(solve));
  if (records.length === 0) return false;
  if (records.some((solve) => Object.hasOwn(solve, 'durationMs'))) return false;
  const externalFields = new Set([
    'time',
    'raw_time',
    'duration',
    'duration_ms',
    'time_ms',
    'cube_type',
    'session_id',
    'started_at',
    'ended_at',
    'dnf',
    'plus_two',
    'notes',
    'created_at',
    'smart_turns',
  ]);
  return records.some((record) => Object.keys(record).some((key) => externalFields.has(key)));
}

function looksLikeCubedeskJsonSolves(solves) {
  return solves.some((solve) => (
    solve
    && typeof solve === 'object'
    && !Array.isArray(solve)
    && ['cube_type', 'session_id', 'raw_time', 'plus_two', 'created_at', 'smart_turns'].some((key) => Object.hasOwn(solve, key))
  ));
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

function parseCstimerJsonSolve(record, sessionId, sessionKey, index, options, scramblePuzzle = 'three') {
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
    scramblePuzzle,
    inspectionEnabled: false,
    timerSource: 'manual',
    bluetoothMoves: [],
    tags: [],
    comment: String(record[2] || ''),
  };
}

function cstimerSessionPuzzle(meta) {
  const raw = meta?.scramblePuzzle ?? meta?.scrType ?? meta?.scrambleType ?? meta?.puzzle ?? meta?.scr ?? '';
  return normalizePuzzle(raw);
}

function normalizePuzzle(value) {
  const compact = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!compact) return 'three';
  if (compact === 'two' || compact.startsWith('222') || compact === '2x2' || compact === '2x2x2') return 'two';
  if (compact === 'three' || compact.startsWith('333') || compact === '3x3' || compact === '3x3x3') return 'three';
  if (compact === 'four' || compact.startsWith('444') || compact === '4x4' || compact === '4x4x4') return 'four';
  if (compact === 'five' || compact.startsWith('555') || compact === '5x5' || compact === '5x5x5') return 'five';
  if (compact === 'six' || compact.startsWith('666') || compact === '6x6' || compact === '6x6x6') return 'six';
  if (compact === 'seven' || compact.startsWith('777') || compact === '7x7' || compact === '7x7x7') return 'seven';
  if (compact === 'clock' || compact === 'clk') return 'clock';
  if (compact === 'skewb' || compact.startsWith('skb')) return 'skewb';
  if (compact === 'sq1' || compact === 'square1' || compact === 'squareone' || compact.startsWith('sqr')) return 'sq1';
  return 'three';
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

function assignOptionalString(target, key, value) {
  const text = String(value || '').trim();
  if (text) target[key] = text;
}

function assignOptionalNumber(target, key, value) {
  const number = parseOptionalNumber(value);
  if (number != null) target[key] = number;
}

function assignOptionalArray(target, key, value, rowNumber) {
  const text = String(value || '').trim();
  if (!text) return;
  const parsed = parseMaybeJson(text);
  if (!Array.isArray(parsed)) throw new Error(`CSV 第 ${rowNumber} 行 ${key} 不是 JSON 数组`);
  target[key] = parsed;
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
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
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

function parseExternalTimerDuration(record) {
  const millisecondValue = firstDefined(
    record.durationMs,
    record.duration_ms,
    record.time_ms,
    record.timeMillis,
    record.millis,
    record.milliseconds,
  );
  const millisecondDuration = parseMillisecondValue(millisecondValue);
  if (millisecondDuration != null) return { durationMs: millisecondDuration, penalty: 'ok' };

  const rawValue = firstDefined(record.raw_time, record.rawTime, record.time, record.duration);
  if (typeof rawValue === 'string') {
    const parsed = parseCstimerTime(rawValue);
    if (parsed) return parsed;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const durationMs = Math.round(numeric > 6000 ? numeric : numeric * 1000);
  return { durationMs, penalty: 'ok' };
}

function externalTimerPenalty(record, fallback = 'ok') {
  if (parseBoolean(firstDefined(record.dnf, record.is_dnf, record.isDnf))) return 'dnf';
  if (parseBoolean(firstDefined(record.plus_two, record.plusTwo, record.plus_2, record.plus2))) return '+2';
  const status = String(firstDefined(record.penalty, record.status, '') || '').trim().toLowerCase();
  if (status === 'dnf') return 'dnf';
  if (status === '+2' || status === 'plus_two' || status === 'plus2') return '+2';
  return fallback === 'dnf' || fallback === '+2' ? fallback : 'ok';
}

function parseExternalTags(record) {
  const tags = parseTags(firstDefined(record.tags, record.tag_names, ''));
  const trainerName = String(firstDefined(record.trainer_name, record.trainerName, '') || '').trim();
  if (trainerName) tags.push(trainerName);
  return [...new Set(tags)];
}

function externalTimerSessionId(rawSessionId, puzzle, source) {
  const raw = String(rawSessionId || '').trim();
  if (raw) return `${source.replace(/[^a-z0-9]+/gi, '-')}-${safeImportIdPart(raw)}`;
  return `${source.replace(/[^a-z0-9]+/gi, '-')}-${puzzle || 'three'}`;
}

function externalTimerSessionName(data, rawSessionId, puzzle, source) {
  const raw = String(rawSessionId || '').trim();
  const knownSession = Array.isArray(data.sessions)
    ? data.sessions.find((session) => String(session?.id || session?.session_id || '') === raw)
    : null;
  if (knownSession?.name) return String(knownSession.name);
  if (raw) return `${source === 'cubedesk-json' ? 'CubeDesk' : 'Imported'} ${raw}`;
  return `${source === 'cubedesk-json' ? 'CubeDesk' : 'Imported'} ${puzzle || 'three'}`;
}

function csvValue(row, header, aliases) {
  const normalizedAliases = aliases.map(normalizeHeaderName);
  const normalizedHeader = header.map(normalizeHeaderName);
  const index = normalizedHeader.findIndex((cell) => normalizedAliases.includes(cell));
  return index >= 0 ? row[index] ?? '' : '';
}

function normalizeHeaderName(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function safeImportIdPart(value) {
  return String(value || '').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'session';
}

function createImportId(options) {
  if (typeof options.createId === 'function') return options.createId();
  if (globalThis.crypto?.randomUUID) return `import-${globalThis.crypto.randomUUID()}`;
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
