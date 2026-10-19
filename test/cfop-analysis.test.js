import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cfopStagesForSave,
  effectiveStageMoveRecords,
  solveCfopAnalysis,
  solveFaceletStateTimelineForAnalysis,
  solveMoveRecords,
  solvePhysicalMoveRecords,
} from '../src/cfop-analysis.js';
import { applyMoveToFacelets, faceletsFromScramble } from '../src/cube-state.js';

test('CFOP analysis uses logical half-turn steps for solve records', () => {
  const records = solveMoveRecords({
    bluetoothMoveLog: [
      { step: 1, move: 'R', elapsedMs: 100 },
      { step: 2, move: 'R', elapsedMs: 240 },
      { step: 3, move: 'U2', elapsedMs: 500 },
      { step: 4, move: 'F2', elapsedMs: 720 },
    ],
  });

  assert.deepEqual(records.map((record) => record.move), ['R2', 'U2', 'F2']);
  assert.equal(records[0].elapsedMs, 240);
});

test('CFOP analysis detects a stage restored between repeated physical turns', () => {
  const analysis = solveCfopAnalysis({
    scramble: "R'",
    scramblePuzzle: 'three',
    bluetoothMoveLog: [
      { step: 1, move: 'R', elapsedMs: 100 },
      { step: 2, move: 'R', elapsedMs: 240 },
    ],
  });
  const pll = analysis.stages.find((stage) => stage.label === 'P');

  assert.deepEqual(analysis.records.map((record) => record.move), ['R2']);
  assert.deepEqual(analysis.detectionRecords.map((record) => record.move), ['R', 'R']);
  assert.ok(analysis.stages.every((stage) => stage.completed));
  assert.equal(pll.completedAt, 1);
  assert.equal(pll.completedAtElapsedMs, 100);
  assert.equal(analysis.finalSolved, true);
});

test('state-packet solved evidence does not synthesize missing CFOP stages without facelets', () => {
  const solve = {
    scramble: 'R U F',
    scramblePuzzle: 'three',
    bluetoothMoves: ["U'"],
    bluetoothSolvedByStatePacket: true,
  };
  const analysis = solveCfopAnalysis(solve);
  const stages = cfopStagesForSave(solve);
  const pll = stages.find((stage) => stage.label === 'P');

  assert.equal(analysis.finalSolved, true);
  assert.equal(stages.every((stage) => stage.completed), false);
  assert.equal(pll.completed, false);
  assert.equal(pll.name, 'PLL');
});

test('CFOP replay uses saved bluetooth state corrections to recover from move-log drift', () => {
  const solve = {
    scramble: 'U',
    scramblePuzzle: 'three',
    bluetoothMoveLog: [
      { move: "U'", elapsedMs: 100 },
      { move: 'R', elapsedMs: 240 },
    ],
    bluetoothStateCorrections: [
      { step: 1, facelets: faceletsFromScramble("R'"), elapsedMs: 100 },
    ],
  };
  const analysis = solveCfopAnalysis(solve);

  assert.equal(analysis.finalSolved, true);
  assert.ok(analysis.stages.every((stage) => stage.completed));
  assert.equal(analysis.stages.at(-1).completedAt, 2);
});

test('CFOP replay uses saved bluetooth state log to recover from move-log drift', () => {
  const solve = {
    scramble: 'U',
    scramblePuzzle: 'three',
    bluetoothMoveLog: [
      { move: "U'", elapsedMs: 100 },
      { move: 'R', elapsedMs: 240 },
    ],
    bluetoothStateLog: [
      { step: 1, facelets: faceletsFromScramble("R'"), elapsedMs: 100, raw: 'state-1' },
    ],
  };
  const analysis = solveCfopAnalysis(solve);

  assert.equal(analysis.finalSolved, true);
  assert.ok(analysis.stages.every((stage) => stage.completed));
  assert.equal(analysis.stages.at(-1).completedAt, 2);
});

