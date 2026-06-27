import test from 'node:test';
import assert from 'node:assert/strict';
import { cfopStagesForSave, solveCfopAnalysis, solveMoveRecords } from '../src/cfop-analysis.js';
import { faceletsFromScramble } from '../src/cube-state.js';

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

test('state-packet solved fallback completes CFOP when final GAN move is not in the log', () => {
  const stages = cfopStagesForSave({
    scramble: 'R U',
    scramblePuzzle: 'three',
    bluetoothMoves: ["U'"],
    bluetoothSolvedByStatePacket: true,
  });
  const pll = stages.find((stage) => stage.label === 'P');

  assert.ok(stages.every((stage) => stage.completed));
  assert.equal(pll.completed, true);
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

test('CFOP stages save elapsed and absolute timing points', () => {
  const stages = cfopStagesForSave({
    scramble: 'R U',
    scramblePuzzle: 'three',
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
  assert.equal(cross.observationMs, 850);
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

test('cross stage is named for solved F2L pairs present at cross completion', () => {
  const analysis = solveCfopAnalysis({
    scramble: 'U',
    scramblePuzzle: 'three',
    bluetoothMoves: ["U'"],
  });

  assert.equal(analysis.stages[0].name, 'xxxxcross');
  assert.equal(analysis.stages[0].completed, true);
});

test('late collapsed multiple-pair cross candidates are named conservatively', () => {
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
  assert.equal(analysis.stages[0].name, 'Cross');
});

test('CFOP analysis prefers staged progress over final-state-only bottom candidates', () => {
  const moves = [
    'B', 'L', 'F', 'R', 'D', 'D', "D'", "D'", "D'", 'B', 'B', "D'",
    'F', 'F', 'D', 'L', 'D', 'D', "L'", "D'", 'L', 'D', "L'", "D'",
    'F', 'D', 'D', "F'", 'D', 'F', "D'", "F'", 'D', 'D', "B'", 'D',
    'B', "D'", "B'", "D'", 'B', "D'", "D'", 'B', "D'", "B'", 'D', 'B',
    'D', "B'", 'D', "D'", "D'", "D'", 'F', 'L', "B'", "L'", "F'", 'B',
    'D', 'B', "D'", "B'", 'D', 'D', "D'", 'L', 'B', "D'", "B'", "D'",
    'B', 'D', "B'", "L'", 'B', 'D', "B'", "D'", "B'", 'L', 'B', "L'",
  ];
  const analysis = solveCfopAnalysis({
    scramble: "F R' U2 B U2 F2 D2 B U2 L2 B D2 R F' D' B F' L' D'",
    scramblePuzzle: 'three',
    bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 100 })),
  });

  assert.equal(analysis.bottomFace, 'U');
  assert.deepEqual(
    analysis.stages.map((stage) => [stage.label, stage.completedAt, stage.turns]),
    [
      ['C', 10, 10],
      ['F1', 18, 8],
      ['F2', 26, 8],
      ['F3', 34, 8],
      ['F4', 42, 8],
      ['O', 55, 13],
      ['P', 74, 19],
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
