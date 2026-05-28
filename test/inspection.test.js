import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionDisplayForElapsed, inspectionDnfSeconds, inspectionPenaltyForElapsed, inspectionReminderSeconds, inspectionSeconds } from '../src/inspection.js';

test('inspection uses a 15 second hard DNF threshold', () => {
  assert.equal(inspectionSeconds, 15);
  assert.equal(inspectionDnfSeconds, 15);
  assert.deepEqual(inspectionReminderSeconds, [8, 12]);

  assert.equal(inspectionPenaltyForElapsed(14.999), 'ok');
  assert.equal(inspectionPenaltyForElapsed(15), 'dnf');
  assert.equal(inspectionPenaltyForElapsed(17), 'dnf');
});

test('inspection display counts down and never shows +2', () => {
  assert.equal(inspectionDisplayForElapsed(0), '15.0');
  assert.equal(inspectionDisplayForElapsed(14.91), '0.1');
  assert.equal(inspectionDisplayForElapsed(15), 'DNF');
  assert.equal(inspectionDisplayForElapsed(12.34, { unit: true }), '2.7s');
});