test('CFOP stages save elapsed and absolute timing points', () => {
  const stages = cfopStagesForSave({
    scramble: 'R U',
    scramblePuzzle: 'three',
    inspectionDurationMs: 9000,
    timerStartedAt: '2026-06-02T10:00:00.000Z',
    timerStartedAtMs: 1780394400000,
    bluetoothMoveLog: [
      {
        move: "U'",
        elapsedMs: 850,
        timestampMs: 1780394400850,
        isoTime: '2026-06-02T10:00:00.850Z',
        solveStartedAtMs: 1780394400000,
        solveStartedAtIsoTime: '2026-06-02T10:00:00.000Z',
      },
      {
        move: "R'",
        elapsedMs: 1200,
        timestampMs: 1780394401200,
        isoTime: '2026-06-02T10:00:01.200Z',
        solveStartedAtMs: 1780394400000,
        solveStartedAtIsoTime: '2026-06-02T10:00:00.000Z',
      },
    ],
  });
  const cross = stages[0];

  assert.equal(cross.completed, true);
  assert.equal(cross.startStep, 1);
  assert.equal(cross.endStep, 1);
  assert.equal(cross.startedAtElapsedMs, 0);
  assert.equal(cross.firstMoveElapsedMs, 850);
  assert.equal(cross.completedAtElapsedMs, 850);
  assert.equal(cross.observationMs, 9000);
  assert.equal(cross.startedAtTimestampMs, 1780394400000);
  assert.equal(cross.firstMoveTimestampMs, 1780394400850);
  assert.equal(cross.completedAtTimestampMs, 1780394400850);
  assert.equal(cross.startedAtIsoTime, '2026-06-02T10:00:00.000Z');
  assert.equal(cross.firstMoveIsoTime, '2026-06-02T10:00:00.850Z');
  assert.equal(cross.completedAtIsoTime, '2026-06-02T10:00:00.850Z');
});

test('CFOP stages preserve OLL and PLL skips as completed zero-turn stages', () => {
  const ollSkipStages = cfopStagesForSave({
    scramble: 'R U',
    scramblePuzzle: 'three',
    bluetoothMoveLog: ["U'", "R'"].map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  });
  const skippedOll = ollSkipStages.find((stage) => stage.label === 'O');
  const activePll = ollSkipStages.find((stage) => stage.label === 'P');

  assert.equal(skippedOll.completed, true);
  assert.equal(skippedOll.turns, 0);
  assert.equal(skippedOll.durationMs, 0);
  assert.equal(activePll.turns, 1);

  const pllSkipAlgorithm = "R U R' U R U2 R'";
  const pllSkipStages = cfopStagesForSave({
    scramble: "R U2 R' U' R U' R'",
    scramblePuzzle: 'three',
    bluetoothMoveLog: pllSkipAlgorithm.split(/\s+/).map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  });
  const activeOll = pllSkipStages.find((stage) => stage.label === 'O');
  const skippedPll = pllSkipStages.find((stage) => stage.label === 'P');

  assert.equal(activeOll.turns, 7);
  assert.equal(skippedPll.completed, true);
  assert.equal(skippedPll.turns, 0);
  assert.equal(skippedPll.durationMs, 0);
});

test('CFOP stage turns use logical steps while detection keeps physical double-flick precision', () => {
  const moves = [
    ["D'", 37],
    ['F', 186],
    ['F', 242],
    ['B', 630],
    ['B', 720],
    ['L', 1140],
    ['L', 1169],
    ['R', 1470],
    ['R', 1530],
  ];
  const analysis = solveCfopAnalysis({
    cfopBottomFace: 'U',
    scramble: "U2 B R2 F2 U2 B' U2 L2 D2 R2 F' L F' R U L' F' R D",
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map(([move, elapsedMs]) => ({ move, elapsedMs })),
  });
  const cross = analysis.stages[0];

  assert.deepEqual(analysis.records.map((record) => record.move), ["D'", 'F2', 'B2', 'L2', 'R2']);
  assert.equal(cross.completedAt, 5);
  assert.equal(cross.turns, 5);
  assert.equal(cross.physicalCompletedAt, 9);
  assert.equal(cross.physicalTurns, 9);
  assert.equal(cross.completedAtElapsedMs, 1530);
});

