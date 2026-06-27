import test from 'node:test';
import assert from 'node:assert/strict';
import { algorithmTrainerCases } from '../src/algorithm-trainer-cases.js';
import { faceletsFromScramble, parseScramble } from '../src/cube-state.js';
import {
  evaluateOpFormulaCandidate,
  opCaseIndex,
  opCaseLibrary,
  opEventsForSave,
  recognizeOllCase,
  recognizePllCase,
} from '../src/op-analysis.js';

test('builds unique OLL and PLL recognition signatures for built-in OP cases', () => {
  const library = opCaseLibrary();
  const counts = library.reduce((memo, item) => {
    memo[item.kind] = (memo[item.kind] || 0) + 1;
    return memo;
  }, {});

  assert.deepEqual(counts, { pll: 21, oll: 57 });
  for (const kind of ['oll', 'pll']) {
    const collisions = [...opCaseIndex()[kind].values()].filter((items) => items.length > 1);
    assert.deepEqual(collisions, []);
  }
});

test('recognizes OLL and PLL cases from case facelets independent of AUF', () => {
  const oll = caseById('oll-27');
  const pll = caseById('pll-t');
  const ollSetup = invertAlgorithm(oll.algorithm);
  const pllSetup = invertAlgorithm(pll.algorithm);

  assert.equal(recognizeOllCase(faceletsFromScramble(ollSetup)).caseId, 'oll-27');
  assert.equal(recognizeOllCase(faceletsFromScramble(`${ollSetup} U`)).caseId, 'oll-27');
  assert.equal(recognizePllCase(faceletsFromScramble(pllSetup)).caseId, 'pll-t');
  assert.equal(recognizePllCase(faceletsFromScramble(`${pllSetup} U2`)).caseId, 'pll-t');
  assert.equal(recognizeOllCase(faceletsFromScramble(`${ollSetup} D`)), null);
  assert.equal(recognizePllCase(faceletsFromScramble(`${pllSetup} D`)), null);
});

test('records PLL event moves and timing from a solve', () => {
  const pll = caseById('pll-t');
  const setup = invertAlgorithm(pll.algorithm);
  const moves = moveTokens(pll.algorithm);
  const events = opEventsForSave({
    scramble: setup,
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: moves.map((move, index) => ({
      move,
      elapsedMs: (index + 1) * 100,
      timestampMs: 1000 + (index + 1) * 100,
      isoTime: new Date(1000 + (index + 1) * 100).toISOString(),
      solveStartedAtMs: 1000,
      solveStartedAtIsoTime: '1970-01-01T00:00:01.000Z',
    })),
  });
  const pllEvent = events.find((event) => event.kind === 'pll');

  assert.equal(pllEvent.caseId, 'pll-t');
  assert.equal(pllEvent.name, 'T Perm');
  assert.equal(pllEvent.pdfLabel, 'T');
  assert.equal(pllEvent.source, 'pdf');
  assert.deepEqual(pllEvent.moves, moves);
  assert.equal(pllEvent.durationMs, moves.length * 100);
  assert.equal(pllEvent.observationMs, 100);
  assert.equal(pllEvent.tps, 10);
  assert.equal(pllEvent.formulaAccepted, true);
  assert.deepEqual(pllEvent.moveTimings.map((entry) => entry.deltaMs), moves.map(() => 100));
});

test('records PLL event from bluetooth state corrections after move-log drift', () => {
  const pll = caseById('pll-t');
  const setup = invertAlgorithm(pll.algorithm);
  const moves = moveTokens(pll.algorithm);
  const events = opEventsForSave({
    scramble: 'U',
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: [
      { move: "U'", elapsedMs: 100, timestampMs: 1100, solveStartedAtMs: 1000 },
      ...timedMoveLog(moves, 100).map((entry) => ({
        ...entry,
        step: entry.step + 1,
        elapsedMs: entry.elapsedMs + 100,
        timestampMs: entry.timestampMs + 100,
      })),
    ],
    bluetoothStateCorrections: [
      { step: 1, facelets: faceletsFromScramble(setup), elapsedMs: 100, timestampMs: 1100 },
    ],
  });
  const pllEvent = events.find((event) => event.kind === 'pll');

  assert.equal(pllEvent.caseId, 'pll-t');
  assert.equal(pllEvent.startStep, 2);
  assert.deepEqual(pllEvent.moves, moves);
  assert.equal(pllEvent.formulaAccepted, true);
});

