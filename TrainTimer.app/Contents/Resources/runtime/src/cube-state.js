const faceColors = {
  U: '#f8fafc',
  R: '#dc2626',
  F: '#16a34a',
  D: '#facc15',
  L: '#f97316',
  B: '#2563eb',
};

const faceNormals = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

const moveDefinitions = {
  U: { axis: 'y', layer: 1, turns: -1 },
  D: { axis: 'y', layer: -1, turns: 1 },
  R: { axis: 'x', layer: 1, turns: -1 },
  L: { axis: 'x', layer: -1, turns: 1 },
  F: { axis: 'z', layer: 1, turns: -1 },
  B: { axis: 'z', layer: -1, turns: 1 },
  M: { axis: 'x', layer: 0, turns: 1 },
  E: { axis: 'y', layer: 0, turns: 1 },
  S: { axis: 'z', layer: 0, turns: -1 },
  x: { axis: 'x', layer: 'all', turns: -1 },
  y: { axis: 'y', layer: 'all', turns: -1 },
  z: { axis: 'z', layer: 'all', turns: -1 },
  r: { axis: 'x', layers: [1, 0], turns: -1 },
  l: { axis: 'x', layers: [-1, 0], turns: 1 },
  u: { axis: 'y', layers: [1, 0], turns: -1 },
  d: { axis: 'y', layers: [-1, 0], turns: 1 },
  f: { axis: 'z', layers: [1, 0], turns: -1 },
  b: { axis: 'z', layers: [-1, 0], turns: 1 },
};

const faceOrder = ['U', 'L', 'F', 'R', 'B', 'D'];
const faceletOrder = ['U', 'R', 'F', 'D', 'L', 'B'];
const faceletOffsets = Object.fromEntries(faceletOrder.map((face, index) => [face, index * 9]));
export const solvedFaceletString = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const emptyFace = () => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => null));
const searchMoveTokens = ['U', 'U2', "U'", 'D', 'D2', "D'", 'R', 'R2', "R'", 'L', 'L2', "L'", 'F', 'F2', "F'", 'B', 'B2', "B'"];
const defaultCorrectionSearch = {
  maxDepth: 5,
  maxNodes: 120000,
  maxMs: 40,
};
const defaultShortCorrectionSearch = {
  maxDepth: 4,
  maxNodes: 50000,
  maxMs: 12,
};
const moveTokenCache = new Map();
const moveTokenCacheLimit = 128;
const targetInverseCubieCache = new Map();
const faceletCubieCache = new Map();
const faceletMovePermutationCache = new Map();
const shortCorrectionCache = new Map();
const shortCorrectionSolvedSearchMapCache = new Map();
let searchMoveEntriesCache = null;
const cubieCacheLimit = 512;
const shortCorrectionCacheLimit = 512;
const searchMoveFaceAxis = {
  U: 'y',
  D: 'y',
  R: 'x',
  L: 'x',
  F: 'z',
  B: 'z',
};
const searchMoveFaceRank = {
  U: 0,
  D: 1,
  R: 0,
  L: 1,
  F: 0,
  B: 1,
};
const cornerFacelet = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const cornerColor = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];
const edgeFacelet = [
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
const edgeColor = [
  ['U', 'R'],
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['D', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R'],
];

export function createSolvedCube() {
  const stickers = [];

  for (const face of faceletOrder) {
    const normal = faceNormals[face];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        stickers.push({
          pos: facePosition(face, row, col),
          normal: [...normal],
          face,
          color: faceColors[face],
        });
      }
    }
  }

  return stickers;
}

export function cubeFromFaces(faces) {
  const cube = createSolvedCube();
  let stickerIndex = 0;

  for (const face of faceletOrder) {
    const rows = faces?.[face];
    if (!Array.isArray(rows) || rows.length !== 3) throw new Error(`Invalid cube face: ${face}`);
    for (let row = 0; row < 3; row += 1) {
      if (!Array.isArray(rows[row]) || rows[row].length !== 3) throw new Error(`Invalid cube face: ${face}`);
      for (let col = 0; col < 3; col += 1) {
        const sticker = cube[stickerIndex];
        const source = rows[row][col];
        const sourceFace = source?.face;
        if (!sourceFace || !faceColors[sourceFace]) throw new Error(`Invalid cube facelet at ${face}${row}${col}`);
        sticker.face = sourceFace;
        sticker.color = source.color || faceColors[sourceFace];
        stickerIndex += 1;
      }
    }
  }

  return cube;
}

export function cubeFromFacelets(facelets) {
  const text = normalizeFaceletString(facelets);
  const cube = createSolvedCube();

  for (let index = 0; index < cube.length; index += 1) {
    const sticker = cube[index];
    const stickerFace = text[index];
    if (!faceColors[stickerFace]) throw new Error(`Invalid cube facelet: ${stickerFace}`);
    sticker.face = stickerFace;
    sticker.color = faceColors[stickerFace];
  }

  return cube;
}

export function cubeStateFromScramble(scramble) {
  return facesFromFacelets(faceletsFromScramble(scramble));
}

