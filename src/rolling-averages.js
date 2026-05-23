export function rollingAverageAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  return averageOfWindow(solves.slice(index + 1 - size, index + 1));
}

export function rollingMeanAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  return meanOfWindow(solves.slice(index + 1 - size, index + 1));
}

export function recordMarksAt(solves, index, options = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= solves.length) return [];

  const marks = [];
  const previousSolves = solves.slice(0, index);
  const single = effectiveDurationMs(solves[index]);
  const previousSingleBest = bestSingleOf(previousSolves);
  if (single != null && (previousSingleBest == null || single < previousSingleBest)) {
    marks.push({ type: 'single', label: 'PB', value: single });
  }

  for (const size of options.meanSizes || [3]) {
    const value = rollingMeanAt(solves, index, size);
    const previousBest = bestMeanOf(previousSolves, size);
    if (value != null && (previousBest == null || value < previousBest)) {
      marks.push({ type: `mo${size}`, label: `PB mo${size}`, value });
    }
  }

  for (const size of options.averageSizes || [5, 12]) {
    const value = rollingAverageAt(solves, index, size);
    const previousBest = bestAverageOf(previousSolves, size);
    if (value != null && (previousBest == null || value < previousBest)) {
      marks.push({ type: `ao${size}`, label: `PB ao${size}`, value });
    }
  }

  return marks;
}

export function averageOfLast(solves, size) {
  if (solves.length < size) return null;
  return averageOfWindow(solves.slice(-size));
}

export function bestAverageOf(solves, size) {
  if (solves.length < size) return null;
  const averages = [];
  for (let index = 0; index <= solves.length - size; index += 1) {
    const average = averageOfWindow(solves.slice(index, index + size));
    if (average != null) averages.push(average);
  }
  return averages.length === 0 ? null : Math.min(...averages);
}

export function meanOfLast(solves, size) {
  if (solves.length < size) return null;
  return meanOfWindow(solves.slice(-size));
}

export function bestMeanOf(solves, size) {
  if (solves.length < size) return null;
  const means = [];
  for (let index = 0; index <= solves.length - size; index += 1) {
    const mean = meanOfWindow(solves.slice(index, index + size));
    if (mean != null) means.push(mean);
  }
  return means.length === 0 ? null : Math.min(...means);
}

export function averageOfWindow(solves) {
  const values = solves.map(effectiveDurationMs);
  if (values.filter((value) => value == null).length > 1) return null;
  const sorted = [...values].sort((left, right) => (left ?? Infinity) - (right ?? Infinity));
  const trimmed = sorted.slice(1, -1);
  if (trimmed.some((value) => value == null)) return null;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

export function meanOfWindow(solves) {
  const values = solves.map(effectiveDurationMs);
  if (values.some((value) => value == null)) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function effectiveDurationMs(solve) {
  if (solve.penalty === 'dnf') return null;
  if (solve.effectiveDurationMs != null && solve.effectiveDurationMs !== '' && Number.isFinite(Number(solve.effectiveDurationMs))) {
    return Number(solve.effectiveDurationMs);
  }
  const durationMs = Math.max(0, Math.round(Number(solve.durationMs) || 0));
  return durationMs + (solve.penalty === '+2' ? 2000 : 0);
}

function bestSingleOf(solves) {
  const values = solves.map(effectiveDurationMs).filter((value) => value != null);
  return values.length === 0 ? null : Math.min(...values);
}
