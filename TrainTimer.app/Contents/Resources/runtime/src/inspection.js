export const inspectionSeconds = 15;
export const inspectionDnfSeconds = inspectionSeconds;
export const inspectionReminderSeconds = [8, 12];

export function inspectionPenaltyForElapsed(elapsedSeconds) {
  const elapsed = normalizeInspectionElapsed(elapsedSeconds);
  return elapsed >= inspectionDnfSeconds ? 'dnf' : 'ok';
}

export function inspectionDisplayForElapsed(elapsedSeconds, options = {}) {
  if (inspectionPenaltyForElapsed(elapsedSeconds) === 'dnf') return 'DNF';
  const elapsed = normalizeInspectionElapsed(elapsedSeconds);
  const remainingTenths = Math.ceil(Math.max(0, inspectionSeconds - elapsed - 0.0001) * 10);
  const text = (remainingTenths / 10).toFixed(1);
  return options.unit ? `${text}s` : text;
}

function normalizeInspectionElapsed(value) {
  const elapsed = Number(value);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}