test('cached OP event derivation invalidates when bluetooth state corrections change', () => {
  const pll = caseById('pll-t');
  const setup = invertAlgorithm(pll.algorithm);
  const moves = moveTokens(pll.algorithm);
  const solve = {
    scramble: 'U',
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: [
      { move: "U'", elapsedMs: 100, timestampMs: 1100, solveStartedAtMs: 1000 },
      ...timedMoveLog(moves, 100).map((entry) => ({
        ...entry,
        step: entry.step + 1,
        elapsedMs: entry.elapsedMs + 100,
        timestampMs: entry.timestampMs + 100,
      })),
    ],
  };

  assert.equal(opEventsForSave(solve).some((event) => event.kind === 'pll'), false);

  solve.bluetoothStateCorrections = [
    { step: 1, facelets: faceletsFromScramble(setup), elapsedMs: 100, timestampMs: 1100 },
  ];
  const pllEvent = opEventsForSave(solve).find((event) => event.kind === 'pll');

  assert.equal(pllEvent?.caseId, 'pll-t');
  assert.equal(pllEvent?.startStep, 2);
  assert.equal(pllEvent?.formulaAccepted, true);
});

test('records PLL after normalizing non-D CFOP bottom moves', () => {
  const moves = moveTokens(`
    L' B' L L U' F' D F R R F D F' R D R' D' R D R' L D' L' L' D L D' F D' F' D D
    R' D' R F D' F' D F D' D' F' D F D' F' L D' L' D F' D F D' D F' F B' D' L D B D'
    B' L' B D' B B L L B' R' B L L B' R B'
  `);
  const events = opEventsForSave({
    scramble: "U2 L2 U F2 L2 F R D' B2 U B2 L2 B2 R' F2 U2 R' F2 R D2",
    scramblePuzzle: 'three',
    bluetoothMoveLog: timedMoveLog(moves, 100),
  });
  const pllEvent = events.find((event) => event.kind === 'pll');

  assert.equal(pllEvent.caseId, 'pll-aa');
  assert.equal(pllEvent.formulaAccepted, true);
});

test('counts leading OP U-layer adjustments as observation before formula execution', () => {
  const pll = caseById('pll-t');
  const setup = invertAlgorithm(pll.algorithm);
  const formulaMoves = moveTokens(pll.algorithm);
  const moves = ['U', "U'", ...formulaMoves];
  const events = opEventsForSave({
    scramble: setup,
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLog(moves, 100),
  });
  const pllEvent = events.find((event) => event.kind === 'pll');

  assert.equal(pllEvent.caseId, 'pll-t');
  assert.equal(pllEvent.startStep, 3);
  assert.deepEqual(pllEvent.moves, formulaMoves);
  assert.equal(pllEvent.startedAtElapsedMs, 0);
  assert.equal(pllEvent.firstMoveElapsedMs, 300);
  assert.equal(pllEvent.observationMs, 300);
  assert.equal(pllEvent.formulaAccepted, true);
  assert.deepEqual(pllEvent.moveTimings.map((entry) => entry.move), formulaMoves);
  assert.equal(pllEvent.moveTimings[0].deltaMs, 300);
});