test('state-packet solved fallback does not synthesize full CFOP timing without stage evidence', () => {
  const solve = {
    scramble: 'R U F',
    scramblePuzzle: 'three',
    bluetoothMoveLog: [{ move: 'U', elapsedMs: 1000 }],
    bluetoothSolvedByStatePacket: true,
  };
  const analysis = solveCfopAnalysis(solve);
  const stages = cfopStagesForSave(solve);

  assert.equal(analysis.finalSolved, true);
  assert.equal(stages.every((stage) => stage.completed), false);
  assert.equal(stages[0].durationMs, null);
});

test('state-packet solved evidence does not turn long move-log drift into O/P skips', () => {
  const moves = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 'U' : "U'"));
  const solve = {
    scramble: 'R U F',
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
    bluetoothSolvedByStatePacket: true,
  };
  const analysis = solveCfopAnalysis(solve);
  const stages = cfopStagesForSave(solve);

  assert.equal(analysis.finalSolved, true);
  assert.equal(stages.find((stage) => stage.label === 'O').completed, false);
  assert.equal(stages.find((stage) => stage.label === 'P').completed, false);
});

test('bluetooth timer-source confirms final solved without synthesizing O/P skips', () => {
  const moves = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 'U' : "U'"));
  const analysis = solveCfopAnalysis({
    scramble: 'R U F',
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
    timerSource: 'bluetooth',
    bluetoothSolvedByStatePacket: false,
  });

  assert.equal(analysis.finalSolved, true);
  assert.equal(analysis.stages.find((stage) => stage.label === 'O').completed, false);
  assert.equal(analysis.stages.find((stage) => stage.label === 'P').completed, false);
});

test('cross stage is named for solved F2L pairs present at cross completion', () => {
  const analysis = solveCfopAnalysis({
    scramble: 'U',
    scramblePuzzle: 'three',
    bluetoothMoves: ["U'"],
  });

  assert.equal(analysis.stages[0].name, 'xxxxcross');
  assert.equal(analysis.stages[0].completed, true);
  const pll = analysis.stages.find((stage) => stage.label === 'P');
  assert.equal(pll.skipped, true);
  assert.equal(pll.skipAdjustment, "U'");
  assert.equal(pll.turns, 1);
});

test('late crosses retain their actual solved pair count', () => {
  const moves = [
    'B', 'B', "R'", 'F', 'F', "D'", 'F', "D'", "F'", 'D', 'L', "D'",
    "L'", 'L', "L'", 'D', 'L', "D'", "L'", 'D', 'D', 'L', "D'",
    "L'", 'D', 'D', 'F', "D'", "F'", "D'", 'D', "D'", "D'", "B'",
    "D'", "D'", 'B', 'D', "B'", 'D', 'R', 'D', "R'", 'D', 'D',
    'B', 'R', 'D', "R'", "D'", "B'", "R'", 'D', "L'", 'D', 'D',
    'R', "D'", "R'", 'D', 'D', 'R', "D'", 'D', 'L', "D'",
  ];
  const analysis = solveCfopAnalysis({
    scramble: "L U B D' B' U F2 R' F U2 R' F2 D2 R D2 R U' L2",
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  });

  assert.equal(analysis.stages[0].completedAt, 29);
  assert.equal(analysis.stages[0].physicalCompletedAt, 34);
  assert.equal(analysis.stages[0].name, 'xxcross');
});

