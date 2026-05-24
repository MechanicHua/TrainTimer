import { createCipheriv, createDecipheriv } from 'node:crypto';

const ganBaseKeys = [
  [198, 202, 21, 223, 79, 110, 19, 182, 119, 13, 230, 89, 58, 175, 186, 162],
  [67, 226, 91, 214, 125, 220, 120, 216, 7, 96, 163, 218, 130, 60, 1, 241],
  [1, 2, 66, 40, 49, 145, 22, 7, 32, 5, 24, 84, 66, 17, 18, 83],
  [17, 3, 50, 40, 33, 1, 118, 39, 32, 149, 120, 20, 50, 18, 2, 67],
  [5, 18, 2, 69, 2, 1, 41, 86, 18, 120, 18, 118, 129, 1, 8, 3],
  [1, 68, 40, 6, 134, 33, 34, 40, 81, 5, 8, 49, 130, 2, 33, 6],
];

const ganAxisMasks = [2, 32, 8, 1, 16, 4];
const ganFaces = 'URFDLB';
const ganHistoryFaces = 'DUBFLR';

export function normalizeGanMac(mac) {
  const pairs = String(mac || '').match(/[0-9a-f]{2}/gi);
  return pairs && pairs.length === 6 ? pairs.map((pair) => pair.toLowerCase()).join(':') : '';
}

export function encodeGanBluetoothRequests({ protocol, mac, keyVersion = 0 } = {}) {
  const requests = ganPlainRequests(protocol);
  return requests.map((request) => ({
    label: request.label,
    bytes: encodeGanPayload(request.bytes, { mac, keyVersion }),
  }));
}

export function decodeGanBluetoothPacket({ protocol, mac, keyVersion = 0, bytes } = {}) {
  const normalizedProtocol = normalizeGanProtocol(protocol);
  const decryptedBytes = decodeGanPayload(bytes, { mac, keyVersion });
  const bits = bytesToBits(decryptedBytes);
  const base = {
    protocol: `gan-${normalizedProtocol}`,
    decryptedBytes,
    moves: [],
    historyMoves: [],
    batteryLevel: null,
    moveCounter: null,
    mode: 'unknown',
  };

  if (normalizedProtocol === 'v2') return { ...base, ...parseGanV2(bits) };
  if (normalizedProtocol === 'v3') return { ...base, ...parseGanV3(bits) };
  if (normalizedProtocol === 'v4') return { ...base, ...parseGanV4(bits) };
  return base;
}

export function encodeGanPayload(bytes, { mac, keyVersion = 0 } = {}) {
  const { key, iv } = ganKeyIv(mac, keyVersion);
  const output = normalizeBytes(bytes);
  if (output.length < 16) return output;

  for (let index = 0; index < 16; index += 1) output[index] ^= iv[index] || 0;
  output.splice(0, 16, ...aesBlock('encrypt', key, output.slice(0, 16)));
  if (output.length > 16) {
    const offset = output.length - 16;
    const block = output.slice(offset, offset + 16);
    for (let index = 0; index < 16; index += 1) block[index] ^= iv[index] || 0;
    output.splice(offset, 16, ...aesBlock('encrypt', key, block));
  }
  return output;
}

export function decodeGanPayload(bytes, { mac, keyVersion = 0 } = {}) {
  const { key, iv } = ganKeyIv(mac, keyVersion);
  const output = normalizeBytes(bytes);
  if (output.length < 16) return output;

  if (output.length > 16) {
    const offset = output.length - 16;
    const block = aesBlock('decrypt', key, output.slice(offset, offset + 16));
    for (let index = 0; index < 16; index += 1) {
      output[index + offset] = block[index] ^ (iv[index] || 0);
    }
  }

  const firstBlock = aesBlock('decrypt', key, output.slice(0, 16));
  for (let index = 0; index < 16; index += 1) output[index] = firstBlock[index] ^ (iv[index] || 0);
  return output;
}