test('records OLL event from direct state snapshots without CFOP stage fallback', () => {
  const oll = caseById('oll-27');
  const setup = invertAlgorithm(oll.algorithm);
  const moves = moveTokens(oll.algorithm);
  const events = opEventsForSave({
    scramble: setup,
    scramblePuzzle: 'three',
    timerStartedAt: '1970-01-01T00:00:01.000Z',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: moves.map((move, index) => ({
      move,
      elapsedMs: (index + 1) * 125,
      timestampMs: 1000 + (index + 1) * 125,
      isoTime: new Date(1000 + (index + 1) * 125).toISOString(),
      solveStartedAtMs: 1000,
      solveStartedAtIsoTime: '1970-01-01T00:00:01.000Z',
    })),
  });
  const ollEvent = events.find((event) => event.kind === 'oll');

  assert.equal(ollEvent.caseId, 'oll-27');
  assert.equal(ollEvent.pdfLabel, 'S+');
  assert.equal(ollEvent.source, 'pdf');
  assert.equal(ollEvent.startStep, 1);
  assert.equal(ollEvent.endStep, moves.length);
  assert.deepEqual(ollEvent.moves, moves);
  assert.equal(ollEvent.durationMs, moves.length * 125);
  assert.equal(ollEvent.observationMs, 125);
  assert.equal(ollEvent.formulaAccepted, true);
  assert.equal(ollEvent.startedAtIsoTime, '1970-01-01T00:00:01.000Z');
  assert.deepEqual(ollEvent.moveTimings.map((entry) => entry.move), moves);
});

test('records OLL and PLL after pre-LL moves in a full solve sequence', () => {
  const oll = caseById('oll-27');
  const pll = caseById('pll-t');
  const prefixMoves = moveTokens("R U R'");
  const ollMoves = moveTokens(oll.algorithm);
  const pllMoves = moveTokens(pll.algorithm);
  const moves = [...prefixMoves, ...ollMoves, ...pllMoves];
  const setup = `${invertAlgorithm(`${oll.algorithm} ${pll.algorithm}`)} ${invertAlgorithm(prefixMoves.join(' '))}`;
  const events = opEventsForSave({
    scramble: setup,
    scramblePuzzle: 'three',
    timerStartedAt: '1970-01-01T00:00:01.000Z',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLogWithPauses(moves, new Map([
      [prefixMoves.length, 1400],
      [prefixMoves.length + ollMoves.length, 1600],
    ])),
  });
  const ollEvent = events.find((event) => event.kind === 'oll');
  const pllEvent = events.find((event) => event.kind === 'pll');

  assert.equal(ollEvent.caseId, 'oll-27');
  assert.equal(ollEvent.startStep, prefixMoves.length + 1);
  assert.equal(ollEvent.endStep, prefixMoves.length + ollMoves.length);
  assert.deepEqual(ollEvent.moves, ollMoves);
  assert.equal(ollEvent.observationMs, 1400);
  assert.equal(ollEvent.formulaAccepted, true);
  assert.equal(ollEvent.startedAtElapsedMs, 300);

  assert.equal(pllEvent.caseId, 'pll-t');
  assert.equal(pllEvent.startStep, prefixMoves.length + ollMoves.length + 1);
  assert.equal(pllEvent.endStep, moves.length);
  assert.deepEqual(pllEvent.moves, pllMoves);
  assert.equal(pllEvent.observationMs, 1600);
  assert.equal(pllEvent.formulaAccepted, true);
  assert.equal(pllEvent.startedAtElapsedMs, 2300);
});

test('records consecutive OLL states when a solve pauses after an OLL-to-OLL transition', () => {
  const oll = opCaseLibrary().find((item) => item.id === 'oll-41');
  assert.ok(oll, 'OLL 41 exists');
  const moves = moveTokens(oll.algorithm);
  const events = opEventsForSave({
    scramble: invertAlgorithm(oll.algorithm),
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: pausedTransitionMoveLog(moves, 7, 1600),
  });
  const ollEvents = events.filter((event) => event.kind === 'oll');

  assert.equal(ollEvents.length, 2);
  assert.equal(ollEvents[0].caseId, 'oll-41');
  assert.equal(ollEvents[0].formulaAccepted, false);
  assert.equal(ollEvents[0].formulaReason, 'intermediate-op-case');
  assert.equal(ollEvents[0].startStep, 1);
  assert.equal(ollEvents[0].endStep, 7);
  assert.equal(ollEvents[1].caseId, 'oll-45');
  assert.equal(ollEvents[1].formulaAccepted, true);
  assert.equal(ollEvents[1].formulaReason, 'accepted');
  assert.equal(ollEvents[1].startStep, 8);
  assert.equal(ollEvents[1].observationMs, 1600);
});

