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
const emptyFace = () => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => null));
const searchMoveTokens = ['U', 'U2', "U'", 'D', 'D2', "D'", 'R', 'R2', "R'", 'L', 'L2', "L'", 'F', 'F2', "F'", 'B', 'B2', "B'"];
const defaultCorrectionSearch = {
  maxDepth: 5,
  maxNodes: 120000,
  maxMs: 40,
};

export function createSolvedCube() {
  const stickers = [];

  for (const face of Object.keys(faceNormals)) {
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

  for (const sticker of cube) {
    const face = faceFromNormal(sticker.normal);
    const [row, col] = faceGridPosition(face, sticker.pos);
    const source = faces?.[face]?.[row]?.[col];
    const sourceFace = source?.face;
    if (!sourceFace || !faceColors[sourceFace]) throw new Error(`Invalid cube facelet at ${face}${row}${col}`);
    sticker.face = sourceFace;
    sticker.color = source.color || faceColors[sourceFace];
  }

  return cube;
}

export function cubeStateFromScramble(scramble) {
  const cube = createSolvedCube();
  for (const move of parseScramble(scramble)) applyMove(cube, move);
  return facesFromCube(cube);
}

export function correctionMovesToScrambleTarget(targetMoves, inputMoves, options = {}) {
  const targetTokens = normalizeMoveTokens(targetMoves);
  const inputTokens = normalizeMoveTokens(inputMoves);
  if (targetTokens.length === 0) return [];

  const route = buildCorrectionRoute(targetTokens);
  const currentCube = cubeFromMoveTokens(inputTokens);
  const currentSignature = cubeFacesSignature(facesFromCube(currentCube));
  const targetSignature = route.at(-1)?.signature || '';
  if (currentSignature === targetSignature) return [];

  const fallback = fallbackCorrectionMoves(inputTokens, route);
  const searched = searchCorrectionToRoute(currentCube, route, {
    ...defaultCorrectionSearch,
    ...options,
  });

  return chooseCorrectionMoves(searched, fallback);
}

export function cubeFacesSignature(faces) {
  return ['U', 'R', 'F', 'D', 'L', 'B'].map((face) => (
    faces?.[face]?.flat().map((sticker) => sticker?.face || '-').join('') || '---------'
  )).join('|');
}

export function isSolvedFaces(faces) {
  return Object.entries(faces).every(([face, stickers]) => stickers.flat().every((sticker) => sticker?.face === face));
}

export function parseScramble(scramble) {
  return scramble
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const match = token.match(/^([UDRLFBMESxyzudrlfb]|[UDRLFB]w)(2|')?$/);
      if (!match) throw new Error(`Unsupported scramble move: ${token}`);
      return { face: normalizeMoveFace(match[1]), suffix: match[2] || '' };
    });
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
    signature: cubeFacesSignature(facesFromCube(createSolvedCube())),
    remainingMoves: atomicTokens,
  }];
  const cube = createSolvedCube();

  atomicTokens.forEach((token, index) => {
    applyMove(cube, parseScramble(token)[0]);
    route.push({
      signature: cubeFacesSignature(facesFromCube(cube)),
      remainingMoves: atomicTokens.slice(index + 1),
    });
  });

  return route;
}

function atomicMoveTokens(token) {
  const move = parseScramble(token)[0];
  if (move.suffix === '2') return [move.face, move.face];
  return [moveNotation(move)];
}

function cubeFromMoveTokens(tokens) {
  const cube = createSolvedCube();
  for (const token of tokens) applyMove(cube, parseScramble(token)[0]);
  return cube;
}

function fallbackCorrectionMoves(inputTokens, route) {
  const match = lastRouteMatchForInput(inputTokens, route);
  const wrongTail = inputTokens.slice(match.inputLength);
  return simplifyMoveTokens([...inverseMoveTokens(wrongTail), ...match.remainingMoves]);
}

function lastRouteMatchForInput(inputTokens, route) {
  const routeBySignature = routeEntriesBySignature(route);
  const cube = createSolvedCube();
  let best = {
    inputLength: 0,
    remainingMoves: route[0]?.remainingMoves || [],
  };

  inputTokens.forEach((token, index) => {
    applyMove(cube, parseScramble(token)[0]);
    const entry = bestRouteEntryForSignature(routeBySignature, cubeFacesSignature(facesFromCube(cube)));
    if (entry) {
      best = {
        inputLength: index + 1,
        remainingMoves: entry.remainingMoves,
      };
    }
  });

  return best;
}

function searchCorrectionToRoute(currentCube, route, options) {
  const routeBySignature = routeEntriesBySignature(route);
  const startedAt = nowMs();
  const maxDepth = Math.max(0, Number(options.maxDepth) || 0);
  const maxNodes = Math.max(1, Number(options.maxNodes) || 1);
  const maxMs = Math.max(1, Number(options.maxMs) || 1);
  const visited = new Set();
  let nodes = 0;
  let best = null;
  let level = [{
    cube: cloneCube(currentCube),
    moves: [],
    lastFace: '',
  }];

  for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
    const nextLevel = [];
    for (const node of level) {
      if (nodes >= maxNodes || nowMs() - startedAt > maxMs) {
        return best?.moves || null;
      }

      const signature = cubeFacesSignature(facesFromCube(node.cube));
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
      for (const token of searchMoveTokens) {
        const move = parseScramble(token)[0];
        if (move.face === node.lastFace) continue;
        const nextCube = cloneCube(node.cube);
        applyMove(nextCube, move);
        nextLevel.push({
          cube: nextCube,
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

function inverseMoveTokens(tokens) {
  return tokens.slice().reverse().map((token) => {
    const move = parseScramble(token)[0];
    if (move.suffix === '2') return `${move.face}2`;
    if (move.suffix === "'") return move.face;
    return `${move.face}'`;
  });
}

function simplifyMoveTokens(tokens) {
  const simplified = [];
  for (const token of tokens.filter(Boolean)) {
    const move = parseScramble(token)[0];
    const previousToken = simplified.at(-1);
    const previousMove = previousToken ? parseScramble(previousToken)[0] : null;
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
