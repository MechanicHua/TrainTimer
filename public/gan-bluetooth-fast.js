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
const ganV4SolvedStateSignature = '05 39 70 00 00 09 1a 2b 3c 4d 00 00 00 00';
const ganSolvedFacelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const zeroIv = new Uint8Array(16);
const aesKeyCache = new Map();
const ganCornerFaceletMap = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const ganEdgeFaceletMap = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];

export async function decodeGanBluetoothPacketFast({ protocol, mac, keyVersion = 0, bytes } = {}) {
  if (!supportsGanFastDecode()) return null;
  const normalizedProtocol = normalizeGanProtocol(protocol);
  if (normalizedProtocol === 'unknown') return null;
  const decryptedBytes = await decodeGanPayloadFast(bytes, { mac, keyVersion });
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
  if (normalizedProtocol === 'v4') return { ...base, ...parseGanV4(bits, decryptedBytes) };
  return null;
}

export function supportsGanFastDecode() {
  return Boolean(globalThis.crypto?.subtle);
}

async function decodeGanPayloadFast(bytes, { mac, keyVersion = 0 } = {}) {
  const { key, iv } = ganKeyIv(mac, keyVersion);
  const output = normalizeBytes(bytes);
  if (output.length < 16) return output;

  if (output.length > 16) {
    const offset = output.length - 16;
    const block = await aesEcbDecryptBlock(key, output.slice(offset, offset + 16));
    for (let index = 0; index < 16; index += 1) {
      output[index + offset] = block[index] ^ (iv[index] || 0);
    }
  }

  const firstBlock = await aesEcbDecryptBlock(key, output.slice(0, 16));
  for (let index = 0; index < 16; index += 1) output[index] = firstBlock[index] ^ (iv[index] || 0);
  return output;
}

async function aesEcbDecryptBlock(keyBytes, blockBytes) {
  const key = await importAesKey(keyBytes);
  const block = Uint8Array.from(blockBytes);
  if (block.length !== 16) throw new Error('GAN AES block must be 16 bytes');

  const bridgePlain = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) bridgePlain[index] = block[index] ^ 0x10;
  const encryptedBridge = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: zeroIv },
    key,
    bridgePlain,
  ));

  const paddedCipher = new Uint8Array(32);
  paddedCipher.set(block, 0);
  paddedCipher.set(encryptedBridge.slice(0, 16), 16);
  const decrypted = new Uint8Array(await globalThis.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: zeroIv },
    key,
    paddedCipher,
  ));
  return [...decrypted.slice(0, 16)];
}

async function importAesKey(keyBytes) {
  const cacheKey = keyBytes.join(',');
  const cached = aesKeyCache.get(cacheKey);
  if (cached) return cached;
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    Uint8Array.from(keyBytes),
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt'],
  );
  aesKeyCache.set(cacheKey, key);
  return key;
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
  if (mode === 4) return { mode: 'state', moveCounter: bitNumber(bits, 4, 12), counterModulo: 256 };
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
  if (mode === 2) return { mode: 'state', moveCounter: bitNumber(bits, 32, 40) << 8 | bitNumber(bits, 24, 32), counterModulo: 256 };
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

function parseGanV4(bits, bytes = []) {
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
    const stateSignature = normalizeBytes(bytes).slice(4, 18).map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const state = parseGanV4FaceletState(bits);
    const facelets = ganStateToFacelets(state);
    return {
      mode: 'state',
      moveCounter: bitNumber(bits, 24, 32) << 8 | bitNumber(bits, 16, 24),
      counterModulo: 256,
      stateSignature,
      stateSolved: facelets === ganSolvedFacelets || stateSignature === ganV4SolvedStateSignature,
      facelets,
      state,
    };
  }
  if (mode === 0xec) {
    const qw = bitNumber(bits, 16, 32);
    const qx = bitNumber(bits, 32, 48);
    const qy = bitNumber(bits, 48, 64);
    const qz = bitNumber(bits, 64, 80);
    const vx = bitNumber(bits, 80, 84);
    const vy = bitNumber(bits, 84, 88);
    const vz = bitNumber(bits, 88, 92);
    return {
      mode: 'gyro',
      gyro: {
        quaternion: {
          x: signedMagnitude(qx, 0x8000, 0x7fff),
          y: signedMagnitude(qy, 0x8000, 0x7fff),
          z: signedMagnitude(qz, 0x8000, 0x7fff),
          w: signedMagnitude(qw, 0x8000, 0x7fff),
        },
        velocity: {
          x: signedMagnitude(vx, 0x8, 0x7),
          y: signedMagnitude(vy, 0x8, 0x7),
          z: signedMagnitude(vz, 0x8, 0x7),
        },
        raw: { qw, qx, qy, qz, vx, vy, vz },
      },
    };
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
  if (mode === 0xef) return { mode: 'battery', batteryLevel: validBattery(bitNumber(bits, 8 + length * 8, 16 + length * 8)) };
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

function parseGanV4FaceletState(bits) {
  const cp = [];
  const co = [];
  const ep = [];
  const eo = [];

  for (let index = 0; index < 7; index += 1) {
    cp.push(bitNumber(bits, 32 + index * 3, 35 + index * 3));
    co.push(bitNumber(bits, 53 + index * 2, 55 + index * 2));
  }
  cp.push(28 - sumNumbers(cp));
  co.push((3 - (sumNumbers(co) % 3)) % 3);

  for (let index = 0; index < 11; index += 1) {
    ep.push(bitNumber(bits, 69 + index * 4, 73 + index * 4));
    eo.push(bitNumber(bits, 113 + index, 114 + index));
  }
  ep.push(66 - sumNumbers(ep));
  eo.push((2 - (sumNumbers(eo) % 2)) % 2);

  return { cp, co, ep, eo };
}

function ganStateToFacelets({ cp, co, ep, eo }) {
  const facelets = Array.from({ length: 54 }, (_, index) => ganFaces[Math.floor(index / 9)]);

  for (let index = 0; index < 8; index += 1) {
    for (let part = 0; part < 3; part += 1) {
      const target = ganCornerFaceletMap[index][(part + co[index]) % 3];
      const source = ganCornerFaceletMap[cp[index]][part];
      facelets[target] = ganFaces[Math.floor(source / 9)];
    }
  }

  for (let index = 0; index < 12; index += 1) {
    for (let part = 0; part < 2; part += 1) {
      const target = ganEdgeFaceletMap[index][(part + eo[index]) % 2];
      const source = ganEdgeFaceletMap[ep[index]][part];
      facelets[target] = ganFaces[Math.floor(source / 9)];
    }
  }

  return facelets.join('');
}

function sumNumbers(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

function moveFromFacePower(face, power) {
  if (!face) return null;
  if (power === 0) return face;
  if (power === 1) return `${face}'`;
  if (power === 2) return `${face}2`;
  return null;
}

function signedMagnitude(value, signMask, valueMask) {
  return (value & signMask ? -1 : 1) * (value & valueMask) / valueMask;
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
  const pairs = String(mac || '').match(/[0-9a-f]{2}/gi);
  return pairs && pairs.length === 6 ? pairs.map((pair) => Number.parseInt(pair, 16)) : null;
}

function normalizeGanProtocol(protocol) {
  const normalized = String(protocol || '').toLowerCase().replace(/^gan-/, '');
  return ['v2', 'v3', 'v4'].includes(normalized) ? normalized : 'unknown';
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) return [...bytes];
  if (Array.isArray(bytes)) return bytes.map((byte) => byte & 0xff);
  if (bytes instanceof DataView) return [...new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)];
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