function ganPlainRequests(protocol) {
  const normalized = normalizeGanProtocol(protocol);
  if (normalized === 'v2') {
    return [
      { label: '硬件信息请求', bytes: simpleGanRequest(20, 5) },
      { label: '状态请求', bytes: simpleGanRequest(20, 4) },
      { label: '电量请求', bytes: simpleGanRequest(20, 9) },
    ];
  }
  if (normalized === 'v3') {
    return [
      { label: '硬件信息请求', bytes: simpleGanRequest(16, 0x68, 4) },
      { label: '状态请求', bytes: simpleGanRequest(16, 0x68, 1) },
      { label: '电量请求', bytes: simpleGanRequest(16, 0x68, 7) },
    ];
  }
  if (normalized === 'v4') {
    return [
      { label: '硬件信息请求', bytes: [0xdf, 0x03, ...Array(18).fill(0)] },
      { label: '状态请求', bytes: [0xdd, 0x04, 0, 0xed, ...Array(16).fill(0)] },
      { label: '电量请求', bytes: [0xdd, 0x04, 0, 0xef, ...Array(16).fill(0)] },
    ];
  }
  return [];
}

function simpleGanRequest(length, ...prefix) {
  const bytes = Array(length).fill(0);
  prefix.forEach((byte, index) => {
    bytes[index] = byte;
  });
  return bytes;
}

