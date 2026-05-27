import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionMovesToScrambleTarget,
  cubeFacesSignature,
  cubeStateFromScramble,
  createSolvedCube,
  facesFromCube,
  isSolvedFaces,
  parseScramble,
} from '../src/cube-state.js';

test('parses WCA-style 3x3 moves', () => {
  assert.deepEqual(parseScramble("R U2 F' M x r Uw2"), [
    { face: 'R', suffix: '' },
    { face: 'U', suffix: '2' },
    { face: 'F', suffix: "'" },
    { face: 'M', suffix: '' },
    { face: 'x', suffix: '' },
    { face: 'r', suffix: '' },
    { face: 'u', suffix: '2' },
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
  for (const move of ['R', 'U', 'F', 'M', 'E', 'S', 'x', 'y', 'z', 'r', 'u', 'f']) {
    assert.deepEqual(cubeStateFromScramble(`${move} ${move} ${move} ${move}`), facesFromCube(createSolvedCube()));
  }
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

test('slice, wide, and rotation moves match equivalent layer turns', () => {
  assert.deepEqual(cubeStateFromScramble('x'), cubeStateFromScramble("R M' L'"));
  assert.deepEqual(cubeStateFromScramble('y'), cubeStateFromScramble("U E' D'"));
  assert.deepEqual(cubeStateFromScramble('z'), cubeStateFromScramble("F S B'"));
  assert.deepEqual(cubeStateFromScramble('r'), cubeStateFromScramble("R M'"));
  assert.deepEqual(cubeStateFromScramble('Uw'), cubeStateFromScramble("U E'"));
});

test('finds a short correction from current scramble state to target state', () => {
  const target = "R U R' U'";
  const input = "R D U D'";
  const correction = correctionMovesToScrambleTarget(target, input, {
    maxDepth: 5,
    maxMs: 1000,
    maxNodes: 500000,
  });

  assert.deepEqual(correction, ["R'", "U'"]);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${input} ${correction.join(' ')}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('returns no correction when current scramble state already matches target', () => {
  assert.deepEqual(correctionMovesToScrambleTarget("R U R' U'", "R U R' U'"), []);
});
