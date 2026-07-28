import { chronologicalSolves } from './rolling-averages.js';

export const cfopChartStageOrder = ['cross', 'f2l', 'oll', 'pll'];

const stageLabels = {
  cross: 'Cross',
  f2l: 'F2L',
  oll: 'OLL',
  pll: 'PLL',
};

const supportedAxisMaxima = [0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2];

export function aggregateCfopChartStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const normalized = stages.map(normalizeStage).filter(Boolean);
  if (normalized.length === 0 || isCollapsedCfopTiming(normalized)) return null;

  const cross = normalized.find((stage) => stage.group === 'cross');
  const f2lStages = ['F1', 'F2', 'F3', 'F4']
    .map((label) => normalized.find((stage) => stage.label === label));
  const oll = normalized.find((stage) => stage.group === 'oll');
  const pll = normalized.find((stage) => stage.group === 'pll');
  const required = [cross, ...f2lStages, oll, pll];
  if (required.some((stage) => !validCompletedStage(stage))) return null;

  const values = {
    cross: cross.durationMs,
    f2l: f2lStages.reduce((sum, stage) => sum + stage.durationMs, 0),
    oll: oll.durationMs,
    pll: pll.durationMs,
  };
  const totalMs = cfopChartStageOrder.reduce((sum, key) => sum + values[key], 0);
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;

  return {
    values,
    totalMs,
    stages: cfopChartStageOrder.map((key) => ({
      key,
      label: stageLabels[key],
      durationMs: values[key],
    })),
  };
}

export function buildCfopHistoryIndex(solves) {
  const entries = new Map();
  const sums = Object.fromEntries(cfopChartStageOrder.map((key) => [key, 0]));
  let count = 0;

  for (const solve of chronologicalSolves(Array.isArray(solves) ? solves : [])) {
    entries.set(solve.id, {
      count,
      averages: count > 0
        ? Object.fromEntries(cfopChartStageOrder.map((key) => [key, sums[key] / count]))
        : null,
    });

    const aggregate = eligibleHistoryAggregate(solve);
    if (!aggregate) continue;
    for (const key of cfopChartStageOrder) sums[key] += aggregate.values[key];
    count += 1;
  }

  return { entries, eligibleCount: count };
}

export function buildCfopStageComparison(solve, currentStages, historyIndex) {
  const current = aggregateCfopChartStages(currentStages);
  const history = historyIndex?.entries?.get(solve?.id);
  if (!current) return { current: null, historyCount: history?.count || 0, rows: [] };
  if (!history?.averages || history.count <= 0) {
    return { current, historyCount: 0, rows: [] };
  }

  const rows = cfopChartStageOrder.map((key) => {
    const currentMs = current.values[key];
    const averageMs = history.averages[key];
    const deltaMs = currentMs - averageMs;
    const ratio = averageMs > 0 ? deltaMs / averageMs : null;
    return {
      key,
      label: stageLabels[key],
      currentMs,
      averageMs,
      deltaMs,
      ratio,
    };
  });

  return {
    current,
    historyCount: history.count,
    rows,
    axisMaxRatio: cfopComparisonAxisMax(rows.map((row) => row.ratio)),
  };
}

export function cfopComparisonAxisMax(ratios) {
  const maximum = Math.max(
    0,
    ...(Array.isArray(ratios) ? ratios : [])
      .filter((ratio) => Number.isFinite(ratio))
      .map((ratio) => Math.abs(ratio)),
  );
  const supported = supportedAxisMaxima.find((value) => value >= maximum);
  return supported || Math.ceil(maximum * 2) / 2 || supportedAxisMaxima[0];
}

export function cfopComparisonAxisPosition(ratio, axisMaxRatio) {
  if (!Number.isFinite(ratio) || !Number.isFinite(axisMaxRatio) || axisMaxRatio <= 0) return 50;
  return Math.max(0, Math.min(100, 50 + (ratio / (axisMaxRatio * 2)) * 100));
}

export function buildCfopStageShare(aggregate) {
  if (!aggregate?.values || !Number.isFinite(aggregate.totalMs) || aggregate.totalMs <= 0) return null;
  const rawPercentages = cfopChartStageOrder.map((key) => (
    aggregate.values[key] / aggregate.totalMs * 100
  ));
  const percentages = roundedPercentages(rawPercentages);
  let elapsedMs = 0;
  const stages = cfopChartStageOrder.map((key, index) => {
    const startMs = elapsedMs;
    elapsedMs += aggregate.values[key];
    return {
      key,
      label: stageLabels[key],
      durationMs: aggregate.values[key],
      startMs,
      endMs: elapsedMs,
      share: rawPercentages[index] / 100,
      percentage: percentages[index],
    };
  });
  return {
    totalMs: aggregate.totalMs,
    stages,
    boundariesMs: [0, ...stages.map((stage) => stage.endMs)],
  };
}

export function roundedPercentages(percentages) {
  const values = (Array.isArray(percentages) ? percentages : [])
    .map((value) => Math.max(0, Number.isFinite(value) ? value : 0));
  if (values.length === 0) return [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const normalized = values.map((value) => value / total * 100);
  const result = normalized.map(Math.floor);
  let remaining = 100 - result.reduce((sum, value) => sum + value, 0);
  const order = normalized
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    result[order[index % order.length].index] += 1;
  }
  return result;
}

function eligibleHistoryAggregate(solve) {
  if (!solve || (solve.scramblePuzzle || 'three') !== 'three') return null;
  if ((solve.penalty || 'ok') === 'dnf') return null;
  return aggregateCfopChartStages(solve.cfopStages);
}

function normalizeStage(stage) {
  if (!stage) return null;
  const key = String(stage.key || '').toLowerCase();
  const label = String(stage.label || '').toUpperCase();
  let group = '';
  if (key === 'cross' || label === 'C') group = 'cross';
  else if (/^F[1-4]$/.test(label)) group = 'f2l';
  else if (key === 'oll' || label === 'O') group = 'oll';
  else if (key === 'pll' || label === 'P') group = 'pll';
  return {
    group,
    label,
    completed: stage.completed === true,
    completedAt: optionalNumber(stage.completedAt),
    turns: Number.isFinite(Number(stage.turns)) ? Number(stage.turns) : 0,
    durationMs: optionalNumber(stage.durationMs),
  };
}

function validCompletedStage(stage) {
  return Boolean(stage?.completed && Number.isFinite(stage.durationMs) && stage.durationMs >= 0);
}

function isCollapsedCfopTiming(stages) {
  const completed = stages.filter((stage) => stage.completed);
  if (completed.length < 4) return false;
  const first = completed[0];
  if (!Number.isFinite(first.completedAt) || first.completedAt <= 0) return false;
  if (!Number.isFinite(first.durationMs) || first.durationMs <= 0) return false;
  return completed.every((stage) => stage.completedAt === first.completedAt)
    && completed.slice(1).every((stage) => stage.turns === 0 && (stage.durationMs == null || stage.durationMs === 0));
}

function optionalNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
