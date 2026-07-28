import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCfopChartStages,
  buildCfopHistoryIndex,
  buildCfopStageComparison,
  buildCfopStageShare,
  cfopComparisonAxisMax,
  cfopComparisonAxisPosition,
  roundedPercentages,
} from '../src/cfop-stage-stats.js';

function stages(values = [1800, 1400, 1700, 1600, 1500, 2300, 1900], options = {}) {
  const labels = ['C', 'F1', 'F2', 'F3', 'F4', 'O', 'P'];
  return labels.map((label, index) => ({
    key: label === 'C' ? 'cross' : (label === 'O' ? 'oll' : (label === 'P' ? 'pll' : `pair-${index}`)),
    label,
    completed: options.incompleteIndex !== index,
    completedAt: index + 1,
    turns: values[index] === 0 ? 0 : index + 1,
    durationMs: values[index],
    skipped: values[index] === 0,
  }));
}

function solve(id, createdAt, values, options = {}) {
  return {
    id,
    createdAt,
    scramblePuzzle: options.puzzle || 'three',
    penalty: options.penalty || 'ok',
    sessionId: options.sessionId || 'default',
    cfopStages: stages(values, options),
  };
}

test('aggregates saved CFOP timing into Cross, F2L, OLL and PLL', () => {
  const result = aggregateCfopChartStages(stages());
  assert.deepEqual(result.values, {
    cross: 1800,
    f2l: 6200,
    oll: 2300,
    pll: 1900,
  });
  assert.equal(result.totalMs, 12200);
});

test('rejects incomplete and collapsed CFOP timing while accepting skips', () => {
  assert.equal(aggregateCfopChartStages(stages(undefined, { incompleteIndex: 3 })), null);
  const collapsed = stages().map((stage, index) => ({
    ...stage,
    completedAt: 12,
    turns: index === 0 ? 12 : 0,
    durationMs: index === 0 ? 1200 : 0,
  }));
  assert.equal(aggregateCfopChartStages(collapsed), null);

  const skip = aggregateCfopChartStages(stages([1800, 1400, 1700, 1600, 1500, 0, 0]));
  assert.equal(skip.values.oll, 0);
  assert.equal(skip.values.pll, 0);
});

test('history averages use only prior valid 3x3 non-DNF solves across sessions', () => {
  const valuesA = [2000, 1000, 1000, 1000, 1000, 2500, 2000];
  const valuesB = [1800, 900, 900, 900, 900, 2300, 1800];
  const currentValues = [1600, 800, 800, 800, 800, 2100, 1600];
  const solves = [
    solve('a', '2026-01-01T00:00:00Z', valuesA),
    solve('dnf', '2026-01-02T00:00:00Z', valuesB, { penalty: 'dnf' }),
    solve('four', '2026-01-03T00:00:00Z', valuesB, { puzzle: 'four' }),
    solve('b', '2026-01-04T00:00:00Z', valuesB, { sessionId: 'other', penalty: '+2' }),
    solve('current', '2026-01-05T00:00:00Z', currentValues),
    solve('future', '2026-01-06T00:00:00Z', valuesA),
  ];
  const history = buildCfopHistoryIndex(solves);
  const comparison = buildCfopStageComparison(solves[4], stages(currentValues), history);

  assert.equal(comparison.historyCount, 2);
  assert.equal(comparison.rows[0].averageMs, 1900);
  assert.equal(comparison.rows[1].averageMs, 3800);
  assert.equal(comparison.rows[0].deltaMs, -300);
});

test('selects a shared comparison scale and maps values around the midpoint', () => {
  assert.equal(cfopComparisonAxisMax([-0.12, 0.18]), 0.2);
  assert.equal(cfopComparisonAxisMax([-0.52, 0.2]), 0.75);
  assert.equal(cfopComparisonAxisPosition(-0.2, 0.2), 0);
  assert.equal(cfopComparisonAxisPosition(0, 0.2), 50);
  assert.equal(cfopComparisonAxisPosition(0.2, 0.2), 100);
});

test('rounds displayed stage shares to exactly one hundred percent', () => {
  assert.deepEqual(roundedPercentages([12.5, 55.2, 18.1, 14.2]), [13, 55, 18, 14]);
  assert.equal(roundedPercentages([1, 1, 1, 1]).reduce((sum, value) => sum + value, 0), 100);
});

test('builds stage shares and cumulative boundaries', () => {
  const aggregate = aggregateCfopChartStages(stages([1860, 1900, 2000, 2050, 2000, 2620, 1920]));
  const share = buildCfopStageShare(aggregate);
  assert.equal(share.totalMs, 14350);
  assert.deepEqual(share.boundariesMs, [0, 1860, 9810, 12430, 14350]);
  assert.equal(share.stages.reduce((sum, stage) => sum + stage.percentage, 0), 100);
});
