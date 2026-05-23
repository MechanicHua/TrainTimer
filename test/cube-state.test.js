import test from 'node:test';
import assert from 'node:assert/strict';
import { cubeStateFromScramble, createSolvedCube, facesFromCube, isSolvedFaces, parseScramble } from '../src/cube-state.js';

test('parses WCA-style 3x3 moves', () => {
  assert.deepEqual(parseScramble("R U2 F'"), [
    { face: 'R', suffix: '' },
    { face: 'U', suffix: '2' },
    { face: 'F', suffix: "'" },
  ]);
});

test('cube preview keeps nine stickers on each face', () => {
  const faces = cubeStateFromScramble("R U R' U'");
  for (const face of Object.values(faces)) {
    assert.equal(face.length, 3);
    assert.equal(face.flat().length, 9);
    assert.ok(face.flat().every((sticker) => sticker?.color));
  }
});

test('four quarter turns return the preview to solved state', () => {
  assert.deepEqual(cubeStateFromScramble('R R R R'), facesFromCube(createSolvedCube()));
  assert.deepEqual(cubeStateFromScramble('U U U U'), facesFromCube(createSolvedCube()));
  assert.deepEqual(cubeStateFromScramble('F F F F'), facesFromCube(createSolvedCube()));
});

test('detects solved state after applying inverse moves', () => {
  assert.equal(isSolvedFaces(cubeStateFromScramble('R U')), false);
  assert.equal(isSolvedFaces(cubeStateFromScramble("R U U' R'")), true);
});

test('single R and U moves follow standard face-turn direction', () => {
  const r = cubeStateFromScramble('R');
  assert.equal(r.U.map((row) => row[2].face).join(''), 'FFF');
  assert.equal(r.F.map((row) => row[2].face).join(''), 'DDD');
  assert.equal(r.D.map((row) => row[2].face).join(''), 'BBB');
  assert.equal(r.B.map((row) => row[0].face).join(''), 'UUU');

  const u = cubeStateFromScramble('U');
  assert.equal(u.F[0].map((sticker) => sticker.face).join(''), 'RRR');
  assert.equal(u.R[0].map((sticker) => sticker.face).join(''), 'BBB');
  assert.equal(u.B[0].map((sticker) => sticker.face).join(''), 'LLL');
  assert.equal(u.L[0].map((sticker) => sticker.face).join(''), 'FFF');
});
