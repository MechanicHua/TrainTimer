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
const ganV4SolvedStateSignatureBytes = [0x05, 0x39, 0x70, 0x00, 0x00, 0x09, 0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00];
const ganSolvedFacelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const byteHexLookup = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));
const aesRoundKeyCache = new Map();
const ganKeyIvCache = new Map();
const emptyMoves = Object.freeze([]);
const skippedGyroPackets = new Map();
const aesDecryptScratchA = new Uint8Array(16);
const aesDecryptScratchB = new Uint8Array(16);
const ganPayloadScratchByLength = new Map();
const ganV4StateScratch = {
  cp: Array(8),
  co: Array(8),
  ep: Array(12),
  eo: Array(12),
};
const ganV4FaceletScratch = Array(54);
const aesSbox = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];
const aesInvSbox = [
  0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
  0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
  0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
  0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
  0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
  0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
  0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
  0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
  0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
  0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
  0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
  0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
  0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
  0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
  0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
  0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
];
const aesRcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
const aesMul9 = Array.from({ length: 256 }, (_, value) => aesMul(value, 9));
const aesMul11 = Array.from({ length: 256 }, (_, value) => aesMul(value, 11));
const aesMul13 = Array.from({ length: 256 }, (_, value) => aesMul(value, 13));
const aesMul14 = Array.from({ length: 256 }, (_, value) => aesMul(value, 14));
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

export function decodeGanBluetoothPacketFast({
  protocol,
  mac,
  keyVersion = 0,
  bytes,
  skipGyroPayload = false,
  includeStateSignature = true,
  includeStateDetails = true,
  includeDecryptedBytes = true,
  omitRepeatedStateFacelets = false,
  previousStateSignature = '',
  previousStateSolved = null,
} = {}) {
  if (!supportsGanFastDecode()) return null;
  const normalizedProtocol = normalizeGanProtocol(protocol);
  if (normalizedProtocol === 'unknown') return null;
  const decryptedBytes = decodeGanPayloadFast(bytes, {
    mac,
    keyVersion,
    reuseOutput: includeDecryptedBytes === false,
  });
  if (
    normalizedProtocol === 'v4'
    && skipGyroPayload
    && includeDecryptedBytes === false
    && decryptedBytes[0] === 0xec
  ) {
    return skippedGanGyroPacket(normalizedProtocol);
  }
  const base = {
    protocol: `gan-${normalizedProtocol}`,
    moves: [],
    historyMoves: [],
    batteryLevel: null,
    moveCounter: null,
    mode: 'unknown',
  };
  if (includeDecryptedBytes) base.decryptedBytes = Array.from(decryptedBytes);

  if (normalizedProtocol === 'v2') return { ...base, ...parseGanV2(decryptedBytes) };
  if (normalizedProtocol === 'v3') return { ...base, ...parseGanV3(decryptedBytes) };
  if (normalizedProtocol === 'v4') {
    return {
      ...base,
      ...parseGanV4(decryptedBytes, {
        skipGyroPayload,
        includeStateSignature,
        includeStateDetails,
        omitRepeatedStateFacelets,
        previousStateSignature,
        previousStateSolved,
      }),
    };
  }
  return null;
}

function skippedGanGyroPacket(normalizedProtocol) {
  const protocol = `gan-${normalizedProtocol}`;
  const cached = skippedGyroPackets.get(protocol);
  if (cached) return cached;
  const packet = Object.freeze({
    protocol,
    moves: emptyMoves,
    historyMoves: emptyMoves,
    batteryLevel: null,
    moveCounter: null,
    mode: 'gyro',
  });
  skippedGyroPackets.set(protocol, packet);
  return packet;
}

export function supportsGanFastDecode() {
  return true;
}

