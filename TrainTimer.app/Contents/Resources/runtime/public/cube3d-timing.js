// A visual turn may catch up, but the logical move stream must never be dropped.
export function liveTurnDuration(baseDuration, receivedAt, now, previousReceivedAt) {
  const interval = receivedAt - previousReceivedAt;
  const cadence = previousReceivedAt > 0 && interval > 0 && interval < 160
    ? Math.min(baseDuration, interval * 0.85) : baseDuration;
  return Math.max(16, Math.min(cadence, 100 - Math.max(0, now - receivedAt)));
}

export function turnProgress(turn, now) {
  return Math.min(1, Math.max(0, (now - turn.startedAt) / turn.duration));
}
