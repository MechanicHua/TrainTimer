import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageOfLast,
  bestAverageRecord,
  bestAverageOf,
  bestMeanRecord,
  bestMeanOf,
  bestSingleRecord,
  effectiveDurationMs,
  meanOfLast,
  recordMarksAt,
  rollingAverageAt,
  rollingMeanAt,
} from '../src/rolling-averages.js';

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

test('computes rolling means at a solve index', () => {
  assert.equal(rollingMeanAt(solves, 1, 3), null);
  assert.equal(rollingMeanAt(solves, 2, 3), 11000);
  assert.equal(rollingMeanAt(solves, 5, 3), 14000);
});

test('marks personal-best solves and rolling averages', () => {
  const pbSolves = [12, 11, 10, 15, 9, 13, 8, 14, 7, 16, 6, 12].map((seconds, index) => ({
    id: String(index + 1),
    durationMs: seconds * 1000,
    penalty: 'ok',
  }));

  assert.deepEqual(recordMarksAt(pbSolves, 0), [
    { type: 'single', label: 'PB', value: 12000 },
  ]);
  assert.deepEqual(recordMarksAt(pbSolves, 2), [
    { type: 'single', label: 'PB', value: 10000 },
    { type: 'mo3', label: 'PB mo3', value: 11000 },
  ]);
  assert.deepEqual(recordMarksAt(pbSolves, 4), [
    { type: 'single', label: 'PB', value: 9000 },
    { type: 'ao5', label: 'PB ao5', value: 11000 },
  ]);
  assert.deepEqual(recordMarksAt(pbSolves, 11), [
    { type: 'ao12', label: 'PB ao12', value: 11100 },
  ]);
});

test('marks long personal-best rolling averages', () => {
  const fiftySolves = Array.from({ length: 50 }, (_, index) => ({
    id: `f${index + 1}`,
    durationMs: 10000,
    penalty: 'ok',
  }));
  const hundredSolves = Array.from({ length: 100 }, (_, index) => ({
    id: `h${index + 1}`,
    durationMs: 10000,
    penalty: 'ok',
  }));

  assert.deepEqual(recordMarksAt(fiftySolves, 49), [
    { type: 'ao50', label: 'PB ao50', value: 10000 },
  ]);
  assert.deepEqual(recordMarksAt(hundredSolves, 99), [
    { type: 'ao100', label: 'PB ao100', value: 10000 },
  ]);
});

test('finds best single and rolling average records with ending index', () => {
  const recordSolves = [12, 11, 10, 15, 9, 13].map((seconds, index) => ({
    id: `r${index + 1}`,
    durationMs: seconds * 1000,
    penalty: 'ok',
  }));

  assert.deepEqual(bestSingleRecord(recordSolves), {
    type: 'single',
    label: '最佳单次',
    value: 9000,
    startIndex: 4,
    endIndex: 4,
    solveIds: ['r5'],
  });
  assert.deepEqual(bestMeanRecord(recordSolves, 3), {
    type: 'mo3',
    label: 'mo3',
    value: 11000,
    startIndex: 0,
    endIndex: 2,
    solveIds: ['r1', 'r2', 'r3'],
  });
  assert.deepEqual(bestAverageRecord(recordSolves, 5), {
    type: 'ao5',
    label: 'ao5',
    value: 11000,
    startIndex: 0,
    endIndex: 4,
    solveIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
  });
});

test('falls back to duration when effective duration is absent', () => {
  assert.equal(effectiveDurationMs({ durationMs: 12345, effectiveDurationMs: null, penalty: 'ok' }), 12345);
  assert.equal(effectiveDurationMs({ durationMs: 12345, effectiveDurationMs: '', penalty: '+2' }), 14345);
});