function decodeGanPayloadFast(bytes, { mac, keyVersion = 0, reuseOutput = false } = {}) {
  const { key, iv, cacheKey } = ganKeyIv(mac, keyVersion);
  const output = mutableBytes(bytes, { reuseOutput });
  if (output.length < 16) return output;

  const roundKeys = aesRoundKeys(key, cacheKey);
  const offset = output.length > 16 ? output.length - 16 : -1;

  if (offset >= 0 && offset < 16) {
    const lastBlock = aesDecryptBlockInto(roundKeys, output, aesDecryptScratchB, offset);
    for (let index = 0; index < 16; index += 1) {
      output[index + offset] = lastBlock[index] ^ (iv[index] || 0);
    }
  } else if (offset >= 16) {
    const firstBlock = aesDecryptBlockInto(roundKeys, output, aesDecryptScratchA);
    const lastBlock = aesDecryptBlockInto(roundKeys, output, aesDecryptScratchB, offset);
    for (let index = 0; index < 16; index += 1) {
      output[index + offset] = lastBlock[index] ^ (iv[index] || 0);
    }
    for (let index = 0; index < 16; index += 1) output[index] = firstBlock[index] ^ (iv[index] || 0);
    return output;
  }

  const firstBlock = aesDecryptBlockInto(roundKeys, output, aesDecryptScratchA);
  for (let index = 0; index < 16; index += 1) output[index] = firstBlock[index] ^ (iv[index] || 0);
  return output;
}

function aesRoundKeys(keyBytes, cacheKey = '') {
  const normalizedCacheKey = cacheKey || Array.from(keyBytes).join(',');
  const cached = aesRoundKeyCache.get(normalizedCacheKey);
  if (cached) return cached;
  const key = byteView(keyBytes);
  if (key.length !== 16) throw new Error('GAN AES key must be 16 bytes');
  const roundKeys = new Uint8Array(176);
  roundKeys.set(key, 0);
  const temp = new Uint8Array(4);

  for (let offset = 16; offset < roundKeys.length; offset += 4) {
    temp[0] = roundKeys[offset - 4];
    temp[1] = roundKeys[offset - 3];
    temp[2] = roundKeys[offset - 2];
    temp[3] = roundKeys[offset - 1];
    if (offset % 16 === 0) {
      const rotated = temp[0];
      temp[0] = aesSbox[temp[1]] ^ aesRcon[offset / 16];
      temp[1] = aesSbox[temp[2]];
      temp[2] = aesSbox[temp[3]];
      temp[3] = aesSbox[rotated];
    }
    roundKeys[offset] = roundKeys[offset - 16] ^ temp[0];
    roundKeys[offset + 1] = roundKeys[offset - 15] ^ temp[1];
    roundKeys[offset + 2] = roundKeys[offset - 14] ^ temp[2];
    roundKeys[offset + 3] = roundKeys[offset - 13] ^ temp[3];
  }

  aesRoundKeyCache.set(normalizedCacheKey, roundKeys);
  return roundKeys;
}