export function facesToFaceletString(faces) {
  let facelets = '';
  for (const face of faceletOrder) {
    const rows = faces?.[face];
    if (!Array.isArray(rows) || rows.length !== 3) throw new Error(`Invalid cube face: ${face}`);
    for (let row = 0; row < 3; row += 1) {
      if (!Array.isArray(rows[row]) || rows[row].length !== 3) throw new Error(`Invalid cube face: ${face}`);
      for (let col = 0; col < 3; col += 1) {
        const stickerFace = rows[row][col]?.face;
        if (!faceColors[stickerFace]) throw new Error(`Invalid cube facelet: ${stickerFace}`);
        facelets += stickerFace;
      }
    }
  }

  return normalizeFaceletString(facelets);
}

export function facesFromFacelets(facelets) {
  const text = normalizeFaceletString(facelets);
  const faces = Object.fromEntries(faceOrder.map((face) => [face, emptyFace()]));

  for (const face of faceletOrder) {
    const offset = faceletOffsets[face];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const stickerFace = text[offset + row * 3 + col];
        faces[face][row][col] = {
          face: stickerFace,
          color: faceColors[stickerFace],
        };
      }
    }
  }

  return faces;
}

export function faceletsFromCube(cube) {
  const facelets = solvedFaceletString.split('');
  for (const sticker of cube) {
    const face = faceFromNormal(sticker.normal);
    const [row, col] = faceGridPosition(face, sticker.pos);
    const stickerFace = sticker.face;
    if (!faceColors[stickerFace]) throw new Error(`Invalid cube facelet: ${stickerFace}`);
    facelets[faceletOffsets[face] + row * 3 + col] = stickerFace;
  }
  return facelets.join('');
}

export function faceletsFromScramble(scramble) {
  return applyMovesToFacelets(solvedFaceletString, scramble);
}

export function applyMoveToFacelets(facelets, moveOrToken) {
  const token = typeof moveOrToken === 'string'
    ? moveNotation(parseMoveToken(moveOrToken))
    : moveNotation(moveOrToken);
  return applyMoveTokenToFacelets(normalizeFaceletString(facelets), token);
}

export function applyMovesToFacelets(facelets, moves) {
  let state = normalizeFaceletString(facelets);
  for (const token of normalizeMoveTokens(moves)) {
    state = applyMoveTokenToFacelets(state, token);
  }
  return state;
}

export function relativeFaceletsForScrambleTarget(targetMoves, currentFacesOrFacelets) {
  const targetTokens = normalizeMoveTokens(targetMoves);
  const currentFacelets = typeof currentFacesOrFacelets === 'string'
    ? normalizeFaceletString(currentFacesOrFacelets)
    : facesToFaceletString(currentFacesOrFacelets);
  const targetInverseCubie = targetInverseCubieForMoveTokens(targetTokens);
  const currentCubie = cubieFromFaceletsCached(currentFacelets);

  // min2phase solves a state back to solved. Solving T^-1*C yields C^-1*T,
  // which is exactly the correction that moves current state C to target T.
  return faceletsFromCubie(multiplyCubies(targetInverseCubie, currentCubie));
}

export function relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacesOrFacelets) {
  const currentFacelets = typeof currentFacesOrFacelets === 'string'
    ? normalizeFaceletString(currentFacesOrFacelets)
    : facesToFaceletString(currentFacesOrFacelets);
  const targetInverseCubie = targetInverseCubieForFacelets(targetFacelets);
  const currentCubie = cubieFromFaceletsCached(currentFacelets);

  return faceletsFromCubie(multiplyCubies(targetInverseCubie, currentCubie));
}

export function shortCorrectionMovesForRelativeFacelets(relativeFacelets, options = {}) {
  const startFacelets = normalizeFaceletString(relativeFacelets);
  if (startFacelets === solvedFaceletString) return [];

  const maxDepth = clampInteger(options.maxDepth, 0, 8, defaultShortCorrectionSearch.maxDepth);
  const maxNodes = clampInteger(options.maxNodes, 1, 1000000, defaultShortCorrectionSearch.maxNodes);
  const maxMs = clampInteger(options.maxMs, 1, 1000, defaultShortCorrectionSearch.maxMs);
  const cacheKey = `${startFacelets}|${maxDepth}`;
  if (shortCorrectionCache.has(cacheKey)) {
    const cached = shortCorrectionCache.get(cacheKey);
    rememberLimited(shortCorrectionCache, cacheKey, cached, shortCorrectionCacheLimit);
    return cached ? [...cached] : null;
  }

  const startedAt = nowMs();
  const deadline = startedAt + maxMs;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (nowMs() > deadline) return null;
    const backwardDepth = Math.ceil(depth / 2);
    const forwardDepth = Math.floor(depth / 2);
    const backwardMap = shortCorrectionSolvedSearchMap(backwardDepth, {
      maxNodes,
      deadline,
    });
    if (!backwardMap) return null;

    let found = null;
    const forwardSearch = visitShortCorrectionSearch(startFacelets, forwardDepth, {
      maxNodes,
      deadline,
      onVisit(facelets, path) {
        const backward = backwardMap.get(facelets);
        if (!backward) return false;
        const pathLength = movePathLength(path);
        const backwardLength = movePathLength(backward.path);
        if (pathLength + backwardLength > depth) return false;
        found = [
          ...pathToMoveTokens(path),
          ...inverseMovePathTokens(backward.path),
        ];
        return true;
      },
    });
    if (found) {
      rememberLimited(shortCorrectionCache, cacheKey, found, shortCorrectionCacheLimit);
      return [...found];
    }
    if (!forwardSearch.completed || forwardSearch.nodes >= maxNodes || nowMs() > deadline) return null;
  }

  rememberLimited(shortCorrectionCache, cacheKey, null, shortCorrectionCacheLimit);
  return null;
}

