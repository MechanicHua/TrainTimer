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

export function cubeStateFromScramble(scramble) {
  const cube = createSolvedCube();
  for (const move of parseScramble(scramble)) applyMove(cube, move);
  return facesFromCube(cube);
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
