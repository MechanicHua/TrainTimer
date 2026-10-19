import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as cube from '../src/cube-state.js';
import { logicalMoveSequence } from '../src/move-metrics.js';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const names = ['rememberScrambleGuideCorrectionRoute', 'normalizeCorrectionMoves', 'normalizeCorrectionSegments',
  'correctionSegmentKind', 'mergeCorrectionSegments', 'mergedCorrectionMove', 'correctionMovesFromSegments',
  'correctionAtomicSegments', 'correctionRemainingSegmentsAfterAtomic', 'scrambleMoveAtomicEntries', 'scrambleMoveNotation'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0]).join('\n');

for (const face of ['R', 'L', 'U', 'D', 'F', 'B']) {
  test(`correction ${face}2 accepts both directions and every cached remainder reaches target`, () => {
    const start = cube.faceletsFromScramble("R U F' L D2");
    const target = cube.applyMovesToFacelets(start, [`${face}2`, 'U', 'F2']);
    const context = vm.createContext({ ...cube, logicalMoveSequence,
      scrambleGuideSupported: true, scrambleGuideTargetFacelets: target,
      scrambleGuideParsedMove: cube.parseMoveToken,
      scrambleGuideCorrectionScrambleKey: () => 'target',
      clearScrambleGuideCorrectionSnapshot() {}, clearScrambleGuideCorrectionRoute() {},
    });
    vm.runInContext(functions, context);
    assert.equal(context.rememberScrambleGuideCorrectionRoute(start, [`${face}2`, 'U', 'F2']), true);
    for (const turn of [face, `${face}'`]) {
      const midpoint = cube.applyMoveToFacelets(start, turn);
      assert.ok(context.scrambleGuideCorrectionRouteByFacelets.has(midpoint));
    }
    for (const [state, entry] of context.scrambleGuideCorrectionRouteByFacelets) {
      assert.equal(cube.applyMovesToFacelets(state, Array.from(entry.moves)), target);
    }
    assert.equal(context.rememberScrambleGuideCorrectionRoute(start, ['U']), false);
  });
}

test('scramble and correction moves bypass the next-solve gesture without consuming undo', () => {
  const names = ['processBluetoothNextSolveGesture', 'shouldProcessBluetoothNextSolveGesture'];
  const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0]).join('\n');
  let cleared = false;
  const context = vm.createContext({ appState: 'ready', bluetoothNextSolveGestureLoading: false,
    scrambleGuideSupported: true, scrambleGuideCompleted: false, scrambleGuideErrorIndex: 0,
    bluetoothNextSolveGestureCandidate: null, scrambleGuideSyncedFacelets: () => cube.faceletsFromScramble('U'), isSolvedFacelets: cube.isSolvedFacelets,
    clearBluetoothNextSolveGestureCandidate() { cleared = true; } });
  vm.runInContext(functions, context);
  const moves = ['R', "R'", 'F', "F'"];
  const result = context.processBluetoothNextSolveGesture(moves, 'test');
  assert.equal(result.moves, moves);
  assert.equal(result.consumed, false);
  assert.equal(result.triggered, false);
  assert.equal(cleared, true);
});

test('late solver results are validated and cached without replacing the active route', () => {
  const start = cube.faceletsFromScramble('R U F');
  const target = cube.applyMovesToFacelets(start, ['L2']);
  let activations = 0;
  const context = vm.createContext({ ...cube, logicalMoveSequence,
    scrambleGuideTargetFacelets: target, scrambleGuideSolverCache: new Map(),
    scrambleGuideSolverRetryKey: '', scrambleGuideSolverCacheLimit: 10,
    rememberScrambleGuideCorrectionRoute() { activations++; return true; },
    clearScrambleGuideCorrectionSnapshot() {},
  });
  vm.runInContext(['rememberScrambleGuideSolverCache', 'normalizeCorrectionMoves', 'scrambleMoveNotation']
    .map(name => source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0]).join('\n'), context);
  assert.equal(context.rememberScrambleGuideSolverCache('old', ['L2'], { facelets: start, activate: false }), true);
  assert.equal(activations, 0);
  assert.equal(context.rememberScrambleGuideSolverCache('invalid', ['U'], { facelets: start, activate: false }), false);
  assert.equal(context.scrambleGuideSolverCache.has('invalid'), false);
  assert.equal(context.rememberScrambleGuideSolverCache('current', ['L2'], { facelets: start }), true);
  assert.equal(activations, 1);
});