export function warmShortCorrectionSearch(options = {}) {
  const maxDepth = clampInteger(options.maxDepth, 0, 8, defaultShortCorrectionSearch.maxDepth);
  const maxMs = clampInteger(options.maxMs, 1, 1000, Math.max(50, defaultShortCorrectionSearch.maxMs));
  const maxNodes = clampInteger(options.maxNodes, 1, 1000000, defaultShortCorrectionSearch.maxNodes);
  const deadline = nowMs() + maxMs;
  searchMoveEntries();
  const maxBackwardDepth = Math.ceil(maxDepth / 2);
  for (let depth = 0; depth <= maxBackwardDepth; depth += 1) {
    if (!shortCorrectionSolvedSearchMap(depth, { maxNodes, deadline })) return false;
  }
  return true;
}

export function correctionMovesToScrambleTarget(targetMoves, inputMoves, options = {}) {
  const targetTokens = normalizeMoveTokens(targetMoves);
  const inputTokens = normalizeMoveTokens(inputMoves);
  if (targetTokens.length === 0) return [];

  const route = buildCorrectionRoute(targetTokens);
  const currentFacelets = faceletsFromMoveTokens(inputTokens);
  const currentSignature = cubeFaceletSignature(currentFacelets);
  const targetSignature = route.at(-1)?.signature || '';
  if (currentSignature === targetSignature) return [];

  const targetFacelets = faceletsFromMoveTokens(targetTokens);
  const shortCorrection = shortCorrectionMovesForRelativeFacelets(
    relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
    {
      maxDepth: clampInteger(options.maxDepth, 0, 8, defaultCorrectionSearch.maxDepth),
      maxNodes: clampInteger(options.maxNodes, 1, 1000000, defaultCorrectionSearch.maxNodes),
      maxMs: clampInteger(options.maxMs, 1, 1000, defaultCorrectionSearch.maxMs),
    },
  );
  if (Array.isArray(shortCorrection)) return shortCorrection;

  const fallback = fallbackCorrectionMoves(inputTokens, route);
  const searched = searchCorrectionToRoute(currentFacelets, route, {
    ...defaultCorrectionSearch,
    ...options,
  });

  return chooseCorrectionMoves(searched, fallback);
}

export function correctionMovesFromFacesToScrambleTarget(targetMoves, currentFaces, options = {}) {
  const targetTokens = normalizeMoveTokens(targetMoves);
  if (targetTokens.length === 0 || !currentFaces) return [];

  const route = buildCorrectionRoute(targetTokens);
  const currentFacelets = facesToFaceletString(currentFaces);
  const currentSignature = cubeFaceletSignature(currentFacelets);
  const targetSignature = route.at(-1)?.signature || '';
  if (currentSignature === targetSignature) return [];

  const targetFacelets = faceletsFromMoveTokens(targetTokens);
  const shortCorrection = shortCorrectionMovesForRelativeFacelets(
    relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
    {
      maxDepth: clampInteger(options.maxDepth, 0, 8, defaultCorrectionSearch.maxDepth),
      maxNodes: clampInteger(options.maxNodes, 1, 1000000, defaultCorrectionSearch.maxNodes),
      maxMs: clampInteger(options.maxMs, 1, 1000, defaultCorrectionSearch.maxMs),
    },
  );
  if (Array.isArray(shortCorrection)) return shortCorrection;

  return searchCorrectionToRoute(currentFacelets, route, {
    ...defaultCorrectionSearch,
    ...options,
  }) || [];
}

export function cubeFacesSignature(faces) {
  let signature = '';
  for (const face of faceletOrder) {
    if (signature) signature += '|';
    const rows = faces?.[face];
    if (!Array.isArray(rows)) {
      signature += '---------';
      continue;
    }
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        signature += rows[row]?.[col]?.face || '-';
      }
    }
  }
  return signature;
}

export function cubeFaceletSignature(facelets) {
  const text = String(facelets || '');
  if (text.length !== 54) return '';
  return `${text.slice(0, 9)}|${text.slice(9, 18)}|${text.slice(18, 27)}|${text.slice(27, 36)}|${text.slice(36, 45)}|${text.slice(45, 54)}`;
}

