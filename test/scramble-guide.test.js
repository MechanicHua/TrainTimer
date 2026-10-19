import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as cube from '../src/cube-state.js';

// Exercise the production guide and incremental renderer without starting the
// entire application or requiring a physical Bluetooth cube.
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const functions = [
  'buildScrambleGuideRoute', 'scrambleMoveAtomicEntries', 'scrambleMoveNotation',
  'scrambleGuideRouteEntriesByFacelets', 'scrambleGuideNextRouteMatch',
  'scrambleGuideMoveWouldStayOnRoute', 'advanceScrambleGuideProgressWithExpectedMove',
  'applyScrambleGuideRouteMatch', 'applyScrambleGuideMoves', 'updateScrambleGuideProgress',
  'scrambleGuideRouteEntryMatchesTarget', 'completeScrambleGuide',
  'advanceScrambleGuideTrackingState', 'setScrambleGuideTrackingFacelets',
  'scrambleGuideHasSyncedState', 'scrambleGuideSyncedFacelets',
  'scrambleMoveClass', 'scrambleMoveTitle', 'scrambleGuideCompletedMoveCount',
  'scrambleGuideVisualState', 'scrambleGuideChangedVisualIndexes',
  'addScrambleGuideVisualIndexRange', 'addScrambleGuideVisualIndex',
  'updateScrambleGuideMoveNode', 'updateScrambleGuideMoveNodes', 'renderScrambleText',
  'scrambleGuideBacktrackCorrection',
].map((name) => {
  const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `production function ${name} exists`);
  return match[0];
}).join('\n');