test('a correction returns to the original formula on rejoining its route', () => {
  const state = cube.faceletsFromScramble('R');
  const target = cube.faceletsFromScramble('R U');
  const entry = { moves: ['U'] };
  const context = vm.createContext({ scrambleGuideErrorIndex: 0, scrambleGuideCorrectPrefix: 0,
    scrambleGuideInputMoves: ['F', "F'", 'R'], scrambleGuideTargetFacelets: target,
    scrambleGuideSyncedFacelets: () => state,
    scrambleGuideCorrectionRouteEntry: () => entry,
    scrambleGuideRouteByFacelets: new Map([[state, { correctPrefix: 1 }]]),
    applyScrambleGuideRouteMatch() { context.scrambleGuideErrorIndex = null; },
    clearScrambleGuideCorrectionSnapshot() {},
  });
  vm.runInContext(['updateScrambleGuideProgress', 'applyScrambleGuideCorrectionRouteMatch']
    .map(name => source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0]).join('\n'), context);
  const result = context.updateScrambleGuideProgress('R');
  assert.equal(result.correctPrefix, 1);
  assert.equal(result.correctionRoute, undefined);
  assert.equal(context.scrambleGuideErrorIndex, null);
});

test('a far-off cube follows the real solver correction to target with reverse double turns', async () => {
  const { solveCorrectionToScrambleTarget, stopCubeCorrectionSolver } = await import('../src/cube-solver.js');
  const targetText = "R2 U F' L2 D B2 U' R F2 D2 L' B";
  const target = cube.faceletsFromScramble(targetText);
  const start = cube.faceletsFromScramble("B U2 L F' R D2 B' R2 U L2 F D'");
  try {
    const result = await solveCorrectionToScrambleTarget(targetText, start, { targetFacelets: target, timeoutMs: 6000 });
    const context = vm.createContext({ ...cube, logicalMoveSequence,
      scrambleGuideSupported: true, scrambleGuideTargetFacelets: target,
      scrambleGuideParsedMove: cube.parseMoveToken,
      scrambleGuideCorrectionScrambleKey: () => 'target',
      clearScrambleGuideCorrectionSnapshot() {}, clearScrambleGuideCorrectionRoute() {},
    });
    vm.runInContext(functions, context);
    assert.equal(context.rememberScrambleGuideCorrectionRoute(start, result.moves), true);
    let current = start;
    for (const move of result.moves) {
      const turns = move.endsWith('2') ? [`${move[0]}'`, `${move[0]}'`] : [move];
      for (const turn of turns) {
        current = cube.applyMoveToFacelets(current, turn);
        const remainder = context.scrambleGuideCorrectionRouteByFacelets.get(current);
        assert.ok(remainder, `missing correction progress after ${turn}`);
        assert.equal(cube.applyMovesToFacelets(current, Array.from(remainder.moves)), target);
      }
    }
    assert.equal(current, target);
  } finally {
    stopCubeCorrectionSolver();
  }
});

test('untouched cube gesture changes formula; a non-gesture delivers both moves to the guide', () => {
  const applied = [];
  let triggered = 0;
  const context = vm.createContext({ appState: 'ready', bluetoothNextSolveGestureLoading: false,
    scrambleGuideSupported: true, scrambleGuideCompleted: false, scrambleGuideErrorIndex: null,
    scrambleGuideInputMoves: [], scrambleGuideRouteStateMatched: true, scrambleGuideRouteIndex: 0,
    bluetoothNextSolveGestureCandidate: null, isSolvedFacelets: cube.isSolvedFacelets,
    scrambleGuideSyncedFacelets: () => applied.length ? cube.faceletsFromScramble(applied.join(' ')) : cube.solvedFaceletString,
    scrambleGuideMoveWouldStayOnRoute: () => false,
    performance: { now: () => 10 },
    clearBluetoothNextSolveGestureCandidate() { context.bluetoothNextSolveGestureCandidate = null; },
    currentBluetoothNextSolveGestureCandidate() { return context.bluetoothNextSolveGestureCandidate; },
    setBluetoothNextSolveGestureCandidate(value) { context.bluetoothNextSolveGestureCandidate = value; },
    triggerBluetoothNextSolveGesture() { triggered++; },
    flushDeferredBluetoothNextSolveGesture() {
      applied.push(context.bluetoothNextSolveGestureCandidate.move);
      context.scrambleGuideInputMoves.push(context.bluetoothNextSolveGestureCandidate.move);
      context.bluetoothNextSolveGestureCandidate = null;
    },
  });
  vm.runInContext(['processBluetoothNextSolveGesture', 'shouldProcessBluetoothNextSolveGesture',
    'normalizeBluetoothNextSolveGestureMove', 'isOppositeBluetoothNextSolveGesture']
    .map(name => source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0]).join('\n'), context);
  assert.equal(context.processBluetoothNextSolveGesture(['R', "R'"], 'test').triggered, true);
  assert.equal(triggered, 1);
  assert.deepEqual(applied, []);
  const normal = context.processBluetoothNextSolveGesture(['R', 'U', 'F'], 'test');
  assert.deepEqual(applied, ['R']);
  assert.deepEqual(normal.moves, ['U', 'F']);
  assert.equal(normal.consumed, false);
  assert.equal(context.shouldProcessBluetoothNextSolveGesture(), false);
});