export function isSolvedFaces(faces) {
  if (!faces) return false;
  for (const face of faceletOrder) {
    const rows = faces[face];
    if (!Array.isArray(rows) || rows.length !== 3) return false;
    for (let row = 0; row < 3; row += 1) {
      if (!Array.isArray(rows[row]) || rows[row].length !== 3) return false;
      for (let col = 0; col < 3; col += 1) {
        if (rows[row][col]?.face !== face) return false;
      }
    }
  }
  return true;
}

function normalizeFaceletString(facelets) {
  const text = String(facelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(text)) throw new Error('Invalid 3x3 facelet string');
  const counts = [...text].reduce((memo, face) => {
    memo[face] = (memo[face] || 0) + 1;
    return memo;
  }, {});
  for (const face of faceletOrder) {
    if (counts[face] !== 9) throw new Error(`Invalid 3x3 facelet count for ${face}`);
  }
  return text;
}

function cubieFromFacelets(facelets) {
  const text = normalizeFaceletString(facelets);
  const cp = Array(8).fill(-1);
  const co = Array(8).fill(0);
  const ep = Array(12).fill(-1);
  const eo = Array(12).fill(0);

  for (let position = 0; position < cornerFacelet.length; position += 1) {
    let orientation = 0;
    while (orientation < 3 && text[cornerFacelet[position][orientation]] !== 'U' && text[cornerFacelet[position][orientation]] !== 'D') {
      orientation += 1;
    }
    if (orientation >= 3) throw new Error('Invalid corner orientation');

    const colorA = text[cornerFacelet[position][(orientation + 1) % 3]];
    const colorB = text[cornerFacelet[position][(orientation + 2) % 3]];
    const cubie = cornerColor.findIndex((colors) => colors[1] === colorA && colors[2] === colorB);
    if (cubie < 0) throw new Error('Invalid corner permutation');
    cp[position] = cubie;
    co[position] = orientation % 3;
  }

  for (let position = 0; position < edgeFacelet.length; position += 1) {
    let matched = false;
    for (let cubie = 0; cubie < edgeColor.length && !matched; cubie += 1) {
      for (let orientation = 0; orientation < 2 && !matched; orientation += 1) {
        if (
          text[edgeFacelet[position][0]] === edgeColor[cubie][orientation]
          && text[edgeFacelet[position][1]] === edgeColor[cubie][1 - orientation]
        ) {
          ep[position] = cubie;
          eo[position] = orientation;
          matched = true;
        }
      }
    }
    if (!matched) throw new Error('Invalid edge permutation');
  }

  validateCubiePermutation(cp, 8, 'corner');
  validateCubiePermutation(ep, 12, 'edge');
  return { cp, co, ep, eo };
}

function targetInverseCubieForMoveTokens(targetTokens) {
  const key = targetTokens.join(' ');
  const cached = targetInverseCubieCache.get(key);
  if (cached) {
    rememberLimited(targetInverseCubieCache, key, cached);
    return cached;
  }
  const targetFacelets = faceletsFromMoveTokens(targetTokens);
  const inverse = invertCubie(cubieFromFaceletsCached(targetFacelets));
  rememberLimited(targetInverseCubieCache, key, inverse);
  return inverse;
}

function targetInverseCubieForFacelets(facelets) {
  const text = normalizeFaceletString(facelets);
  const key = `facelets:${text}`;
  const cached = targetInverseCubieCache.get(key);
  if (cached) {
    rememberLimited(targetInverseCubieCache, key, cached);
    return cached;
  }
  const inverse = invertCubie(cubieFromFaceletsCached(text));
  rememberLimited(targetInverseCubieCache, key, inverse);
  return inverse;
}

function cubieFromFaceletsCached(facelets) {
  const text = normalizeFaceletString(facelets);
  const cached = faceletCubieCache.get(text);
  if (cached) {
    rememberLimited(faceletCubieCache, text, cached);
    return cached;
  }
  const cubie = cubieFromFacelets(text);
  rememberLimited(faceletCubieCache, text, cubie);
  return cubie;
}

function rememberLimited(cache, key, value, limit = cubieCacheLimit) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value);
  }
  return value;
}

function faceletsFromCubie(cubie) {
  const facelets = solvedFaceletString.split('');

  for (let position = 0; position < cornerFacelet.length; position += 1) {
    const piece = cubie.cp[position];
    const orientation = cubie.co[position];
    for (let index = 0; index < 3; index += 1) {
      facelets[cornerFacelet[position][(index + orientation) % 3]] = cornerColor[piece][index];
    }
  }

  for (let position = 0; position < edgeFacelet.length; position += 1) {
    const piece = cubie.ep[position];
    const orientation = cubie.eo[position];
    for (let index = 0; index < 2; index += 1) {
      facelets[edgeFacelet[position][(index + orientation) % 2]] = edgeColor[piece][index];
    }
  }

  return facelets.join('');
}

function validateCubiePermutation(values, expectedLength, label) {
  const seen = new Set(values);
  if (seen.size !== expectedLength || values.some((value) => value < 0 || value >= expectedLength)) {
    throw new Error(`Invalid ${label} cubie permutation`);
  }
}