test('CFOP analysis prefers staged progress over final-state-only bottom candidates', () => {
  const { scramble, moves } = stagedProgressFixture();
  const analysis = solveCfopAnalysis({
    scramble,
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  });

  assert.equal(analysis.bottomFace, 'U');
  assert.deepEqual(
    analysis.stages.map((stage) => [stage.label, stage.completedAt, stage.turns]),
    [
      ['C', 10, 8],
      ['F1', 18, 8],
      ['F2', 26, 8],
      ['F3', 34, 8],
      ['F4', 42, 8],
      ['O', 55, 11],
      ['P', 74, 18],
    ],
  );
  assert.deepEqual(
    analysis.stages.map((stage) => [stage.label, stage.physicalCompletedAt, stage.physicalTurns]),
    [
      ['C', 14, 14],
      ['F1', 23, 9],
      ['F2', 32, 9],
      ['F3', 41, 9],
      ['F4', 50, 9],
      ['O', 64, 14],
      ['P', 84, 20],
    ],
  );
  assert.ok(analysis.stages.slice(1).every((stage) => stage.durationMs > 0));
});

test('state timeline preserves staged CFOP progress when several state packets share one move step', () => {
  const { scramble, moves } = stagedProgressFixture();
  const physicalBoundaries = [14, 23, 32, 41, 50, 64, 84];
  let facelets = faceletsFromScramble(scramble);
  let moveIndex = 0;
  const bluetoothStateLog = physicalBoundaries.map((endStep, index) => {
    while (moveIndex < endStep) {
      facelets = applyMoveToFacelets(facelets, moves[moveIndex]);
      moveIndex += 1;
    }
    return {
      step: 0,
      facelets,
      elapsedMs: endStep * 100,
      timestampMs: 1000 + endStep * 100,
      raw: `state-${index + 1}`,
    };
  });
  const solve = {
    scramble,
    scramblePuzzle: 'three',
    timerSource: 'bluetooth',
    bluetoothSolvedByStatePacket: true,
    bluetoothStateLog,
  };
  const timeline = solveFaceletStateTimelineForAnalysis(solve);
  const analysis = solveCfopAnalysis(solve);

  assert.deepEqual(timeline.map((snapshot) => snapshot.sequence), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(timeline.map((snapshot) => snapshot.step), Array(8).fill(0));
  assert.equal(analysis.bottomFace, 'U');
  assert.equal(analysis.stages[0].name, 'Cross');
  assert.deepEqual(
    analysis.stages.map((stage) => stage.completedAtElapsedMs),
    [700, 1850, 2750, 3650, 4550, 5700, 8400],
  );
  assert.ok(analysis.stages.every((stage) => stage.completed && stage.turns === 0));
  assert.ok(analysis.stages.every((stage) => stage.unobservedTurns === true));
  assert.ok(analysis.stages.every((stage) => stage.completionSource === 'state'));
  assert.ok(analysis.stages.every((stage) => stage.timingInterpolated));
});

function stagedProgressFixture() {
  return {
    scramble: "F R' U2 B U2 F2 D2 B U2 L2 B D2 R F' D' B F' L' D'",
    moves: [
      'B', 'L', 'F', 'R', 'D', 'D', "D'", "D'", "D'", 'B', 'B', "D'",
      'F', 'F', 'D', 'L', 'D', 'D', "L'", "D'", 'L', 'D', "L'", "D'",
      'F', 'D', 'D', "F'", 'D', 'F', "D'", "F'", 'D', 'D', "B'", 'D',
      'B', "D'", "B'", "D'", 'B', "D'", "D'", 'B', "D'", "B'", 'D', 'B',
      'D', "B'", 'D', "D'", "D'", "D'", 'F', 'L', "B'", "L'", "F'", 'B',
      'D', 'B', "D'", "B'", 'D', 'D', "D'", 'L', 'B', "D'", "B'", "D'",
      'B', 'D', "B'", "L'", 'B', 'D', "B'", "D'", "B'", 'L', 'B', "L'",
    ],
  };
}

test('leading loops become observation while internal loops only remove turns', () => {
  const { scramble, moves } = stagedProgressFixture();
  const analyze = (sequence) => solveCfopAnalysis({
    scramble, durationMs: (sequence.length - 1) * 1000,
    bluetoothMoveLog: sequence.map((move, index) => ({ move, elapsedMs: index * 1000 })),
  });
  const baseline = analyze(moves);
  const start = baseline.stages[0].physicalEndStep;
  const insertLoop = (index) => [...moves.slice(0, index), 'R', 'U', "U'", "R'", ...moves.slice(index)];
  const leading = analyze(insertLoop(start)).stages[1];
  assert.equal(leading.observationMs, baseline.stages[1].observationMs + 4000);
  assert.equal(leading.turns, baseline.stages[1].turns);
  assert.equal(leading.executionMs, baseline.stages[1].executionMs);
  const middle = analyze(insertLoop(start + 1)).stages[1];
  assert.equal(middle.observationMs, baseline.stages[1].observationMs);
  assert.equal(middle.turns, baseline.stages[1].turns);
  assert.equal(middle.executionMs, baseline.stages[1].executionMs + 4000);
});

test('each stage starts observation at the previous completion and retains its own loops', () => {
  const { scramble, moves } = stagedProgressFixture();
  const solve = (sequence) => ({ scramble, durationMs: sequence.length * 100,
    bluetoothMoveLog: sequence.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })) });
  const baseline = solveCfopAnalysis(solve(moves));
  const crossEnd = baseline.stages[0].physicalEndStep;
  const sequence = [...moves.slice(0, crossEnd), 'R', "R'", ...moves.slice(crossEnd)];
  const { stages } = solveCfopAnalysis(solve(sequence));
  assert.equal(stages[0].durationMs, baseline.stages[0].durationMs);
  assert.equal(stages[1].startedAtElapsedMs, stages[0].completedAtElapsedMs);
  assert.equal(stages[1].observationMs, baseline.stages[1].observationMs + 200);
  assert.equal(stages[1].turns, baseline.stages[1].turns);
  assert.equal(stages.reduce((sum, stage) => sum + stage.durationMs, 0), sequence.length * 100);
});

