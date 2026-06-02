export function rollingAverageAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  return averageOfWindow(solves.slice(index + 1 - size, index + 1));
}

export function rollingAverageDetailAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  const startIndex = index + 1 - size;
  const windowSolves = solves.slice(startIndex, index + 1);
  const entries = windowSolves.map((solve, offset) => ({
    solve,
    index: startIndex + offset,
    value: effectiveDurationMs(solve),
    role: 'counted',
  }));
  const dnfEntries = entries.filter((entry) => entry.value == null);
  if (dnfEntries.length > 1) return null;

  const sortedEntries = entries
    .filter((entry) => entry.value != null)
    .sort((left, right) => {
      const difference = left.value - right.value;
      return difference === 0 ? left.index - right.index : difference;
    });
  if (sortedEntries.length < size - dnfEntries.length) return null;

  const fastest = sortedEntries[0];
  const slowest = dnfEntries[0] || sortedEntries.at(-1);
  if (!fastest || !slowest || fastest.index === slowest.index) return null;

  fastest.role = 'trimmed-best';
  slowest.role = 'trimmed-worst';

  const countedValues = entries
    .filter((entry) => entry.role === 'counted')
    .map((entry) => entry.value);
  if (countedValues.length !== size - 2 || countedValues.some((value) => value == null)) return null;

  return {
    type: `ao${size}`,
    size,
    value: countedValues.reduce((sum, value) => sum + value, 0) / countedValues.length,
    startIndex,
    endIndex: index,
    solveIds: windowSolves.map((solve) => solve.id),
    entries,
  };
}

export function rollingMeanAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  return meanOfWindow(solves.slice(index + 1 - size, index + 1));
}

export function rollingMeanDetailAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  const startIndex = index + 1 - size;
  const windowSolves = solves.slice(startIndex, index + 1);
  const entries = windowSolves.map((solve, offset) => ({
    solve,
    index: startIndex + offset,
    value: effectiveDurationMs(solve),
    role: 'counted',
  }));
  if (entries.some((entry) => entry.value == null)) return null;

  return {
    type: `mo${size}`,
    size,
    value: entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length,
    startIndex,
    endIndex: index,
    solveIds: windowSolves.map((solve) => solve.id),
    entries,
  };
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

  for (const size of options.averageSizes || [5, 12, 50, 100]) {
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

export function bestAverageRecord(solves, size) {
  return bestWindowRecord(solves, size, averageOfWindow, `ao${size}`);
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

export function bestMeanRecord(solves, size) {
  return bestWindowRecord(solves, size, meanOfWindow, `mo${size}`);
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

export function chronologicalSolves(solves) {
  return solves
    .map((solve, index) => ({
      solve,
      index,
      timestamp: solveTimestamp(solve),
    }))
    .sort((left, right) => {
      if (left.timestamp == null && right.timestamp != null) return -1;
      if (left.timestamp != null && right.timestamp == null) return 1;
      if (left.timestamp != null && right.timestamp != null && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.solve);
}

export function bestSingleRecord(solves) {
  let best = null;
  solves.forEach((solve, index) => {
    const value = effectiveDurationMs(solve);
    if (value == null) return;
    if (!best || value < best.value) {
      best = {
        type: 'single',
        label: '最佳单次',
        value,
        startIndex: index,
        endIndex: index,
        solveIds: [solve.id],
      };
    }
  });
  return best;
}

function bestWindowRecord(solves, size, windowValue, type) {
  if (solves.length < size) return null;
  let best = null;
  for (let startIndex = 0; startIndex <= solves.length - size; startIndex += 1) {
    const windowSolves = solves.slice(startIndex, startIndex + size);
    const value = windowValue(windowSolves);
    if (value == null) continue;
    if (!best || value < best.value) {
      best = {
        type,
        label: type,
        value,
        startIndex,
        endIndex: startIndex + size - 1,
        solveIds: windowSolves.map((solve) => solve.id),
      };
    }
  }
  return best;
}

function bestSingleOf(solves) {
  const values = solves.map(effectiveDurationMs).filter((value) => value != null);
  return values.length === 0 ? null : Math.min(...values);
}

function solveTimestamp(solve) {
  const timestamp = new Date(solve?.createdAt || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
