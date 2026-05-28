import test from 'node:test';
import assert from 'node:assert/strict';
import { countMoveSteps, logicalMoveRecords, logicalMoveSequence } from '../src/move-metrics.js';

test('counts adjacent quarter double flicks as one half-turn step', () => {
  assert.deepEqual(logicalMoveSequence(['R', 'R', 'U2', "F'", "F'", 'L']), ['R2', 'U2', 'F2', 'L']);
  assert.equal(countMoveSteps(['R', 'R', 'U2', "F'", "F'", 'L']), 4);
});

test('keeps opposite adjacent turns as separate undo steps', () => {
  assert.deepEqual(logicalMoveSequence(['R', "R'", 'U', "U'"]), ['R', "R'", 'U', "U'"]);
  assert.equal(countMoveSteps(['R', "R'", 'U', "U'"]), 4);
});

test('merged half-turn records keep the completion timestamp of the second quarter turn', () => {
  const records = logicalMoveRecords([
    { step: 1, move: 'R', elapsedMs: 100 },
    { step: 2, move: 'R', elapsedMs: 220 },
    { step: 3, move: 'U', elapsedMs: 360 },
  ]);

  assert.deepEqual(records.map((record) => record.move), ['R2', 'U']);
  assert.equal(records[0].elapsedMs, 220);
  assert.deepEqual(records.map((record) => record.step), [1, 2]);
});