function aesDecryptBlockInto(roundKeys, blockBytes, target, offset = 0) {
  const block = byteView(blockBytes);
  if (block.length - offset < 16) throw new Error('GAN AES block must be 16 bytes');
  const state = target;
  for (let index = 0; index < 16; index += 1) state[index] = block[offset + index];

  aesAddRoundKey(state, roundKeys, 10);
  for (let round = 9; round > 0; round -= 1) {
    aesInvShiftRows(state);
    aesInvSubBytes(state);
    aesAddRoundKey(state, roundKeys, round);
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  aesInvSubBytes(state);
  aesAddRoundKey(state, roundKeys, 0);
  return state;
}

function aesAddRoundKey(state, roundKeys, round) {
  const offset = round * 16;
  for (let index = 0; index < 16; index += 1) state[index] ^= roundKeys[offset + index];
}

function aesInvSubBytes(state) {
  for (let index = 0; index < 16; index += 1) state[index] = aesInvSbox[state[index]];
}

function aesInvShiftRows(state) {
  let t = state[13];
  state[13] = state[9];
  state[9] = state[5];
  state[5] = state[1];
  state[1] = t;

  t = state[2];
  state[2] = state[10];
  state[10] = t;
  t = state[6];
  state[6] = state[14];
  state[14] = t;

  t = state[3];
  state[3] = state[7];
  state[7] = state[11];
  state[11] = state[15];
  state[15] = t;
}

function aesInvMixColumns(state) {
  for (let column = 0; column < 4; column += 1) {
    const index = column * 4;
    const a0 = state[index];
    const a1 = state[index + 1];
    const a2 = state[index + 2];
    const a3 = state[index + 3];
    state[index] = aesMul14[a0] ^ aesMul11[a1] ^ aesMul13[a2] ^ aesMul9[a3];
    state[index + 1] = aesMul9[a0] ^ aesMul14[a1] ^ aesMul11[a2] ^ aesMul13[a3];
    state[index + 2] = aesMul13[a0] ^ aesMul9[a1] ^ aesMul14[a2] ^ aesMul11[a3];
    state[index + 3] = aesMul11[a0] ^ aesMul13[a1] ^ aesMul9[a2] ^ aesMul14[a3];
  }
}

function aesMul(left, right) {
  let a = left;
  let b = right;
  let result = 0;
  while (b > 0) {
    if (b & 1) result ^= a;
    a = ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
    b >>= 1;
  }
  return result;
}

function parseGanV2(bytes) {
  const mode = bitNumber(bytes, 0, 4);
  if (mode === 2) {
    const historyMoves = [];
    let invalid = false;
    for (let index = 0; index < 7; index += 1) {
      const moveValue = bitNumber(bytes, 12 + index * 5, 17 + index * 5);
      if (moveValue >= 12) {
        invalid = true;
        continue;
      }
      historyMoves.push(moveFromFacePower(ganFaces[moveValue >> 1], moveValue & 1));
    }
    return {
      mode: invalid ? 'move-invalid' : 'move',
      moveCounter: bitNumber(bytes, 4, 12),
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 4) return { mode: 'state', moveCounter: bitNumber(bytes, 4, 12), counterModulo: 256 };
  if (mode === 5) return { mode: 'hardware' };
  if (mode === 9) return { mode: 'battery', batteryLevel: validBattery(bitNumber(bytes, 8, 16)) };
  return { mode: `mode-${mode}` };
}

function parseGanV3(bytes) {
  const magic = bitNumber(bytes, 0, 8);
  const mode = bitNumber(bytes, 8, 16);
  const length = bitNumber(bytes, 16, 24);
  if (magic !== 0x55 || length <= 0) return { mode: 'invalid' };

  if (mode === 1) {
    const axis = ganAxisMasks.indexOf(bitNumber(bytes, 74, 80));
    const move = moveFromFacePower(ganFaces[axis], bitNumber(bytes, 72, 74));
    return {
      mode: move ? 'move' : 'move-invalid',
      moveCounter: bitNumber(bytes, 64, 72) << 8 | bitNumber(bytes, 56, 64),
      counterModulo: 256,
      moves: move ? [move] : [],
      historyMoves: move ? [move] : [],
    };
  }
  if (mode === 2) return { mode: 'state', moveCounter: bitNumber(bytes, 32, 40) << 8 | bitNumber(bytes, 24, 32), counterModulo: 256 };
  if (mode === 6) {
    const startMoveCounter = bitNumber(bytes, 24, 32);
    const historyMoves = parseGanHistoryMoves(bytes, 32, Math.max(0, (length - 1) * 2), ganHistoryFaces);
    return {
      mode: 'history',
      moveCounter: startMoveCounter,
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 7) return { mode: 'hardware' };
  if (mode === 16) return { mode: 'battery', batteryLevel: validBattery(bitNumber(bytes, 24, 32)) };
  return { mode: `mode-${mode}` };
}

function parseGanV4(bytes = [], options = {}) {
  const mode = bytes[0] & 0xff;
  const length = bytes[1] & 0xff;
  if (mode === 0x01) {
    const records = parseGanV4MoveRecords(bytes);
    const moves = records.map((record) => record.move);
    return {
      mode: moves.length > 0 ? 'move' : 'move-invalid',
      moveCounter: records.at(-1)?.moveCounter ?? ((bytes[7] & 0xff) << 8 | (bytes[6] & 0xff)),
      counterModulo: 256,
      moves,
      historyMoves: moves,
    };
  }
  if (mode === 0xed) {
    const moveCounter = (bytes[3] & 0xff) << 8 | (bytes[2] & 0xff);
    const stateSignature = ganV4StateSignature(bytes);
    const solvedBySignature = ganV4SolvedStateSignatureMatches(bytes);
    if (options.omitRepeatedStateFacelets && stateSignature === options.previousStateSignature) {
      const repeated = {
        mode: 'state',
        moveCounter,
        counterModulo: 256,
        stateUnchanged: true,
      };
      if (options.includeStateSignature !== false || options.omitRepeatedStateFacelets) {
        repeated.stateSignature = stateSignature;
      }
      if (options.previousStateSolved === true || solvedBySignature) repeated.stateSolved = true;
      else if (options.previousStateSolved === false) repeated.stateSolved = false;
      return repeated;
    }
    const includeStateDetails = options.includeStateDetails !== false;
    const state = parseGanV4FaceletState(bytes, includeStateDetails ? null : ganV4StateScratch);
    const facelets = ganStateToFacelets(state, includeStateDetails ? null : ganV4FaceletScratch);
    const output = {
      mode: 'state',
      moveCounter,
      counterModulo: 256,
      stateSolved: facelets === ganSolvedFacelets || solvedBySignature,
      facelets,
    };
    if (includeStateDetails) output.state = state;
    if (options.includeStateSignature !== false) output.stateSignature = stateSignature;
    return output;
  }
  if (mode === 0xec) {
    if (options.skipGyroPayload) return { mode: 'gyro' };
    const qw = (bytes[2] & 0xff) << 8 | (bytes[3] & 0xff);
    const qx = (bytes[4] & 0xff) << 8 | (bytes[5] & 0xff);
    const qy = (bytes[6] & 0xff) << 8 | (bytes[7] & 0xff);
    const qz = (bytes[8] & 0xff) << 8 | (bytes[9] & 0xff);
    const velocityByte = bytes[10] & 0xff;
    const vx = velocityByte >> 4;
    const vy = velocityByte & 0x0f;
    const vz = (bytes[11] & 0xff) >> 4;
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
    const startMoveCounter = bytes[2] & 0xff;
    const historyMoves = parseGanHistoryMoves(bytes, 24, Math.max(0, (length - 1) * 2), ganHistoryFaces);
    return {
      mode: 'history',
      moveCounter: startMoveCounter,
      counterModulo: 256,
      moves: historyMoves.slice(0, 1),
      historyMoves,
    };
  }
  if (mode === 0xef) return { mode: 'battery', batteryLevel: validBattery(bytes[1 + length] & 0xff) };
  if ([0xf5, 0xf6, 0xfa, 0xfc, 0xfd, 0xfe, 0xff].includes(mode)) return { mode: 'hardware' };
  return { mode: `mode-${mode}` };
}

function ganV4StateSignature(bytes) {
  let signature = byteHexLookup[bytes[4] & 0xff];
  for (let index = 5; index < 18; index += 1) signature += ` ${byteHexLookup[bytes[index] & 0xff]}`;
  return signature;
}

function ganV4SolvedStateSignatureMatches(bytes) {
  for (let index = 0; index < ganV4SolvedStateSignatureBytes.length; index += 1) {
    if (bytes[4 + index] !== ganV4SolvedStateSignatureBytes[index]) return false;
  }
  return true;
}

function parseGanV4MoveRecords(bytes = []) {
  const normalized = byteView(bytes);
  const records = [];
  for (let offset = 0; offset + 8 < normalized.length; offset += 9) {
    if (normalized[offset] !== 0x01) break;
    const action = normalized[offset + 8];
    const axis = ganAxisMasks.indexOf(action & 0x3f);
    const move = moveFromFacePower(ganFaces[axis], action >> 6);
    if (!move) break;
    records.push({
      move,
      moveCounter: normalized[offset + 7] << 8 | normalized[offset + 6],
    });
  }
  return records;
}

function parseGanHistoryMoves(bytes, start, count, faces) {
  const moves = [];
  for (let index = 0; index < count; index += 1) {
    const axis = bitNumber(bytes, start + 4 * index, start + 4 * index + 3);
    const move = moveFromFacePower(faces[axis], bitNumber(bytes, start + 4 * index + 3, start + 4 * index + 4));
    if (move) moves.push(move);
  }
  return moves;
}

function parseGanV4FaceletState(bytes, target = null) {
  const state = target || { cp: [], co: [], ep: [], eo: [] };
  const cp = state.cp;
  const co = state.co;
  const ep = state.ep;
  const eo = state.eo;
  cp.length = 8;
  co.length = 8;
  ep.length = 12;
  eo.length = 12;

  for (let index = 0; index < 7; index += 1) {
    cp[index] = bitNumber(bytes, 32 + index * 3, 35 + index * 3);
    co[index] = bitNumber(bytes, 53 + index * 2, 55 + index * 2);
  }
  cp[7] = 28 - sumNumbers(cp, 7);
  co[7] = (3 - (sumNumbers(co, 7) % 3)) % 3;

  for (let index = 0; index < 11; index += 1) {
    ep[index] = bitNumber(bytes, 69 + index * 4, 73 + index * 4);
    eo[index] = bitNumber(bytes, 113 + index, 114 + index);
  }
  ep[11] = 66 - sumNumbers(ep, 11);
  eo[11] = (2 - (sumNumbers(eo, 11) % 2)) % 2;

  return state;
}

function ganStateToFacelets({ cp, co, ep, eo }, target = null) {
  const facelets = target || Array(54);
  for (let index = 0; index < 54; index += 1) {
    facelets[index] = ganFaces[Math.floor(index / 9)];
  }

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

function sumNumbers(values, length = values.length) {
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += values[index] || 0;
  return sum;
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
  const version = keyVersion === 1 ? 1 : 0;
  const macKey = normalizedMacKey(mac);
  if (!macKey) throw new Error('GAN MAC address is required for encrypted packets');
  const cacheKey = `${version}:${macKey}`;
  const cached = ganKeyIvCache.get(cacheKey);
  if (cached) return cached;
  const bytes = macKey.match(/../g).map((pair) => Number.parseInt(pair, 16));
  const key = Uint8Array.from(ganBaseKeys[2 + version * 2]);
  const iv = Uint8Array.from(ganBaseKeys[3 + version * 2]);
  for (let index = 0; index < 6; index += 1) {
    key[index] = (key[index] + bytes[5 - index]) % 255;
    iv[index] = (iv[index] + bytes[5 - index]) % 255;
  }
  const result = { key, iv, cacheKey };
  ganKeyIvCache.set(cacheKey, result);
  return result;
}

function normalizedMacKey(mac) {
  const pairs = String(mac || '').match(/[0-9a-f]{2}/gi);
  return pairs && pairs.length === 6 ? pairs.join('').toLowerCase() : '';
}

function normalizeGanProtocol(protocol) {
  const normalized = String(protocol || '').toLowerCase().replace(/^gan-/, '');
  return ['v2', 'v3', 'v4'].includes(normalized) ? normalized : 'unknown';
}

function byteView(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes, (byte) => byte & 0xff);
  return new Uint8Array(0);
}

function mutableBytes(bytes, options = {}) {
  const view = byteView(bytes);
  if (!options.reuseOutput) return Uint8Array.from(view);
  let output = ganPayloadScratchByLength.get(view.length);
  if (!output) {
    output = new Uint8Array(view.length);
    ganPayloadScratchByLength.set(view.length, output);
  }
  output.set(view);
  return output;
}

function bitNumber(bytes, start, end) {
  if (end > bytes.length * 8 || end <= start) return 0;
  if ((start & 7) === 0 && (end & 7) === 0) {
    let value = 0;
    for (let index = start >> 3; index < (end >> 3); index += 1) {
      value = (value << 8) | (bytes[index] & 0xff);
    }
    return value;
  }
  if ((start >> 3) === ((end - 1) >> 3)) {
    const width = end - start;
    const shift = (end & 7) === 0 ? 0 : 8 - (end & 7);
    return ((bytes[start >> 3] & 0xff) >> shift) & ((1 << width) - 1);
  }
  let value = 0;
  for (let bit = start; bit < end; bit += 1) {
    value = (value << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
  }
  return value;
}

function validBattery(level) {
  return Number.isInteger(level) && level >= 0 && level <= 100 ? level : null;
}
