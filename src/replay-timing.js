const defaultQuarterTurnDelayMs = 330;
const defaultHalfTurnDelayMs = 470;
const defaultMinimumDelayMs = 120;
const defaultMaximumStepDelayMs = 2200;
const defaultMaximumObservationDelayMs = 2600;

export function replayMoveAnimationDelay(move, options = {}) {
  const halfTurnDelayMs = positiveNumber(options.halfTurnDelayMs, defaultHalfTurnDelayMs);
  const quarterTurnDelayMs = positiveNumber(options.quarterTurnDelayMs, defaultQuarterTurnDelayMs);
  return String(move || '').trim().endsWith('2') ? halfTurnDelayMs : quarterTurnDelayMs;
}

export function replayDelayBeforeMove(records, moveIndex, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const index = Math.max(0, Math.trunc(Number(moveIndex) || 0));
  const record = list[index];
  if (!record) return 0;

  const fallbackDelayMs = positiveNumber(
    options.fallbackDelayMs,
    replayMoveAnimationDelay(record.move, options),
  );
  const minimumDelayMs = positiveNumber(options.minimumDelayMs, defaultMinimumDelayMs);
  const maximumDelayMs = index === 0
    ? positiveNumber(options.maximumObservationDelayMs, defaultMaximumObservationDelayMs)
    : positiveNumber(options.maximumStepDelayMs, defaultMaximumStepDelayMs);

  const elapsedMs = nonNegativeNumber(record.elapsedMs);
  const previousElapsedMs = index === 0 ? 0 : nonNegativeNumber(list[index - 1]?.elapsedMs);
  if (elapsedMs == null || previousElapsedMs == null || elapsedMs < previousElapsedMs) {
    return clampDelay(fallbackDelayMs, minimumDelayMs, maximumDelayMs);
  }

  const scale = positiveNumber(options.timeScale, 1);
  const delayMs = Math.round((elapsedMs - previousElapsedMs) * scale);
  return clampDelay(delayMs, minimumDelayMs, maximumDelayMs);
}

function clampDelay(value, minimumDelayMs, maximumDelayMs) {
  return Math.min(maximumDelayMs, Math.max(minimumDelayMs, Math.round(value)));
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