function guide(text) {
  const noop = () => {};
  const ctx = vm.createContext({
    ...cube,
    scramble: { scramble: text },
    scrambleGuideSupported: true,
    scrambleGuideCompleted: false,
    scrambleGuideInputMoves: [],
    scrambleGuideErrorIndex: null,
    scrambleGuideErrorMove: '',
    scrambleGuideAwaitingSyncedState: false,
    scrambleGuideTrackingFaces: null,
    bluetoothPhysicalFaces: null,
    bluetoothPhysicalFacelets: '',
    scrambleGuideMoves: text.split(' '),
    scrambleGuideMovesText: text,
    scrambleGuideStructureKey: '',
    scrambleTextRenderKey: '',
    scrambleGuideRenderedVisualState: null,
    scrambleGuideBacktrackCorrectionMaxWrongMoves: 4,
    scrambleGuideBacktrackCorrectionMaxMoves: 25,
    appState: 'ready',
    beepCount: 0,
    inspectionCount: 0,
    logs: [],
    document: {
      createElement: () => ({ className: '', dataset: {}, textContent: '', title: '' }),
      createTextNode: (textContent) => ({ textContent }),
    },
    elements: { scrambleText: { replaceChildren: noop } },
    incrementPerformanceCounter: noop,
    bluetoothScrambleGuideActive: () => true,
    updateBluetooth3dMove: noop,
    renderReadyTimerHint: noop,
    scrambleGuideCorrectionRouteEntry: () => null,
    scrambleGuideDeferredCorrectionSnapshot: () => ({}),
    scrambleGuideCorrectionText: () => '',
    normalizeCorrectionMoves: (moves) => moves,
    correctionMovesFromSegments: (segments) => segments.map(({ move }) => move),
  });
  vm.runInContext(functions + `
    function beep() { beepCount += 1; }
    function addBluetoothLog(...args) { logs.push(args); }
    function startInspection() { inspectionCount += 1; appState = 'inspection'; }
    function renderScrambleGuideDisplay() {
      if (scrambleGuideErrorIndex == null) renderScrambleText();
    }
    const scrambleGuideRoute = buildScrambleGuideRoute(parseScramble(scramble.scramble));
    const scrambleGuideRouteByFacelets = scrambleGuideRouteEntriesByFacelets(scrambleGuideRoute);
    const scrambleGuideTargetFacelets = scrambleGuideRoute.at(-1).facelets;
    applyScrambleGuideRouteMatch(scrambleGuideRoute[0]);
    renderScrambleText();
  `, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return {
    run,
    ctx,
    move: (...moves) => run(`applyScrambleGuideMoves(${JSON.stringify(moves)}, 'test')`),
    classes: () => Array.from(run('scrambleGuideMoveNodes'), (node) => node.className.replace('scramble-move', '').trim()),
  };
}

for (const [a, b, next] of [['L', 'R', 'U'], ['U', 'D', 'F'], ['F', 'B', 'R']]) {
  for (const [first, second] of [[a, b], [b, a]]) {
    for (const s1 of ['', "'", '2']) {
      for (const s2 of ['', "'", '2']) {
        test(`advance ${second + s2} before ${first + s1} without an error`, () => {
          const g = guide(`${first + s1} ${second + s2} ${next}`);
          assert.equal(g.run(`scrambleGuideMoveWouldStayOnRoute(${JSON.stringify(second + s2)})`), true);
          assert.equal(g.move(second + s2).statusLabel, '打乱 1/3');
          assert.deepEqual(g.classes(), ['current', 'correct', '']);
          assert.equal(g.run('scrambleGuideMoveNodes[1].title'), '已完成');
          assert.equal(g.ctx.scrambleGuideErrorIndex, null);
          assert.equal(g.ctx.beepCount, 0);
          g.move(first + s1);
          assert.deepEqual(g.classes(), ['correct', 'correct', 'current']);
          assert.equal(g.ctx.inspectionCount, 0);
          g.move(next);
          assert.equal(g.ctx.inspectionCount, 1);
          assert.deepEqual(g.classes(), ['correct', 'correct', 'correct']);
        });
      }
    }
  }
}

test('interleaved quarter turns of opposite double turns keep both partial states and repaint completed moves', () => {
  const g = guide('L2 R2 U');
  g.move('R');
  assert.deepEqual(g.classes(), ['current', 'partial', '']);
  g.move('L');
  assert.deepEqual(g.classes(), ['partial', 'partial', '']);
  g.move('R');
  assert.deepEqual(g.classes(), ['partial', 'correct', '']);
  g.move('L');
  assert.deepEqual(g.classes(), ['correct', 'correct', 'current']);
  assert.equal(g.ctx.beepCount, 0);
});

test('undoing an early completed move removes its green state even when the correct prefix is unchanged', () => {
  const g = guide('L R U');
  g.move('R');
  g.move("R'");
  assert.deepEqual(g.classes(), ['current', '', '']);
  assert.equal(g.ctx.beepCount, 0);
});

test('normal ordering and swapped ordering inside a longer scramble both work', () => {
  const normal = guide("F L R' U");
  normal.move('F', 'L', "R'");
  assert.deepEqual(normal.classes(), ['correct', 'correct', 'correct', 'current']);
  const swapped = guide("F L R' U");
  swapped.move('F', "R'");
  assert.deepEqual(swapped.classes(), ['correct', 'current', 'correct', '']);
  swapped.move('L');
  assert.deepEqual(swapped.classes(), normal.classes());
  assert.equal(swapped.ctx.beepCount, 0);
});

test('noncommuting moves and swapping across an intervening axis still trigger errors', () => {
  for (const text of ['L U F', 'L U R']) {
    const g = guide(text);
    assert.equal(g.move(text.split(' ').at(-1)).statusLabel, '打乱错误');
    assert.equal(g.ctx.beepCount, 1);
    assert.equal(g.ctx.scrambleGuideErrorIndex, 0);
  }
});

test('wrong moves after an early completion can be undone and corrected without repeating the completed turn', () => {
  const g = guide('L R U');
  g.move('R');
  assert.equal(g.move('F').statusLabel, '打乱错误');
  const plan = g.run('scrambleGuideBacktrackCorrection(scrambleGuideTrackingFacelets)');
  assert.ok(plan);
  assert.equal(
    cube.applyMovesToFacelets(g.ctx.scrambleGuideTrackingFacelets, Array.from(plan.moves).join(' ')),
    cube.faceletsFromScramble('L R U'),
  );
  assert.deepEqual(Array.from(plan.segments.filter((segment) => segment.kind === 'resume'), ({ move }) => move), ['L', 'U']);
  g.move("F'");
  assert.equal(g.ctx.scrambleGuideErrorIndex, null);
  assert.deepEqual(g.classes(), ['current', 'correct', '']);
});

test('state synchronization accepts the swapped intermediate state and all branch continuations reach the original target', () => {
  const g = guide("F L2 R2 U D' B");
  const facelets = cube.faceletsFromScramble('F R2');
  g.ctx.syncedTestFacelets = facelets;
  g.run('updateScrambleGuideProgress("", { syncedFacelets: syncedTestFacelets }); renderScrambleText();');
  assert.deepEqual(g.classes(), ['correct', 'current', 'correct', '', '', '']);
  assert.equal(g.ctx.scrambleGuideErrorIndex, null);
  assert.equal(g.run(`Array.from(scrambleGuideRouteByFacelets.values()).every((entry) =>
    !entry.resumeMoves || applyMovesToFacelets(entry.facelets, entry.resumeMoves.join(' ')) === scrambleGuideTargetFacelets
  )`), true);
});


for (const face of ['R', 'L', 'U', 'D', 'F', 'B']) {
  for (const suffix of ['', "'"]) {
    test(`${face}2 accepts two ${face}${suffix} turns`, () => {
      const g = guide(`${face}2 ${face === 'U' ? 'F' : 'U'}`);
      g.move(`${face}${suffix}`);
      assert.deepEqual(g.classes(), ['partial', '']);
      assert.equal(g.run('scrambleGuideErrorIndex'), null);
      g.move(`${face}${suffix}`);
      assert.deepEqual(g.classes(), ['correct', 'current']);
      assert.equal(g.run('scrambleGuideErrorIndex'), null);
    });
  }
}

test('inverse double turns can interleave across opposite faces', () => {
  const g = guide('R2 L2 U');
  g.move("R'", "L'");
  assert.deepEqual(g.classes(), ['partial', 'partial', '']);
  g.move("L'", "R'");
  assert.deepEqual(g.classes(), ['correct', 'correct', 'current']);
});

test('gestures depend on solved state, regardless of earlier scramble input or errors', () => {
  const fn = source.match(/function shouldProcessBluetoothNextSolveGesture\([^]*?^}/m)[0];
  const ctx = vm.createContext({ appState: 'ready', bluetoothNextSolveGestureLoading: false,
    bluetoothNextSolveGestureCandidate: null, bluetoothPhysicalFacelets: cube.solvedFaceletString,
    scrambleGuideSyncedFacelets: () => ctx.facelets, isSolvedFacelets: cube.isSolvedFacelets,
    facelets: cube.solvedFaceletString, scrambleGuideInputMoves: ['R', "R'"], scrambleGuideErrorIndex: 0 });
  vm.runInContext(fn, ctx);
  assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), true);
  ctx.facelets = cube.faceletsFromScramble('R');
  assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), false);
  ctx.bluetoothNextSolveGestureCandidate = { move: 'R', deferred: true };
  assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), true);
  for (const state of ['inspection', 'timing', 'saving']) {
    ctx.appState = state;
    assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), false);
  }
  ctx.appState = 'done';
  ctx.bluetoothNextSolveGestureCandidate = null;
  assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), true);
  ctx.bluetoothNextSolveGestureLoading = true;
  assert.equal(ctx.shouldProcessBluetoothNextSolveGesture(), false);
});