function multiplyCubies(first, second) {
  return {
    cp: second.cp.map((piece) => first.cp[piece]),
    co: second.cp.map((piece, position) => (first.co[piece] + second.co[position]) % 3),
    ep: second.ep.map((piece) => first.ep[piece]),
    eo: second.ep.map((piece, position) => (first.eo[piece] + second.eo[position]) % 2),
  };
}

function invertCubie(cubie) {
  const cp = Array(8);
  const co = Array(8);
  const ep = Array(12);
  const eo = Array(12);

  cubie.cp.forEach((piece, position) => {
    cp[piece] = position;
  });
  cubie.cp.forEach((piece) => {
    co[piece] = (3 - cubie.co[cp[piece]]) % 3;
  });
  cubie.ep.forEach((piece, position) => {
    ep[piece] = position;
  });
  cubie.ep.forEach((piece) => {
    eo[piece] = (2 - cubie.eo[ep[piece]]) % 2;
  });

  return { cp, co, ep, eo };
}

export function parseScramble(scramble) {
  return scramble
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMoveToken);
}

export function parseMoveToken(token) {
  const text = String(token || '').trim();
  const cached = moveTokenCache.get(text);
  if (cached) {
    rememberLimited(moveTokenCache, text, cached, moveTokenCacheLimit);
    return cached;
  }
  const match = text.match(/^([UDRLFBMESxyzudrlfb]|[UDRLFB]w)(2|')?$/);
  if (!match) throw new Error(`Unsupported scramble move: ${text}`);
  const move = { face: normalizeMoveFace(match[1]), suffix: match[2] || '' };
  rememberLimited(moveTokenCache, text, move, moveTokenCacheLimit);
  return move;
}

function normalizeMoveTokens(input) {
  if (Array.isArray(input)) {
    return input.flatMap((item) => {
      if (!item) return [];
      if (typeof item === 'string') return normalizeMoveTokens(item);
      if (typeof item === 'object' && item.face) return [moveNotation(item)];
      return [];
    });
  }
  return parseScramble(String(input || '')).map(moveNotation);
}

function moveNotation(move) {
  return `${move.face}${move.suffix || ''}`;
}

function buildCorrectionRoute(tokens) {
  const atomicTokens = tokens.flatMap(atomicMoveTokens);
  const route = [{
    signature: cubeFaceletSignature(solvedFaceletString),
    remainingMoves: atomicTokens,
  }];
  let facelets = solvedFaceletString;

  atomicTokens.forEach((token, index) => {
    facelets = applyMoveTokenToFacelets(facelets, token);
    route.push({
      signature: cubeFaceletSignature(facelets),
      remainingMoves: atomicTokens.slice(index + 1),
    });
  });

  return route;
}

function atomicMoveTokens(token) {
  const move = parseMoveToken(token);
  if (move.suffix === '2') return [move.face, move.face];
  return [moveNotation(move)];
}

function cubeFromMoveTokens(tokens) {
  return cubeFromFacelets(faceletsFromMoveTokens(tokens));
}

function faceletsFromMoveTokens(tokens) {
  let facelets = solvedFaceletString;
  for (const token of tokens) facelets = applyMoveTokenToFacelets(facelets, token);
  return facelets;
}

function fallbackCorrectionMoves(inputTokens, route) {
  const match = lastRouteMatchForInput(inputTokens, route);
  const wrongTail = inputTokens.slice(match.inputLength);
  return simplifyMoveTokens([...inverseMoveTokens(wrongTail), ...match.remainingMoves]);
}

function lastRouteMatchForInput(inputTokens, route) {
  const routeBySignature = routeEntriesBySignature(route);
  let facelets = solvedFaceletString;
  let best = {
    inputLength: 0,
    remainingMoves: route[0]?.remainingMoves || [],
  };

  inputTokens.forEach((token, index) => {
    facelets = applyMoveTokenToFacelets(facelets, token);
    const entry = bestRouteEntryForSignature(routeBySignature, cubeFaceletSignature(facelets));
    if (entry) {
      best = {
        inputLength: index + 1,
        remainingMoves: entry.remainingMoves,
      };
    }
  });

  return best;
}

function searchCorrectionToRoute(currentFacelets, route, options) {
  const routeBySignature = routeEntriesBySignature(route);
  const startedAt = nowMs();
  const maxDepth = Math.max(0, Number(options.maxDepth) || 0);
  const maxNodes = Math.max(1, Number(options.maxNodes) || 1);
  const maxMs = Math.max(1, Number(options.maxMs) || 1);
  const visited = new Set();
  let nodes = 0;
  let best = null;
  let level = [{
    facelets: normalizeFaceletString(currentFacelets),
    moves: [],
    lastFace: '',
  }];

  for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
    const nextLevel = [];
    for (const node of level) {
      if (nodes >= maxNodes || nowMs() - startedAt > maxMs) {
        return best?.moves || null;
      }

      const signature = cubeFaceletSignature(node.facelets);
      if (visited.has(signature)) continue;
      visited.add(signature);
      nodes += 1;

      const entry = bestRouteEntryForSignature(routeBySignature, signature);
      if (entry) {
        best = betterCorrection(best, {
          moves: simplifyMoveTokens([...node.moves, ...entry.remainingMoves]),
          correctionLength: node.moves.length,
          remainingLength: entry.remainingMoves.length,
        });
        if (entry.remainingMoves.length === 0) return best.moves;
      }

      if (depth === maxDepth) continue;
      for (const { token, move, permutation } of searchMoveEntries()) {
        if (move.face === node.lastFace) continue;
        nextLevel.push({
          facelets: applyFaceletPermutation(node.facelets, permutation),
          moves: [...node.moves, token],
          lastFace: move.face,
        });
      }
    }
    level = nextLevel;
  }

  return best?.moves || null;
}

function routeEntriesBySignature(route) {
  const entries = new Map();
  for (const entry of route) {
    const group = entries.get(entry.signature) || [];
    group.push(entry);
    entries.set(entry.signature, group);
  }
  return entries;
}

function bestRouteEntryForSignature(routeBySignature, signature) {
  const entries = routeBySignature.get(signature);
  if (!entries?.length) return null;
  return entries.reduce((best, entry) => (
    !best || entry.remainingMoves.length < best.remainingMoves.length ? entry : best
  ), null);
}

function betterCorrection(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  const currentScore = correctionScore(current);
  const candidateScore = correctionScore(candidate);
  for (let index = 0; index < currentScore.length; index += 1) {
    if (candidateScore[index] < currentScore[index]) return candidate;
    if (candidateScore[index] > currentScore[index]) return current;
  }
  return current;
}

function correctionScore(candidate) {
  return [
    candidate.moves.length,
    candidate.remainingLength,
    candidate.correctionLength,
  ];
}

function chooseCorrectionMoves(searched, fallback) {
  if (!searched) return fallback;
  if (!fallback || fallback.length === 0) return searched;
  if (searched.length < fallback.length) return searched;
  if (searched.length > fallback.length) return fallback;
  return searched;
}

function shouldPruneShortCorrectionMove(lastFace, nextFace) {
  if (!lastFace) return false;
  if (lastFace === nextFace) return true;
  if (searchMoveFaceAxis[lastFace] !== searchMoveFaceAxis[nextFace]) return false;
  return searchMoveFaceRank[lastFace] > searchMoveFaceRank[nextFace];
}

function shortCorrectionSolvedSearchMap(maxDepth, options = {}) {
  const cached = shortCorrectionSolvedSearchMapCache.get(maxDepth);
  if (cached) return cached;
  const map = buildShortCorrectionSearchMap(solvedFaceletString, maxDepth, options);
  if (!map) return null;
  shortCorrectionSolvedSearchMapCache.set(maxDepth, map);
  return map;
}

function visitShortCorrectionSearch(startFacelets, maxDepth, options = {}) {
  const maxNodes = Math.max(1, Number(options.maxNodes) || defaultShortCorrectionSearch.maxNodes);
  const deadline = Number.isFinite(options.deadline) ? options.deadline : nowMs() + defaultShortCorrectionSearch.maxMs;
  const visited = new Set([startFacelets]);
  let nodes = 1;
  let level = [{
    facelets: startFacelets,
    path: '',
    lastFace: '',
  }];
  if (typeof options.onVisit === 'function' && options.onVisit(startFacelets, '') === true) {
    return { completed: true, nodes, stopped: true };
  }

  for (let depth = 0; depth < maxDepth && level.length > 0; depth += 1) {
    const nextLevel = [];
    for (const node of level) {
      if (nodes >= maxNodes || nowMs() > deadline) return { completed: false, nodes };
      for (const { token, move, permutation } of searchMoveEntries()) {
        if (shouldPruneShortCorrectionMove(node.lastFace, move.face)) continue;
        const nextFacelets = applyFaceletPermutation(node.facelets, permutation);
        if (visited.has(nextFacelets)) continue;
        const nextPath = appendMovePath(node.path, token);
        visited.add(nextFacelets);
        nodes += 1;
        if (typeof options.onVisit === 'function' && options.onVisit(nextFacelets, nextPath) === true) {
          return { completed: true, nodes, stopped: true };
        }
        if ((nodes & 0x7f) === 0 && nowMs() > deadline) return { completed: false, nodes };
        nextLevel.push({
          facelets: nextFacelets,
          path: nextPath,
          lastFace: move.face,
        });
      }
    }
    level = nextLevel;
  }

  return { completed: true, nodes };
}

function buildShortCorrectionSearchMap(startFacelets, maxDepth, options = {}) {
  const maxNodes = Math.max(1, Number(options.maxNodes) || defaultShortCorrectionSearch.maxNodes);
  const deadline = Number.isFinite(options.deadline) ? options.deadline : nowMs() + defaultShortCorrectionSearch.maxMs;
  const map = new Map();
  let nodes = 1;
  let level = [{
    facelets: startFacelets,
    path: '',
    lastFace: '',
  }];
  map.set(startFacelets, level[0]);
  if (typeof options.onVisit === 'function') options.onVisit(startFacelets, '');

  for (let depth = 0; depth < maxDepth && level.length > 0; depth += 1) {
    const nextLevel = [];
    for (const node of level) {
      if (nodes >= maxNodes || nowMs() > deadline) return null;
      for (const { token, move, permutation } of searchMoveEntries()) {
        if (shouldPruneShortCorrectionMove(node.lastFace, move.face)) continue;
        const nextFacelets = applyFaceletPermutation(node.facelets, permutation);
        if (map.has(nextFacelets)) continue;
        const nextPath = appendMovePath(node.path, token);
        const nextNode = {
          facelets: nextFacelets,
          path: nextPath,
          lastFace: move.face,
        };
        map.set(nextFacelets, nextNode);
        nodes += 1;
        if (typeof options.onVisit === 'function') options.onVisit(nextFacelets, nextPath);
        if ((nodes & 0x7f) === 0 && nowMs() > deadline) return null;
        nextLevel.push(nextNode);
      }
    }
    level = nextLevel;
  }

  return map;
}

function appendMovePath(path, token) {
  return path ? `${path} ${token}` : token;
}

function pathToMoveTokens(path) {
  return path ? path.split(' ') : [];
}

function movePathLength(path) {
  if (!path) return 0;
  let length = 1;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === ' ') length += 1;
  }
  return length;
}