test('keeps a continuous OLL formula as one event when an intermediate OLL has no pause', () => {
  const oll = opCaseLibrary().find((item) => item.id === 'oll-41');
  assert.ok(oll, 'OLL 41 exists');
  const moves = moveTokens(oll.algorithm);
  const events = opEventsForSave({
    scramble: invertAlgorithm(oll.algorithm),
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLog(moves, 100),
  });
  const ollEvents = events.filter((event) => event.kind === 'oll');

  assert.equal(ollEvents.length, 1);
  assert.equal(ollEvents[0].caseId, 'oll-41');
  assert.equal(ollEvents[0].formulaAccepted, true);
  assert.equal(ollEvents[0].moves.length, moves.length);
});

test('records consecutive PLL states when a solve pauses after a PLL-to-PLL transition', () => {
  const startPll = opCaseLibrary().find((item) => item.id === 'pll-t');
  const nextPll = opCaseLibrary().find((item) => item.id === 'pll-f');
  assert.ok(startPll, 'T Perm exists');
  assert.ok(nextPll, 'F Perm exists');
  const transitionMoves = moveTokens('M2 U M2 U2 M2 U M2');
  const solveMoves = moveTokens(nextPll.algorithm);
  const moves = [...transitionMoves, ...solveMoves];
  const events = opEventsForSave({
    scramble: invertAlgorithm(startPll.algorithm),
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: pausedTransitionMoveLog(moves, transitionMoves.length, 1500),
  });
  const pllEvents = events.filter((event) => event.kind === 'pll');

  assert.equal(pllEvents.length, 2);
  assert.equal(pllEvents[0].caseId, 'pll-t');
  assert.equal(pllEvents[0].formulaAccepted, false);
  assert.equal(pllEvents[0].formulaReason, 'intermediate-op-case');
  assert.equal(pllEvents[0].startStep, 1);
  assert.equal(pllEvents[0].endStep, transitionMoves.length);
  assert.deepEqual(pllEvents[0].moves, transitionMoves);
  assert.equal(pllEvents[1].caseId, 'pll-f');
  assert.equal(pllEvents[1].formulaAccepted, true);
  assert.equal(pllEvents[1].formulaReason, 'accepted');
  assert.equal(pllEvents[1].startStep, transitionMoves.length + 1);
  assert.equal(pllEvents[1].observationMs, 1500);
  assert.deepEqual(pllEvents[1].moves, solveMoves);
});

test('records no-pause PLL composite transitions without accepting the combined formula', () => {
  const startPll = opCaseLibrary().find((item) => item.id === 'pll-t');
  const nextPll = opCaseLibrary().find((item) => item.id === 'pll-f');
  assert.ok(startPll, 'T Perm exists');
  assert.ok(nextPll, 'F Perm exists');
  const transitionMoves = moveTokens('M2 U M2 U2 M2 U M2');
  const solveMoves = moveTokens(nextPll.algorithm);
  const moves = [...transitionMoves, ...solveMoves];
  const events = opEventsForSave({
    scramble: invertAlgorithm(startPll.algorithm),
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLog(moves, 100),
  });
  const pllEvents = events.filter((event) => event.kind === 'pll');

  assert.equal(pllEvents.length, 2);
  assert.equal(pllEvents[0].caseId, 'pll-t');
  assert.equal(pllEvents[0].formulaAccepted, false);
  assert.equal(pllEvents[0].formulaReason, 'intermediate-op-case');
  assert.equal(pllEvents[0].endStep, transitionMoves.length);
  assert.deepEqual(pllEvents[0].moves, transitionMoves);
  assert.equal(pllEvents[1].caseId, 'pll-f');
  assert.equal(pllEvents[1].formulaAccepted, true);
  assert.deepEqual(pllEvents[1].moves, solveMoves);
});