test('confirming state packets do not postpone completion and PLL ends at stopwatch time', () => {
  const { scramble, moves } = stagedProgressFixture();
  const base = {
    scramble, timerStartedAtMs: 100000, durationMs: moves.length * 100,
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  };
  const baseline = solveCfopAnalysis(base);
  const crossEnd = baseline.stages[0].physicalEndStep;
  let crossFacelets = faceletsFromScramble(scramble);
  for (const move of moves.slice(0, crossEnd)) crossFacelets = applyMoveToFacelets(crossFacelets, move);
  const withPackets = { ...base, bluetoothStateLog: [
    { step: crossEnd, facelets: crossFacelets, elapsedMs: crossEnd * 100 + 60 },
    { step: moves.length, facelets: faceletsFromScramble(''), elapsedMs: base.durationMs + 390, solved: true, trustedSolved: true },
  ] };
  for (const durationMs of [base.durationMs, base.durationMs + 700, base.durationMs - 50]) {
    const { stages } = solveCfopAnalysis({ ...withPackets, durationMs });
    assert.equal(stages[0].completedAtElapsedMs, baseline.stages[0].completedAtElapsedMs);
    assert.equal(stages.at(-1).completedAtElapsedMs, durationMs);
    assert.equal(stages.at(-1).completedAtTimestampMs, base.timerStartedAtMs + durationMs);
    assert.equal(stages.reduce((sum, stage) => sum + stage.durationMs, 0), durationMs);
    stages.forEach((stage, index) => {
      assert.ok(stage.durationMs >= 0);
      assert.equal(stage.observationMs + stage.executionMs, stage.durationMs);
      if (index) assert.equal(stage.startedAtElapsedMs, stages[index - 1].completedAtElapsedMs);
    });
  }
});

test('loop detection ignores delayed state corrections and erases complete nested loops', () => {
  const moves = ['F', 'D', "D'", 'L', "L'", "F'", 'R', 'U', "U'", 'D'];
  const records = moves.map((move, index) => ({ step: index + 1, move, elapsedMs: index * 100 }));
  const snapshots = [
    { step: 0, facelets: faceletsFromScramble('R U F') },
    { step: 2, facelets: faceletsFromScramble('B L') },
    { step: 6, facelets: faceletsFromScramble('D2 R') },
    { step: 10, facelets: faceletsFromScramble('F U') },
  ];
  assert.deepEqual(effectiveStageMoveRecords(snapshots, records).map((r) => r.step), [7, 10]);
  // A useful turn before an internal loop keeps its original execution time.
  assert.equal(effectiveStageMoveRecords(snapshots, records)[0].elapsedMs, 600);
});