function inverseMovePathTokens(path) {
  return inverseMoveTokens(pathToMoveTokens(path));
}

function searchMoveEntries() {
  if (!searchMoveEntriesCache) {
    searchMoveEntriesCache = searchMoveTokens.map((token) => ({
      token,
      move: parseMoveToken(token),
      permutation: faceletMovePermutation(token),
    }));
  }
  return searchMoveEntriesCache;
}

function applyMoveTokenToFacelets(facelets, token) {
  return applyFaceletPermutation(facelets, faceletMovePermutation(token));
}

function applyFaceletPermutation(facelets, permutation) {
  if (permutation.length === 54 && facelets.length >= 54) {
    return String.fromCharCode(
      facelets.charCodeAt(permutation[0]),
      facelets.charCodeAt(permutation[1]),
      facelets.charCodeAt(permutation[2]),
      facelets.charCodeAt(permutation[3]),
      facelets.charCodeAt(permutation[4]),
      facelets.charCodeAt(permutation[5]),
      facelets.charCodeAt(permutation[6]),
      facelets.charCodeAt(permutation[7]),
      facelets.charCodeAt(permutation[8]),
      facelets.charCodeAt(permutation[9]),
      facelets.charCodeAt(permutation[10]),
      facelets.charCodeAt(permutation[11]),
      facelets.charCodeAt(permutation[12]),
      facelets.charCodeAt(permutation[13]),
      facelets.charCodeAt(permutation[14]),
      facelets.charCodeAt(permutation[15]),
      facelets.charCodeAt(permutation[16]),
      facelets.charCodeAt(permutation[17]),
      facelets.charCodeAt(permutation[18]),
      facelets.charCodeAt(permutation[19]),
      facelets.charCodeAt(permutation[20]),
      facelets.charCodeAt(permutation[21]),
      facelets.charCodeAt(permutation[22]),
      facelets.charCodeAt(permutation[23]),
      facelets.charCodeAt(permutation[24]),
      facelets.charCodeAt(permutation[25]),
      facelets.charCodeAt(permutation[26]),
      facelets.charCodeAt(permutation[27]),
      facelets.charCodeAt(permutation[28]),
      facelets.charCodeAt(permutation[29]),
      facelets.charCodeAt(permutation[30]),
      facelets.charCodeAt(permutation[31]),
      facelets.charCodeAt(permutation[32]),
      facelets.charCodeAt(permutation[33]),
      facelets.charCodeAt(permutation[34]),
      facelets.charCodeAt(permutation[35]),
      facelets.charCodeAt(permutation[36]),
      facelets.charCodeAt(permutation[37]),
      facelets.charCodeAt(permutation[38]),
      facelets.charCodeAt(permutation[39]),
      facelets.charCodeAt(permutation[40]),
      facelets.charCodeAt(permutation[41]),
      facelets.charCodeAt(permutation[42]),
      facelets.charCodeAt(permutation[43]),
      facelets.charCodeAt(permutation[44]),
      facelets.charCodeAt(permutation[45]),
      facelets.charCodeAt(permutation[46]),
      facelets.charCodeAt(permutation[47]),
      facelets.charCodeAt(permutation[48]),
      facelets.charCodeAt(permutation[49]),
      facelets.charCodeAt(permutation[50]),
      facelets.charCodeAt(permutation[51]),
      facelets.charCodeAt(permutation[52]),
      facelets.charCodeAt(permutation[53]),
    );
  }
  let output = '';
  for (let index = 0; index < permutation.length; index += 1) {
    output += facelets[permutation[index]];
  }
  return output;
}

