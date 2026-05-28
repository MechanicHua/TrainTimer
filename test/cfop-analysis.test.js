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

test('cross stage is named for solved F2L pairs present at cross completion', () => {
  const analysis = solveCfopAnalysis({
    scramble: 'U',
    scramblePuzzle: 'three',
    bluetoothMoves: ["U'"],
  });

  assert.equal(analysis.stages[0].name, 'xxxxcross');
  assert.equal(analysis.stages[0].completed, true);
});
