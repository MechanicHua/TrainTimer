import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDelayBeforeMove, replayMoveAnimationDelay } from '../src/replay-timing.js';

test('replay delay uses the first move elapsed time as observation before playback starts', () => {
  const records = [
    { move: 'R', elapsedMs: 1280 },
    { move: 'U', elapsedMs: 1420 },
  ];

  assert.equal(replayDelayBeforeMove(records, 0), 1280);
});

test('replay delay uses per-move elapsed deltas after playback starts', () => {
  const records = [
    { move: 'R', elapsedMs: 100 },
    { move: 'U', elapsedMs: 1600 },
    { move: 'R2', elapsedMs: 1710 },
  ];

  assert.equal(replayDelayBeforeMove(records, 1, { minimumDelayMs: 330 }), 1500);
  assert.equal(replayDelayBeforeMove(records, 2, { minimumDelayMs: replayMoveAnimationDelay('U') }), 330);
});

test('replay delay clamps long observations and falls back when timing is invalid', () => {
  assert.equal(
    replayDelayBeforeMove([{ move: 'R', elapsedMs: 15123 }], 0),
    2600,
  );
  assert.equal(
    replayDelayBeforeMove([{ move: 'R', elapsedMs: 900 }, { move: 'U2', elapsedMs: 800 }], 1),
    470,
  );
});

test('replay move animation delay distinguishes half turns from quarter turns', () => {
  assert.equal(replayMoveAnimationDelay('M2'), 470);
  assert.equal(replayMoveAnimationDelay("R'"), 330);
});