function parseGanV2(bits) {
  const mode = bitNumber(bits, 0, 4);
  if (mode === 2) {
    const historyMoves = [];
    let invalid = false;
    for (let index = 0; index < 7; index += 1) {
      const moveValue = bitNumber(bits, 12 + index * 5, 17 + index * 5);
      if (moveValue >= 12) {
        invalid = true;
        continue;
      }
      historyMoves.push(moveFromFacePower(ganFaces[moveValue >> 1], moveValue & 1));
    }
    return {
      mode: invalid ? 'move-invalid' : 'move',
      moveCounter: bitNumber(bits, 4, 12),
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 4) {
    return { mode: 'state', moveCounter: bitNumber(bits, 4, 12), counterModulo: 256 };
  }
  if (mode === 5) return { mode: 'hardware' };
  if (mode === 9) return { mode: 'battery', batteryLevel: validBattery(bitNumber(bits, 8, 16)) };
  return { mode: `mode-${mode}` };
}

function parseGanV3(bits) {
  const magic = bitNumber(bits, 0, 8);
  const mode = bitNumber(bits, 8, 16);
  const length = bitNumber(bits, 16, 24);
  if (magic !== 0x55 || length <= 0) return { mode: 'invalid' };

  if (mode === 1) {
    const axis = ganAxisMasks.indexOf(bitNumber(bits, 74, 80));
    const move = moveFromFacePower(ganFaces[axis], bitNumber(bits, 72, 74));
    return {
      mode: move ? 'move' : 'move-invalid',
      moveCounter: bitNumber(bits, 64, 72) << 8 | bitNumber(bits, 56, 64),
      counterModulo: 256,
      moves: move ? [move] : [],
      historyMoves: move ? [move] : [],
    };
  }
  if (mode === 2) {
    return { mode: 'state', moveCounter: bitNumber(bits, 32, 40) << 8 | bitNumber(bits, 24, 32), counterModulo: 256 };
  }
  if (mode === 6) {
    const startMoveCounter = bitNumber(bits, 24, 32);
    const historyMoves = parseGanHistoryMoves(bits, 32, Math.max(0, (length - 1) * 2), ganHistoryFaces);
    return {
      mode: 'history',
      moveCounter: startMoveCounter,
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 7) return { mode: 'hardware' };
  if (mode === 16) return { mode: 'battery', batteryLevel: validBattery(bitNumber(bits, 24, 32)) };
  return { mode: `mode-${mode}` };
}

function parseGanV4(bits) {
  const mode = bitNumber(bits, 0, 8);
  const length = bitNumber(bits, 8, 16);
  if (mode === 0x01) {
    const axis = ganAxisMasks.indexOf(bitNumber(bits, 66, 72));
    const move = moveFromFacePower(ganFaces[axis], bitNumber(bits, 64, 66));
    return {
      mode: move ? 'move' : 'move-invalid',
      moveCounter: bitNumber(bits, 56, 64) << 8 | bitNumber(bits, 48, 56),
      counterModulo: 256,
      moves: move ? [move] : [],
      historyMoves: move ? [move] : [],
    };
  }
  if (mode === 0xed) {
    return { mode: 'state', moveCounter: bitNumber(bits, 24, 32) << 8 | bitNumber(bits, 16, 24), counterModulo: 256 };
  }
  if (mode === 0xd1) {
    const startMoveCounter = bitNumber(bits, 16, 24);
    const historyMoves = parseGanHistoryMoves(bits, 24, Math.max(0, (length - 1) * 2), ganHistoryFaces);
    return {
      mode: 'history',
      moveCounter: startMoveCounter,
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 0xef) {
    return { mode: 'battery', batteryLevel: validBattery(bitNumber(bits, 8 + length * 8, 16 + length * 8)) };
  }
  if ([0xf5, 0xf6, 0xfa, 0xfc, 0xfd, 0xfe, 0xff].includes(mode)) return { mode: 'hardware' };
  return { mode: `mode-${mode}` };
}

function parseGanHistoryMoves(bits, start, count, faces) {
  const moves = [];
  for (let index = 0; index < count; index += 1) {
    const axis = bitNumber(bits, start + 4 * index, start + 4 * index + 3);
    const move = moveFromFacePower(faces[axis], bitNumber(bits, start + 4 * index + 3, start + 4 * index + 4));
    if (move) moves.push(move);
  }
  return moves;
}

function moveFromFacePower(face, power) {
  if (!face) return null;
  if (power === 0) return face;
  if (power === 1) return `${face}'`;
  if (power === 2) return `${face}2`;
  return null;
}

function ganKeyIv(mac, keyVersion) {
  const bytes = macBytes(mac);
  if (!bytes) throw new Error('GAN MAC address is required for encrypted packets');
  const version = keyVersion === 1 ? 1 : 0;
  const key = ganBaseKeys[2 + version * 2].slice();
  const iv = ganBaseKeys[3 + version * 2].slice();
  for (let index = 0; index < 6; index += 1) {
    key[index] = (key[index] + bytes[5 - index]) % 255;
    iv[index] = (iv[index] + bytes[5 - index]) % 255;
  }
  return { key, iv };
}

function macBytes(mac) {
  const normalized = normalizeGanMac(mac);
  if (!normalized) return null;
  return normalized.split(':').map((part) => Number.parseInt(part, 16));
}

function aesBlock(action, key, bytes) {
  const method = action === 'encrypt' ? createCipheriv : createDecipheriv;
  const cipher = method('aes-128-ecb', Buffer.from(key), null);
  cipher.setAutoPadding(false);
  return [...Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()])];
}

function normalizeGanProtocol(protocol) {
  const normalized = String(protocol || '').toLowerCase().replace(/^gan-/, '');
  return ['v2', 'v3', 'v4'].includes(normalized) ? normalized : 'unknown';
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) return [...bytes];
  if (Array.isArray(bytes)) return bytes.map((byte) => byte & 0xff);
  return [];
}

function bytesToBits(bytes) {
  return normalizeBytes(bytes).map((byte) => byte.toString(2).padStart(8, '0')).join('');
}

function bitNumber(bits, start, end) {
  if (end > bits.length) return 0;
  return Number.parseInt(bits.slice(start, end), 2);
}

function validBattery(level) {
  return Number.isInteger(level) && level >= 0 && level <= 100 ? level : null;
}