test('Cross observation is actual pre-solve inspection and never changes stopwatch totals', () => {
  const { scramble, moves } = stagedProgressFixture();
  const base = { scramble, durationMs: moves.length * 100, inspectionEnabled: true,
    bluetoothMoveLog: moves.map((move, i) => ({ move, elapsedMs: i * 100 })) };
  for (const inspectionDurationMs of [0, 9850, 17300]) {
    const { stages } = solveCfopAnalysis({ ...base, inspectionDurationMs });
    assert.equal(stages[0].observationMs, inspectionDurationMs);
    assert.equal(stages[0].executionMs, stages[0].durationMs);
    assert.equal(stages.reduce((n, s) => n + s.durationMs, 0), base.durationMs);
    for (const stage of stages.slice(1)) assert.equal(stage.observationMs + stage.executionMs, stage.durationMs);
  }
  assert.equal(solveCfopAnalysis(base).stages[0].observationMs, null);
  assert.equal(solveCfopAnalysis({ ...base, inspectionEnabled: false }).stages[0].observationMs, 0);
  const stored = cfopStagesForSave({ ...base, inspectionDurationMs: 9850 });
  assert.equal(solveCfopAnalysis({ ...base, cfopStages: stored }).stages[0].observationMs, 9850);
  assert.equal(solveCfopAnalysis({ ...base, cfopStages: [{ label: 'C', analysisVersion: 5, observationMs: 52 }] }).stages[0].observationMs, null);
});

test('OLL and PLL leading AUF turns are observation but internal U turns stay in execution', () => {
  const inverse = (moves) => moves.slice().reverse().map((move) => move.endsWith('2') ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`).join(' ');
  const algorithms = [
    ['oll', "R U R' U R U2 R'"],
    ['pll', "R U R' U' R' F R2 U' R' U' R U R' F'"],
  ];
  for (const [key, algorithm] of algorithms) {
    const moves = ['U', 'R', "R'", 'U2', ...algorithm.split(' ')];
    const solve = { scramble: inverse(moves), durationMs: moves.length * 100,
      bluetoothMoveLog: moves.map((move, i) => ({ move, elapsedMs: (i + 1) * 100 })) };
    const analysis = solveCfopAnalysis(solve);
    const stage = analysis.stages.find((stage) => stage.key === key);
    assert.equal(analysis.bottomFace, 'D');
    assert.equal(stage.firstMoveElapsedMs, 500);
    assert.equal(stage.observationMs, 500);
    assert.equal(stage.executionMs, stage.durationMs - 500);
    assert.equal(stage.wastedPhysicalTurns, 2);
    assert.equal(stage.turns, algorithm.split(' ').length + 2);
    assert.equal(analysis.stages.reduce((n, s) => n + s.durationMs, 0), solve.durationMs);
    const flipped = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'R', L: 'L' };
    const flippedMoves = moves.map((move) => flipped[move[0]] + move.slice(1));
    const rotated = solveCfopAnalysis({ ...solve, scramble: inverse(flippedMoves),
      bluetoothMoveLog: flippedMoves.map((move, i) => ({ move, elapsedMs: (i + 1) * 100 })) });
    assert.equal(rotated.bottomFace, 'U');
    assert.equal(rotated.stages.find((stage) => stage.key === key).observationMs, 500);
  }
});

test('PLL skip with only AUF has observation time and no formula execution time', () => {
  const { stages } = solveCfopAnalysis({ scramble: 'U', durationMs: 400,
    bluetoothMoveLog: [{ move: "U'", elapsedMs: 400 }] });
  const pll = stages.find((stage) => stage.key === 'pll');
  assert.equal(pll.skipped, true);
  assert.equal(pll.durationMs, 400);
  assert.equal(pll.observationMs, 400);
  assert.equal(pll.executionMs, 0);
});