test('evaluates OP formula candidates before accepting user algorithms', () => {
  const oll = caseById('oll-27');
  const pll = caseById('pll-t');
  const ollStart = faceletsFromScramble(invertAlgorithm(oll.algorithm));
  const pllStart = faceletsFromScramble(invertAlgorithm(pll.algorithm));

  const acceptedOll = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-27',
    startFacelets: ollStart,
    moves: oll.algorithm,
  });
  const acceptedPll = evaluateOpFormulaCandidate({
    kind: 'pll',
    caseId: 'pll-t',
    startFacelets: pllStart,
    moves: pll.algorithm,
  });
  const wrongPll = evaluateOpFormulaCandidate({
    kind: 'pll',
    caseId: 'pll-t',
    startFacelets: pllStart,
    moves: pll.algorithm.split(' ').slice(0, -1).join(' '),
  });
  const longOll = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-27',
    startFacelets: ollStart,
    moves: `${oll.algorithm} ${oll.algorithm} ${oll.algorithm} ${oll.algorithm}`,
  });

  assert.equal(acceptedOll.accepted, true);
  assert.equal(acceptedOll.caseId, 'oll-27');
  assert.equal(acceptedPll.accepted, true);
  assert.equal(acceptedPll.caseId, 'pll-t');
  assert.equal(wrongPll.accepted, false);
  assert.equal(wrongPll.reason, 'pll-not-solved');
  assert.equal(longOll.accepted, false);
  assert.equal(longOll.reason, 'too-long');
});

test('strict OP formula validation accepts all prefilled PDF formulas', () => {
  for (const item of opCaseLibrary()) {
    const startFacelets = faceletsFromScramble(invertAlgorithm(item.algorithm));
    const result = evaluateOpFormulaCandidate({
      kind: item.kind,
      caseId: item.id,
      startFacelets,
      moves: item.algorithm,
    });

    assert.equal(result.accepted, true, `${item.kind} ${item.id} ${item.pdfLabel || item.name}`);
  }
});

test('strict OLL formula validation rejects candidates ending as another OLL state', () => {
  const oll = opCaseLibrary().find((item) => item.id === 'oll-41');
  assert.ok(oll, 'OLL 41 exists');
  const startFacelets = faceletsFromScramble(invertAlgorithm(oll.algorithm));
  const prefixMoves = moveTokens(oll.algorithm).slice(0, 7);

  const rejected = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-41',
    startFacelets,
    moves: prefixMoves,
  });
  const accepted = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-41',
    startFacelets,
    moves: oll.algorithm,
  });

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'intermediate-op-case');
  assert.equal(rejected.finalRecognition?.confidence, 'unique');
  assert.notEqual(rejected.finalRecognition?.caseId, 'oll-41');
  assert.equal(accepted.accepted, true);
});

test('strict OLL formula validation rejects oriented states that are not valid PLL or skip states', () => {
  const oll = caseById('oll-27');
  const startFacelets = faceletsFromScramble(invertAlgorithm(oll.algorithm));

  const rejected = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-27',
    startFacelets,
    moves: `${oll.algorithm} D`,
  });

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'oll-not-pll-state');
  assert.equal(rejected.startRecognition?.caseId, 'oll-27');
  assert.equal(rejected.finalRecognition, null);
});

test('does not record OLL before F2L completion from a matching orientation pattern alone', () => {
  const oll = caseById('oll-27');
  const moves = [...moveTokens(oll.algorithm), "D'"];
  const startFacelets = faceletsFromScramble(`${invertAlgorithm(oll.algorithm)} D`);
  const validation = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-27',
    startFacelets,
    moves,
  });
  const events = opEventsForSave({
    scramble: `${invertAlgorithm(oll.algorithm)} D`,
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLog(moves, 100),
  });

  assert.equal(validation.accepted, false);
  assert.equal(validation.reason, 'unrecognized-start-state');
  assert.deepEqual(events.filter((event) => event.kind === 'oll'), []);
});