function faceletMovePermutation(token) {
  const key = String(token || '');
  const cached = faceletMovePermutationCache.get(key);
  if (cached) return cached;

  const cube = createSolvedCube();
  cube.forEach((sticker, index) => {
    sticker.sourceIndex = index;
  });
  applyMove(cube, parseMoveToken(key));

  const permutation = Array(54);
  for (const sticker of cube) {
    const face = faceFromNormal(sticker.normal);
    const [row, col] = faceGridPosition(face, sticker.pos);
    const destination = faceletOffsets[face] + row * 3 + col;
    permutation[destination] = sticker.sourceIndex;
  }
  if (permutation.some((index) => !Number.isInteger(index))) {
    throw new Error(`Invalid facelet permutation for ${key}`);
  }
  faceletMovePermutationCache.set(key, permutation);
  return permutation;
}

function inverseMoveTokens(tokens) {
  return tokens.slice().reverse().map((token) => {
    const move = parseMoveToken(token);
    if (move.suffix === '2') return `${move.face}2`;
    if (move.suffix === "'") return move.face;
    return `${move.face}'`;
  });
}

function simplifyMoveTokens(tokens) {
  const simplified = [];
  for (const token of tokens.filter(Boolean)) {
    const move = parseMoveToken(token);
    const previousToken = simplified.at(-1);
    const previousMove = previousToken ? parseMoveToken(previousToken) : null;
    if (!previousMove || previousMove.face !== move.face) {
      simplified.push(moveNotation(move));
      continue;
    }
    simplified.pop();
    const turns = (moveQuarterTurns(previousMove) + moveQuarterTurns(move)) % 4;
    if (turns === 1) simplified.push(move.face);
    else if (turns === 2) simplified.push(`${move.face}2`);
    else if (turns === 3) simplified.push(`${move.face}'`);
  }
  return simplified;
}

