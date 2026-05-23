export function buildSolveSummary(solve, sessionName = '') {
  const lines = [
    `TrainTimer Solve${sessionName ? ` - ${sessionName}` : ''}`,
    `成绩: ${displaySolveTime(solve)}`,
    `原始: ${solve.duration || formatMilliseconds(solve.durationMs)}`,
    `罚时: ${penaltyLabel(solve.penalty)}`,
    `时间: ${formatDate(solve.createdAt)}`,
    `来源: ${solve.timerSource === 'bluetooth' ? '蓝牙停表' : '手动停表'}`,
    `观察: ${solve.inspectionEnabled ? '开启' : '关闭'}`,
    `打乱类型: ${solve.scramblePuzzle || 'three'}`,
    `打乱: ${solve.scramble || '-'}`,
  ];

  const tags = Array.isArray(solve.tags) && solve.tags.length > 0 ? solve.tags.join(', ') : '';
  if (tags) lines.push(`标签: ${tags}`);
  if (solve.comment) lines.push(`备注: ${solve.comment}`);

  const bluetoothMoves = Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves : [];
  if (bluetoothMoves.length > 0) {
    lines.push(`蓝牙转动: ${bluetoothMoves.join(' ')}`);
    lines.push(`转动数: ${solve.bluetoothMoveCount ?? bluetoothMoves.length}`);
    if (Number.isFinite(solve.bluetoothTps)) lines.push(`TPS: ${solve.bluetoothTps.toFixed(3)}`);
  }

  return lines.join('\n');
}

function displaySolveTime(solve) {
  if (solve.penalty === 'dnf') return 'DNF';
  if (solve.penalty === '+2') return `${formatMilliseconds(Number(solve.durationMs) + 2000)}+`;
  return solve.duration || formatMilliseconds(solve.durationMs);
}

function penaltyLabel(penalty) {
  if (penalty === '+2') return '+2';
  if (penalty === 'dnf') return 'DNF';
  return 'OK';
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function formatMilliseconds(value) {
  const totalMs = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  return `${seconds}.${String(millis).padStart(3, '0')}`;
}
