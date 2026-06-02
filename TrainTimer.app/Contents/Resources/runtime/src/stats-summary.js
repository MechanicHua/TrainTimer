import { chronologicalSolves } from './rolling-averages.js';

export function buildStatsSummary(sessionName, summary, latestSolves = []) {
  const rows = [
    ['次数', summary.count ?? 0],
    ['有效成绩', summary.validCount ?? 0],
    ['DNF', summary.dnfCount ?? 0],
    ['+2', summary.plus2Count ?? 0],
    ['蓝牙成绩', summary.bluetoothSolveCount ?? 0],
    ['最佳', timeOrDash(summary.best)],
    ['平均', timeOrDash(summary.average)],
    ['标准差', timeOrDash(summary.standardDeviation)],
    ['平均转动', numberOrDash(summary.averageBluetoothMoveCount, 1)],
    ['平均 TPS', numberOrDash(summary.averageBluetoothTps, 3)],
    ['最佳 TPS', numberOrDash(summary.bestBluetoothTps, 3)],
    ['mo3', timeOrDash(summary.mo3)],
    ['ao5', timeOrDash(summary.ao5)],
    ['ao12', timeOrDash(summary.ao12)],
    ['ao50', timeOrDash(summary.ao50)],
    ['ao100', timeOrDash(summary.ao100)],
    ['最佳 mo3', timeOrDash(summary.bestMo3)],
    ['最佳 ao5', timeOrDash(summary.bestAo5)],
    ['最佳 ao12', timeOrDash(summary.bestAo12)],
    ['最佳 ao50', timeOrDash(summary.bestAo50)],
    ['最佳 ao100', timeOrDash(summary.bestAo100)],
  ];
  const latest = chronologicalSolves(latestSolves).slice(-5).map(displaySolveTime);

  return [
    `TrainTimer - ${sessionName || 'Session'}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    latest.length > 0 ? `最近 ${latest.length}: ${latest.join(' / ')}` : null,
  ].filter(Boolean).join('\n');
}

function timeOrDash(value) {
  return value == null ? '-' : formatTime(value);
}

function numberOrDash(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function displaySolveTime(solve) {
  if (solve.penalty === 'dnf') return 'DNF';
  if (solve.penalty === '+2') return `${formatTime(solve.durationMs + 2000)}+`;
  return solve.duration || formatTime(solve.durationMs);
}

function formatTime(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  return `${seconds}.${String(millis).padStart(3, '0')}`;
}