function moveQuarterTurns(move) {
  if (move.suffix === '2') return 2;
  if (move.suffix === "'") return 3;
  return 1;
}

function cloneCube(cube) {
  return cube.map((sticker) => ({
    ...sticker,
    pos: [...sticker.pos],
    normal: [...sticker.normal],
  }));
}

function nowMs() {
  return globalThis.performance?.now?.() || Date.now();
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function applyMove(cube, move) {
  const definition = moveDefinitions[move.face];
  if (!definition) throw new Error(`Unsupported scramble move: ${move.face}${move.suffix || ''}`);
  const amount = move.suffix === '2' ? 2 : 1;
  const direction = move.suffix === "'" ? -definition.turns : definition.turns;
  const turns = ((direction * amount) % 4 + 4) % 4;

  for (let index = 0; index < turns; index += 1) {
    for (const sticker of cube) {
      if (!moveAffectsSticker(sticker, definition)) continue;
      sticker.pos = rotateVector(sticker.pos, definition.axis);
      sticker.normal = rotateVector(sticker.normal, definition.axis);
    }
  }
}

function normalizeMoveFace(face) {
  if (face.length === 2 && face[1] === 'w') return face[0].toLowerCase();
  return face;
}

function moveAffectsSticker(sticker, definition) {
  if (definition.layer === 'all') return true;
  const value = coordinate(sticker.pos, definition.axis);
  if (Array.isArray(definition.layers)) return definition.layers.includes(value);
  return value === definition.layer;
}

export function facesFromCube(cube) {
  const faces = Object.fromEntries(faceOrder.map((face) => [face, emptyFace()]));

  for (const sticker of cube) {
    const face = faceFromNormal(sticker.normal);
    const [row, col] = faceGridPosition(face, sticker.pos);
    faces[face][row][col] = {
      face: sticker.face,
      color: sticker.color,
    };
  }

  return faces;
}

function facePosition(face, row, col) {
  const a = col - 1;
  const b = row - 1;

  switch (face) {
    case 'U':
      return [a, 1, b];
    case 'D':
      return [a, -1, -b];
    case 'F':
      return [a, -b, 1];
    case 'B':
      return [-a, -b, -1];
    case 'R':
      return [1, -b, -a];
    case 'L':
      return [-1, -b, a];
    default:
      throw new Error(`Unsupported face: ${face}`);
  }
}

function faceGridPosition(face, [x, y, z]) {
  switch (face) {
    case 'U':
      return [z + 1, x + 1];
    case 'D':
      return [1 - z, x + 1];
    case 'F':
      return [1 - y, x + 1];
    case 'B':
      return [1 - y, 1 - x];
    case 'R':
      return [1 - y, 1 - z];
    case 'L':
      return [1 - y, z + 1];
    default:
      throw new Error(`Unsupported face: ${face}`);
  }
}

function rotateVector([x, y, z], axis) {
  switch (axis) {
    case 'x':
      return [x, -z, y];
    case 'y':
      return [z, y, -x];
    case 'z':
      return [-y, x, z];
    default:
      throw new Error(`Unsupported axis: ${axis}`);
  }
}

function coordinate([x, y, z], axis) {
  if (axis === 'x') return x;
  if (axis === 'y') return y;
  return z;
}

function faceFromNormal(normal) {
  for (const [face, candidate] of Object.entries(faceNormals)) {
    if (normal.every((value, index) => value === candidate[index])) return face;
  }
  throw new Error(`Invalid sticker normal: ${normal.join(',')}`);
}
