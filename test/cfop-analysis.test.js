import test from 'node:test';
import assert from 'node:assert/strict';
import { cfopStagesForSave, solveCfopAnalysis, solveMoveRecords } from '../src/cfop-analysis.js';

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
  assert.ok(analysis.stages.slice(1).every((stage) => stage.durationMs > 0));
});
