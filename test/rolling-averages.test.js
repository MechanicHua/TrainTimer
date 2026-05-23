import test from 'node:test';
import assert from 'node:assert/strict';
import { averageOfLast, bestAverageOf, bestMeanOf, effectiveDurationMs, meanOfLast, rollingAverageAt } from '../src/rolling-averages.js';

const solves = [10, 11, 12, 13, 14, 15].map((seconds, index) => ({
  id: String(index + 1),
  durationMs: seconds * 1000,
  penalty: 'ok',
}));

test('computes rolling WCA averages at a solve index', () => {
  assert.equal(rollingAverageAt(solves, 3, 5), null);
  assert.equal(rollingAverageAt(solves, 4, 5), 12000);
  assert.equal(rollingAverageAt(solves, 5, 5), 13000);
});

test('trims one DNF but rejects windows with multiple DNFs', () => {
  const oneDnf = solves.slice(0, 5).map((solve, index) => (
    index === 4 ? { ...solve, penalty: 'dnf' } : solve
  ));
  assert.equal(rollingAverageAt(oneDnf, 4, 5), 12000);

  const twoDnfs = oneDnf.map((solve, index) => (
    index === 3 ? { ...solve, penalty: 'dnf' } : solve
  ));
  assert.equal(rollingAverageAt(twoDnfs, 4, 5), null);
});

test('computes current and best averages with +2 penalties', () => {
  const penalized = solves.map((solve, index) => (
    index === 2 ? { ...solve, penalty: '+2' } : solve
  ));

  assert.equal(averageOfLast(penalized, 5), 41000 / 3);
  assert.equal(bestAverageOf(penalized, 5), 38000 / 3);
});

test('computes current and best mean of three without trimming', () => {
  const penalized = solves.map((solve, index) => (
    index === 4 ? { ...solve, penalty: '+2' } : solve
  ));

  assert.equal(meanOfLast(penalized, 3), 44000 / 3);
  assert.equal(bestMeanOf(penalized, 3), 11000);

  const withDnf = penalized.map((solve, index) => (
    index === 5 ? { ...solve, penalty: 'dnf' } : solve
  ));
  assert.equal(meanOfLast(withDnf, 3), null);
  assert.equal(bestMeanOf(withDnf, 3), 11000);
});

test('falls back to duration when effective duration is absent', () => {
  assert.equal(effectiveDurationMs({ durationMs: 12345, effectiveDurationMs: null, penalty: 'ok' }), 12345);
  assert.equal(effectiveDurationMs({ durationMs: 12345, effectiveDurationMs: '', penalty: '+2' }), 14345);
});
