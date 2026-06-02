import test from 'node:test';
import { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  cubeCorrectionSolverStatus,
  solveCorrectionToScrambleTarget,
  stopCubeCorrectionSolver,
  warmCubeCorrectionSolver,
} from '../src/cube-solver.js';
import {
  cubeFacesSignature,
  cubeStateFromScramble,
  facesToFaceletString,
  relativeFaceletsForScrambleTargetFacelets,
} from '../src/cube-state.js';

afterEach(() => {
  stopCubeCorrectionSolver();
});

test('solves correction from synced facelets to scramble target', async () => {
  const target = "R U R' U' F2 L D";
  const current = "R U R' U' F F D R R' U U'";
  const result = await solveCorrectionToScrambleTarget(
    target,
    facesToFaceletString(cubeStateFromScramble(current)),
    { timeoutMs: 6000 },
  );

  assert.ok(result.moves.length > 0);
  assert.ok(result.moves.length < current.split(/\s+/).length);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${result.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );

  const cached = await solveCorrectionToScrambleTarget(
    target,
    facesToFaceletString(cubeStateFromScramble(current)),
    { timeoutMs: 6000 },
  );
  assert.equal(cached.source, 'min2phase-cache');
  assert.deepEqual(cached.moves, result.moves);
});

test('solves correction with precomputed target facelets', async () => {
  const target = "R U R' U' F2 L D";
  const current = "R U R' U' F F D R R' U U'";
  const result = await solveCorrectionToScrambleTarget(
    target,
    facesToFaceletString(cubeStateFromScramble(current)),
    {
      targetFacelets: facesToFaceletString(cubeStateFromScramble(target)),
      timeoutMs: 6000,
    },
  );

  assert.ok(result.moves.length > 0);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${result.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('solves correction with precomputed relative facelets', async () => {
  const target = "R U R' U' F2 L D";
  const current = "R U R' U' F F D R R' U U'";
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const result = await solveCorrectionToScrambleTarget(
    target,
    currentFacelets,
    {
      relativeFacelets: relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
      timeoutMs: 6000,
    },
  );

  assert.ok(result.moves.length > 0);
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${result.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('shares concurrent correction solves for the same relative state', async () => {
  stopCubeCorrectionSolver();
  const target = "F R U R' U' F' L2 D B2";
  const current = "F R U R' U' F' L2 D B2 U R2";
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const relativeFacelets = relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets);

  const [first, second] = await Promise.all([
    solveCorrectionToScrambleTarget(target, currentFacelets, { relativeFacelets, timeoutMs: 6000 }),
    solveCorrectionToScrambleTarget(target, currentFacelets, { relativeFacelets, timeoutMs: 6000 }),
  ]);

  assert.deepEqual(first.moves, second.moves);
  assert.equal(second.source, 'min2phase-shared');
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${first.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('aborts stale correction solves without poisoning the solver', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    solveCorrectionToScrambleTarget(
      'R U',
      facesToFaceletString(cubeStateFromScramble('R')),
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );

  const result = await solveCorrectionToScrambleTarget(
    'R U',
    facesToFaceletString(cubeStateFromScramble('R')),
    { timeoutMs: 6000 },
  );
  assert.deepEqual(result.moves, ['U']);
});

test('aborting an in-flight correction keeps the warmed solver process alive', async () => {
  stopCubeCorrectionSolver();
  assert.equal(await warmCubeCorrectionSolver(), true);

  const target = "R U R' U' F2 L D B2 U R2 F";
  const current = `${target} R U F D L' D B2 U2 R L F' D2`;
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const controller = new AbortController();
  const promise = solveCorrectionToScrambleTarget(
    target,
    currentFacelets,
    {
      targetFacelets,
      relativeFacelets: relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
      timeoutMs: 6000,
      signal: controller.signal,
    },
  );

  await Promise.resolve();
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });

  const status = cubeCorrectionSolverStatus();
  assert.equal(status.running, true);
  assert.equal(status.warmed, true);

  const result = await solveCorrectionToScrambleTarget(
    target,
    currentFacelets,
    {
      targetFacelets,
      relativeFacelets: relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
      timeoutMs: 6000,
    },
  );
  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${result.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
});

test('warms the real cube correction solver path before correction requests', async () => {
  stopCubeCorrectionSolver();
  assert.equal(await warmCubeCorrectionSolver(), true);
  const warmedStatus = cubeCorrectionSolverStatus();
  assert.equal(warmedStatus.running, true);
  assert.equal(warmedStatus.warmed, true);
  assert.equal(warmedStatus.idleTimer, true);

  const target = "R U R' U' F2 L D B2 U R2 F";
  const current = `${target} R U F D L' D`;
  const targetFacelets = facesToFaceletString(cubeStateFromScramble(target));
  const currentFacelets = facesToFaceletString(cubeStateFromScramble(current));
  const result = await solveCorrectionToScrambleTarget(
    target,
    currentFacelets,
    {
      targetFacelets,
      relativeFacelets: relativeFaceletsForScrambleTargetFacelets(targetFacelets, currentFacelets),
      timeoutMs: 6000,
    },
  );

  assert.equal(
    cubeFacesSignature(cubeStateFromScramble(`${current} ${result.correction}`)),
    cubeFacesSignature(cubeStateFromScramble(target)),
  );
  assert.equal(cubeCorrectionSolverStatus().running, true);
});