function liveGuide(text) {
  const g = guide(text), c = g.ctx;
  Object.assign(c, {
    bluetoothNextSolveGestureLoading: false, bluetoothNextSolveGestureCandidate: null,
    bluetoothNextSolveGestureFlushTimer: 0, bluetoothNextSolveGestureWindowMs: 700,
    bluetooth3dLiveMoveFacelets: cube.solvedFaceletString, bluetoothSolveFacelets: '',
    solveReplayPreviewActive: false, performance: { now: () => c.now }, now: 10,
    inspectionBluetoothStartBlockedUntil: 1000, animations: [], nextCount: 0,
    window: { setTimeout: () => 1 }, clearTimeout() {},
    updateBluetooth3dMoves(moves, options) { c.animations.push({ moves: [...moves], options }); },
    triggerBluetoothNextSolveGesture() { c.nextCount++; c.bluetoothNextSolveGestureCandidate = null; },
  });
  const names = ['handleBluetoothMovesForCurrentState', 'animateBluetoothLiveMoves',
    'normalizedBluetoothMoveList', 'processBluetoothNextSolveGesture', 'shouldProcessBluetoothNextSolveGesture',
    'normalizeBluetoothNextSolveGestureMove', 'isOppositeBluetoothNextSolveGesture',
    'currentBluetoothNextSolveGestureCandidate', 'setBluetoothNextSolveGestureCandidate',
    'clearBluetoothNextSolveGestureCandidate', 'flushDeferredBluetoothNextSolveGesture',
    'bluetoothCube3dMoveTargetsFromFacelets'];
  vm.runInContext(names.map(name => source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0]).join('\n'), c);
  return { ...g, input: moves => c.handleBluetoothMovesForCurrentState(moves, 'test') };
}

