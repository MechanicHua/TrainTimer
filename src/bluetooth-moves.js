const movePattern = /(^|[^A-Za-z0-9'’′`])([URFDLBurfdlb](?:2|['’′`])?)(?=$|[^A-Za-z0-9'’′`])/g;
const jsonMoveKeys = new Set(['move', 'moves', 'turn', 'turns', 'notation', 'sequence', 'seq']);
const goCubeAxisPermutation = [5, 2, 0, 3, 1, 4];
const goCubeFaces = 'URFDLB';
const giikerFaces = 'BDLURF';
const giikerSuffixes = ['', '2', "'"];
const giikerDecryptionKey = [
  176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93, 13,
  236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130, 199, 2, 169, 39, 165, 171, 41,
];

export function decodeBluetoothMoves(input) {
  const bytes = bytesFromInput(input);
  const goCube = decodeGoCubePacket(bytes);
  if (goCube) return goCube;
  const giiker = decodeGiikerPacket(bytes);
  if (giiker) return giiker;

  const text = printableText(bytes);
  const jsonMoves = parseJsonMoves(text);
  const moves = normalizeMoves(jsonMoves.length > 0 ? jsonMoves : parseTextMoves(text));

  return {
    bytes,
    text,
    moves,
    batteryLevel: null,
    protocol: moves.length > 0 ? (jsonMoves.length > 0 ? 'notation-json' : 'notation-text') : 'raw',
  };
}

export function decodeBatteryLevel(input) {
  const bytes = bytesFromInput(input);
  if (bytes.length === 0) return null;

  const level = bytes[0];
  return level <= 100 ? level : null;
}

function bytesFromInput(input) {
  if (input instanceof DataView) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return Uint8Array.from(input);
  return new Uint8Array();
}

function printableText(bytes) {
  if (bytes.length === 0) return '';
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const printable = [...text].filter((char) => char === '\n' || char === '\r' || char === '\t' || (char >= ' ' && char <= '~')).length;
  return printable / Math.max(1, text.length) >= 0.7 ? text : '';
}

function parseTextMoves(text) {
  if (!text) return [];
  const moves = [];
  for (const match of text.matchAll(movePattern)) moves.push(match[2]);
  return moves;
}

function decodeGoCubePacket(bytes) {
  if (bytes.length < 6) return null;
  if (bytes[0] !== 0x2a || bytes[bytes.length - 2] !== 0x0d || bytes[bytes.length - 1] !== 0x0a) return null;

  const messageType = bytes[2];
  if (messageType === 1) {
    const moves = [];
    const messageLength = Math.max(0, bytes.length - 6);
    for (let index = 0; index + 1 < messageLength; index += 2) {
      const moveByte = bytes[3 + index];
      const axisIndex = moveByte >> 1;
      const axis = goCubeAxisPermutation[axisIndex];
      if (!Number.isInteger(axis)) continue;
      const suffix = moveByte & 1 ? "'" : '';
      moves.push(`${goCubeFaces[axis]}${suffix}`);
    }

    return {
      bytes,
      text: '',
      moves,
      batteryLevel: null,
      protocol: moves.length > 0 ? 'gocube-move' : 'gocube-empty-move',
    };
  }

  if (messageType === 5) {
    const level = bytes[3];
    return {
      bytes,
      text: '',
      moves: [],
      batteryLevel: Number.isInteger(level) && level <= 100 ? level : null,
      protocol: 'gocube-battery',
    };
  }

  return {
    bytes,
    text: '',
    moves: [],
    batteryLevel: null,
    protocol: `gocube-message-${messageType}`,
  };
}

function decodeGiikerPacket(bytes) {
  if (bytes.length !== 18 && bytes.length !== 20) return null;
  const nibbles = giikerNibbles(bytes);
  const historyMoves = parseGiikerMoves(nibbles.slice(32, 40));
  if (historyMoves.length === 0) return null;

  return {
    bytes,
    text: '',
    moves: historyMoves.slice(0, 1),
    historyMoves,
    batteryLevel: null,
    protocol: bytes.length === 20 && bytes[18] === 0xa7 ? 'giiker-encrypted-latest-move' : 'giiker-latest-move',
  };
}

function giikerNibbles(bytes) {
  let raw = [...bytes];
  if (raw.length === 20 && raw[18] === 0xa7) {
    const keyOffsetA = (raw[19] >> 4) & 0x0f;
    const keyOffsetB = raw[19] & 0x0f;
    raw = raw.slice(0, 18).map((byte, index) => (
      byte + giikerDecryptionKey[index + keyOffsetA] + giikerDecryptionKey[index + keyOffsetB]
    ) & 0xff);
  }

  return raw.flatMap((byte) => [(byte >> 4) & 0x0f, byte & 0x0f]);
}

function parseGiikerMoves(nibbles) {
  const moves = [];
  for (let index = 0; index + 1 < nibbles.length; index += 2) {
    const face = giikerFaces[nibbles[index] - 1];
    const suffix = giikerSuffixes[nibbles[index + 1] - 1];
    if (!face || suffix == null) continue;
    moves.push(`${face}${suffix}`);
  }
  return moves;
}

function parseJsonMoves(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return [];

  try {
    return collectJsonMoves(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

function collectJsonMoves(value) {
  if (Array.isArray(value)) return value.flatMap(collectJsonMoves);
  if (typeof value === 'string') return parseTextMoves(value);
  if (!value || typeof value !== 'object') return [];

  const moves = [];
  for (const [key, child] of Object.entries(value)) {
    if (jsonMoveKeys.has(key.toLowerCase())) moves.push(...collectJsonMoves(child));
  }
  return moves;
}

function normalizeMoves(moves) {
  return moves.map(normalizeMove).filter(Boolean);
}

function normalizeMove(move) {
  const normalized = String(move || '').trim().replace(/[’′`]/g, "'");
  const match = normalized.match(/^([URFDLBurfdlb])([2']?)$/);
  return match ? `${match[1].toUpperCase()}${match[2]}` : null;
}
