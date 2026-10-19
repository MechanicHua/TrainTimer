// Exact content identity, not object identity or first/last-move approximations.
export function analysisInputKey(solve) {
  const cross = solve.cfopStages?.find((stage) => stage.key === 'cross' || stage.label === 'C');
  const inspection = solve.inspectionDurationMs ?? (Number(cross?.analysisVersion) >= 6 ? cross?.observationMs : null);
  return JSON.stringify([
    solve.cfopBottomFace || '', solve.scramble || '', solve.scramblePuzzle || 'three', solve.durationMs ?? null,
    solve.timerStartedAt || '', solve.timerStartedAtMs ?? null, solve.solveStartedAtMs ?? null,
    solve.finalSolvedByStatePacket === true,
    solve.inspectionEnabled ?? null, inspection ?? (solve.inspectionEnabled === false ? 0 : null),
    solve.timerSource || 'manual', solve.bluetoothSolvedByStatePacket === true,
    solve.bluetoothMoves || [], solve.bluetoothMoveLog || [],
    solve.bluetoothStateCorrections || [], solve.bluetoothStateLog || [],
  ]);
}

export function invalidateAnalysis(previous, next) {
  if (analysisInputKey(previous) === analysisInputKey(next)) return next;
  return { ...next, rawRevision: (previous.rawRevision || 0) + 1,
    analysisStatus: 'pending', analysisRawRevision: -1 };
}
