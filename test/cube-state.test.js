import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMovesToFacelets,
  applyMove,
  correctionMovesReachFacelets,
  correctionMovesFromFacesToScrambleTarget,
  correctionMovesToScrambleTarget,
  cubeFromFacelets,
  cubeFromFaces,
  cubeFacesSignature,
  cubeStateFromScramble,
  createSolvedCube,
  facesToFaceletString,
  faceletsFromCube,
  faceletsFromScramble,
  facesFromFacelets,
  facesFromCube,
  isSolvedFacelets,
  isSolvedFaces,
  parseMoveToken,
  parseScramble,
  relativeFaceletsForScrambleTarget,
  relativeFaceletsForScrambleTargetFacelets,
  scrambleBacktrackCorrectionPlan,
  shortCorrectionMovesForRelativeFacelets,
  solvedFaceletString,
  warmShortCorrectionSearch,
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

test('parses cached single move tokens for hot paths', () => {
  assert.deepEqual(parseMoveToken("Uw2"), { face: 'u', suffix: '2' });
  assert.deepEqual(parseMoveToken("R'"), { face: 'R', suffix: "'" });
  assert.throws(() => parseMoveToken('Rw3'), /Unsupported scramble move/);
});

test('cube preview keeps nine stickers on each face', () => {
  const faces = cubeStateFromScramble("R U R' U'");
  for (const face of Object.values(faces)) {
    assert.equal(face.length, 3);
    assert.equal(face.flat().length, 9);
    assert.ok(face.flat().every((sticker) => sticker?.color));
  }
});

test('exports facelets directly from a movable cube', () => {
  const scramble = "R U R' U' F2 L D";
  const cube = createSolvedCube();
  for (const move of parseScramble(scramble)) applyMove(cube, move);

  assert.equal(faceletsFromCube(cube), facesToFaceletString(cubeStateFromScramble(scramble)));
  assert.equal(faceletsFromCube(createSolvedCube()), solvedFaceletString);
});

test('fast facelet engine matches movable cube state previews', () => {
  const scramble = "R U R' U' F2 L D B2 x y' Uw2 M E' S";
  const cube = createSolvedCube();
  for (const move of parseScramble(scramble)) applyMove(cube, move);
  const facelets = faceletsFromScramble(scramble);

  assert.equal(facelets, faceletsFromCube(cube));
  assert.deepEqual(facesFromFacelets(facelets), facesFromCube(cube));
  assert.deepEqual(cubeStateFromScramble(scramble), facesFromFacelets(facelets));
});

test('fast facelet engine can continue from an arbitrary facelet state', () => {
  const start = faceletsFromScramble("R U F2 L D");
  const continued = applyMovesToFacelets(start, "B2 R' U2");

  assert.equal(continued, faceletsFromScramble("R U F2 L D B2 R' U2"));
});

test('rebuilds a movable cube directly from facelets', () => {
  const facelets = facesToFaceletString(cubeStateFromScramble("R U R' U' F2"));
  const cube = cubeFromFacelets(facelets);
  assert.equal(faceletsFromCube(cube), facelets);
});

test('four quarter turns return the preview to solved state', () => {
  for (const move of ['R', 'U', 'F', 'M', 'E', 'S', 'x', 'y', 'z', 'r', 'u', 'f']) {
    assert.deepEqual(cubeStateFromScramble(`${move} ${move} ${move} ${move}`), facesFromCube(createSolvedCube()));
  }
});

test('detects solved state after applying inverse moves', () => {
  assert.equal(isSolvedFaces(cubeStateFromScramble('R U')), false);
  assert.equal(isSolvedFaces(cubeStateFromScramble("R U U' R'")), true);
  assert.equal(isSolvedFacelets(faceletsFromScramble('R U')), false);
  assert.equal(isSolvedFacelets(faceletsFromScramble("R U U' R'")), true);
  assert.equal(isSolvedFacelets('invalid'), false);
});