test('correct first move advances immediately, remains a gesture candidate, and never replays on expiry', () => {
  const g = liveGuide('R U F');
  g.input(['R']);
  assert.equal(g.run('scrambleGuideCorrectPrefix'), 1);
  assert.equal(g.ctx.bluetoothNextSolveGestureCandidate.deferred, false);
  assert.equal(g.ctx.animations.length, 1);
  g.ctx.now = 800;
  g.ctx.currentBluetoothNextSolveGestureCandidate();
  assert.equal(g.run('scrambleGuideCorrectPrefix'), 1);
  assert.equal(g.ctx.animations.length, 1);
});

test('correct first move followed by inverse still triggers next-solve gesture', () => {
  const g = liveGuide('R U F');
  g.input(['R']); g.input(["R'"]);
  assert.equal(g.ctx.nextCount, 1);
  assert.equal(g.ctx.bluetoothNextSolveGestureCandidate, null);
  assert.equal(g.ctx.animations.length, 2);
});

test('correct batched first moves and split inverse half turns advance without delay or duplicate animation', () => {
  for (const moves of [['R', 'U'], ["R'", "R'"]]) {
    const g = liveGuide(moves[0] === 'R' ? 'R U F' : 'R2 U F');
    g.input(moves);
    assert.equal(g.run('scrambleGuideCorrectPrefix'), moves[0] === 'R' ? 2 : 1);
    assert.equal(g.ctx.nextCount, 0);
    assert.equal(g.ctx.animations.length, 1);
    assert.deepEqual(g.ctx.animations[0].moves, moves);
  }
});

test('wrong gesture candidate animates immediately and deferred guide delivery does not animate twice', () => {
  const g = liveGuide('R U F');
  g.input(['F']);
  assert.equal(g.ctx.animations.length, 1);
  assert.equal(g.run('scrambleGuideInputMoves.length'), 0);
  let duplicate = 0;
  g.ctx.updateBluetooth3dMove = () => duplicate++;
  g.ctx.flushDeferredBluetoothNextSolveGesture();
  assert.equal(g.run('scrambleGuideInputMoves.length'), 1);
  assert.equal(duplicate, 0);
});

test('idle, saving, completed guide and blocked inspection all animate without recording solve moves', () => {
  for (const state of ['done', 'saving', 'hold', 'inspection', 'ready']) {
    const g = liveGuide('R U F');
    g.ctx.appState = state;
    g.run('scrambleGuideCompleted = true');
    const result = g.input(['R']);
    assert.equal(g.ctx.animations.length, 1, state);
    assert.equal(result.trackingMoves, false, state);
    assert.equal(g.ctx.animations[0].options.targets[0].targetFacelets, cube.faceletsFromScramble('R'));
  }
});

test('packet final state produces ordered targets and consecutive idle packets retain their state', () => {
  const g = liveGuide('R U F'); g.ctx.appState = 'saving';
  const final = cube.faceletsFromScramble('R U');
  g.ctx.handleBluetoothMovesForCurrentState(['R', 'U'], 'test', '', '', { syncedFacelets: final });
  const targets = g.ctx.animations[0].options.targets;
  assert.equal(targets[0].targetFacelets, cube.faceletsFromScramble('R'));
  assert.equal(targets[1].targetFacelets, final);
  g.input(['F']);
  assert.equal(g.ctx.animations[1].options.targets[0].targetFacelets, cube.faceletsFromScramble('R U F'));
});
