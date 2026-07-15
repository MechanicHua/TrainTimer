const faceletPattern = /^[URFDLB]{54}$/;

export const bluetoothStateLogPostSolveCaptureMs = 1800;

export function bluetoothStateLogSnapshotCorrections(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(normalizeBluetoothStateLogSnapshot)
    .filter(Boolean);
}

export function bluetoothStateLogCachePart(entries) {
  if (!Array.isArray(entries)) return '';
  return entries
    .map((entry) => [
      entry?.step ?? '',
      entry?.facelets || '',
      entry?.stateSignature || '',
      entry?.raw || '',
      entry?.elapsedMs ?? '',
      entry?.timestampMs ?? '',
    ].join(':'))
    .join(',');
}

export function hasBluetoothStateLogSnapshots(entries) {
  return bluetoothStateLogSnapshotCorrections(entries).length > 0;
}

export function bluetoothStateLogRevision(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '0';
  const last = entries.at(-1) || {};
  return [
    entries.length,
    last.step ?? '',
    last.timestampMs ?? '',
    last.stateSignature || '',
    last.facelets || '',
    last.raw || '',
  ].join(':');
}

export function shouldCaptureBluetoothStateLogPacket(appState, now, captureUntil) {
  if (appState === 'timing') return true;
  if (appState !== 'saving' && appState !== 'done') return false;
  return Number.isFinite(now) && Number.isFinite(captureUntil) && now <= captureUntil;
}

function normalizeBluetoothStateLogSnapshot(entry) {
  const step = Number(entry?.step);
  if (!Number.isInteger(step) || step < 0) return null;
  const facelets = String(entry?.facelets || '').trim().toUpperCase();
  if (!faceletPattern.test(facelets)) return null;
  return {
    ...entry,
    step,
    facelets,
    source: entry?.source || 'GAN 状态包日志',
    reason: entry?.reason || 'state-log',
  };
}
