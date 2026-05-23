export function rollingAverageAt(solves, index, size) {
  if (!Number.isInteger(index) || index < 0 || index + 1 < size) return null;
  return averageOfWindow(solves.slice(index + 1 - size, index + 1));
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

export function averageOfWindow(solves) {
  const values = solves.map(effectiveDurationMs);
  if (values.filter((value) => value == null).length > 1) return null;
  const sorted = [...values].sort((left, right) => (left ?? Infinity) - (right ?? Infinity));
  const trimmed = sorted.slice(1, -1);
  if (trimmed.some((value) => value == null)) return null;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

export function effectiveDurationMs(solve) {
  if (solve.penalty === 'dnf') return null;
  if (solve.effectiveDurationMs != null && solve.effectiveDurationMs !== '' && Number.isFinite(Number(solve.effectiveDurationMs))) {
    return Number(solve.effectiveDurationMs);
  }
  const durationMs = Math.max(0, Math.round(Number(solve.durationMs) || 0));
  return durationMs + (solve.penalty === '+2' ? 2000 : 0);
}