test('strict OLL formula validation rejects paused multi-formula transitions', () => {
  const oll = opCaseLibrary().find((item) => item.id === 'oll-41');
  assert.ok(oll, 'OLL 41 exists');
  const moves = moveTokens(oll.algorithm);
  const startFacelets = faceletsFromScramble(invertAlgorithm(oll.algorithm));

  const accepted = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-41',
    startFacelets,
    moves,
    moveTimings: formulaMoveTimings(moves, -1),
  });
  const rejected = evaluateOpFormulaCandidate({
    kind: 'oll',
    caseId: 'oll-41',
    startFacelets,
    moves,
    moveTimings: formulaMoveTimings(moves, 7),
  });

  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'intermediate-op-case');
  assert.equal(rejected.intermediateStep, 7);
  assert.equal(rejected.pauseMs, 1600);
});

test('cached OP event derivation invalidates when bluetooth move log changes', () => {
  const pll = caseById('pll-t');
  const setup = invertAlgorithm(pll.algorithm);
  const moves = moveTokens(pll.algorithm);
  const solve = {
    scramble: setup,
    scramblePuzzle: 'three',
    timerStartedAtMs: 1000,
    bluetoothMoveLog: timedMoveLog(moves.slice(0, -1), 100),
  };

  assert.equal(opEventsForSave(solve).some((event) => event.kind === 'pll'), false);

  solve.bluetoothMoveLog = timedMoveLog(moves, 100);
  const pllEvent = opEventsForSave(solve).find((event) => event.kind === 'pll');

  assert.equal(pllEvent?.caseId, 'pll-t');
  assert.deepEqual(pllEvent?.moves, moves);
});

function timedMoveLog(moves, intervalMs) {
  return moves.map((move, index) => ({
    move,
    elapsedMs: (index + 1) * intervalMs,
    timestampMs: 1000 + (index + 1) * intervalMs,
    solveStartedAtMs: 1000,
  }));
}

function pausedTransitionMoveLog(moves, pauseAfterStep, pauseMs) {
  let elapsedMs = 0;
  return moves.map((move, index) => {
    elapsedMs += index === pauseAfterStep ? pauseMs : 100;
    return {
      move,
      elapsedMs,
      timestampMs: 1000 + elapsedMs,
      solveStartedAtMs: 1000,
    };
  });
}

function timedMoveLogWithPauses(moves, pauseByMoveIndex = new Map()) {
  let elapsedMs = 0;
  return moves.map((move, index) => {
    elapsedMs += pauseByMoveIndex.get(index) || 100;
    return {
      move,
      elapsedMs,
      timestampMs: 1000 + elapsedMs,
      solveStartedAtMs: 1000,
      solveStartedAtIsoTime: '1970-01-01T00:00:01.000Z',
      isoTime: new Date(1000 + elapsedMs).toISOString(),
    };
  });
}

function formulaMoveTimings(moves, pauseAfterStep) {
  return moves.map((move, index) => ({
    step: index + 1,
    move,
    deltaMs: index === pauseAfterStep ? 1600 : 100,
  }));
}

function caseById(id) {
  const item = algorithmTrainerCases.find((candidate) => candidate.id === id);
  assert.ok(item, `${id} exists`);
  return item;
}

function moveTokens(algorithm) {
  return parseScramble(algorithm).map((move) => `${move.face}${move.suffix || ''}`);
}

function invertAlgorithm(algorithm) {
  return parseScramble(algorithm)
    .reverse()
    .map(invertMove)
    .join(' ');
}

function invertMove(move) {
  if (move.suffix === '2') return `${move.face}2`;
  if (move.suffix === "'") return move.face;
  return `${move.face}'`;
}