test('rebuilds a movable cube from face state snapshots', () => {
  const faces = cubeStateFromScramble('R U');
  const cube = cubeFromFaces(faces);
  for (const move of parseScramble("U' R'")) applyMove(cube, move);

  assert.equal(isSolvedFaces(facesFromCube(cube)), true);
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

test('builds a direct backtrack only from the original scramble route', () => {
  const target = "D R' D' L' B' U B R' F2 R2 U2 R' U2 L' U B2 R D2";
  const baseFacelets = faceletsFromScramble('D');
  const currentFacelets = applyMovesToFacelets(baseFacelets, "B'");
  const targetFacelets = faceletsFromScramble(target);
  const resumeMoves = parseScramble("R' D' L' B' U B R' F2 R2 U2 R' U2 L' U B2 R D2")
    .map((move) => `${move.face}${move.suffix}`);
  const plan = scrambleBacktrackCorrectionPlan({
    baseFacelets,
    currentFacelets,
    targetFacelets,
    wrongMoves: ["B'"],
    resumeMoves,
    maxWrongMoves: 4,
    maxMoves: 25,
  });

  assert.deepEqual(plan?.undoMoves, ['B']);
  assert.deepEqual(plan?.resumeMoves, resumeMoves);
  assert.equal(correctionMovesReachFacelets(currentFacelets, targetFacelets, plan?.moves), true);
  assert.equal(
    scrambleBacktrackCorrectionPlan({
      baseFacelets,
      currentFacelets,
      targetFacelets,
      wrongMoves: ["B'"],
      resumeMoves,
      fromCorrectionRoute: true,
    }),
    null,
  );
});

test('rejects correction formulas that do not reach the requested target', () => {
  const currentFacelets = faceletsFromScramble('R U');
  const targetFacelets = faceletsFromScramble("R U F'");

  assert.equal(correctionMovesReachFacelets(currentFacelets, targetFacelets, ["F'"]), true);
  assert.equal(correctionMovesReachFacelets(currentFacelets, targetFacelets, ['F']), false);
});

test('finds a correction from synced cube faces to a scramble target', () => {
  const target = "R U R' U'";
  const currentFaces = cubeStateFromScramble('R U D U\' D\'');
  const correction = correctionMovesFromFacesToScrambleTarget(target, currentFaces, {
    maxDepth: 5,
    maxMs: 1000,
    maxNodes: 500000,
  });

  const cube = cubeFromFaces(currentFaces);
  for (const move of parseScramble(correction.join(' '))) applyMove(cube, move);

  assert.deepEqual(correction, ['U', "R'", "U'"]);
  assert.equal(
    cubeFacesSignature(facesFromCube(cube)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('face-based correction stays short after multiple wrong turns', () => {
  const target = "R U R' U' F2 L D";
  const wrongInput = "R U R' U' F F D R R' U U'";
  const correction = correctionMovesFromFacesToScrambleTarget(target, cubeStateFromScramble(wrongInput), {
    maxDepth: 6,
    maxMs: 1000,
    maxNodes: 500000,
  });

  assert.ok(correction.length > 0);
  assert.ok(correction.length < parseScramble(wrongInput).length);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${wrongInput} ${correction.join(' ')}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('builds relative facelets from synced cube state to scramble target', () => {
  assert.equal(
    relativeFaceletsForScrambleTarget('R U', cubeStateFromScramble('R')),
    facesToFaceletString(cubeStateFromScramble("U'")),
  );
  assert.equal(
    relativeFaceletsForScrambleTarget('R U', cubeStateFromScramble('R U')),
    solvedFaceletString,
  );
});

test('builds relative facelets directly from a cached target state', () => {
  const target = 'R U F2 L D';
  const current = cubeStateFromScramble('R U F F D');
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));

  assert.equal(
    relativeFaceletsForScrambleTargetFacelets(targetFacelets, current),
    relativeFaceletsForScrambleTarget(target, current),
  );
});

test('finds short exact corrections from relative facelets without cube cloning search', () => {
  const target = "F R U R' U' F' L2 D B2";
  const current = `${target} U R2`;
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const correction = shortCorrectionMovesForRelativeFacelets(
    relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
    { maxDepth: 4, maxMs: 1000 },
  );

  assert.deepEqual(correction, ['R2', "U'"]);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${correction.join(' ')}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('finds six-step local corrections after warming the bidirectional table', () => {
  const target = "R U R' U' F2 L D";
  const current = `${target} R U F D L' D`;
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const relative = relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets);

  assert.equal(warmShortCorrectionSearch({ maxDepth: 6, maxMs: 1000, maxNodes: 200000 }), true);
  const correction = shortCorrectionMovesForRelativeFacelets(relative, {
    maxDepth: 6,
    maxMs: 1000,
    maxNodes: 200000,
  });

  assert.ok(Array.isArray(correction));
  assert.ok(correction.length <= 6);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${correction.join(' ')}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('finds eight-step local corrections after warming the bidirectional table', () => {
  const target = "R U R' U' F2 L D B2 R2 U2";
  const current = `${target} R U F D L B R2 U2`;
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const relative = relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets);

  assert.equal(warmShortCorrectionSearch({ maxDepth: 8, maxMs: 1000, maxNodes: 1000000 }), true);
  const correction = shortCorrectionMovesForRelativeFacelets(relative, {
    maxDepth: 8,
    maxMs: 100,
    maxNodes: 1000000,
  });

  assert.ok(Array.isArray(correction));
  assert.ok(correction.length <= 8);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${correction.join(' ')}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('short exact correction returns null when depth limit is too small', () => {
  const relative = facesToFaceletString(cubeStateFromScramble('R U F'));
  assert.equal(shortCorrectionMovesForRelativeFacelets(relative, { maxDepth: 2, maxMs: 1000 }), null);
});

test('warms short correction search tables and caches misses', () => {
  assert.equal(warmShortCorrectionSearch({ maxDepth: 4, maxMs: 1000 }), true);
  const relative = facesToFaceletString(cubeStateFromScramble('R U F R'));
  assert.equal(shortCorrectionMovesForRelativeFacelets(relative, { maxDepth: 3, maxMs: 1000 }), null);
  const startedAt = performance.now();
  assert.equal(shortCorrectionMovesForRelativeFacelets(relative, { maxDepth: 3, maxMs: 1000 }), null);
  assert.ok(performance.now() - startedAt < 1);
});
