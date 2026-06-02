const defaultGyroSampleStillRefreshMs = 1000 / 15;
const defaultGyroSampleRawAngleEpsilon = 0.007;
const defaultGyroSampleRawDotThreshold = Math.cos(defaultGyroSampleRawAngleEpsilon / 2);
const defaultGyroSampleRawVelocityEpsilon = 8;
const defaultGyroSampleFastMinMs = 1000 / 120;
const defaultGyroSampleCalmMinMs = 1000 / 45;
const defaultGyroSampleRawCalmAngle = 0.018;
const defaultGyroSampleRawFastAngle = 0.045;
const defaultGyroSampleRawCalmDotThreshold = Math.cos(defaultGyroSampleRawCalmAngle / 2);
const defaultGyroSampleRawFastDotThreshold = Math.cos(defaultGyroSampleRawFastAngle / 2);
const defaultGyroSampleRawCalmVelocityEpsilon = 18;
const defaultGyroSampleRawFastVelocityEpsilon = 32;

export function ganGyroQuaternionToCube3dBasis(quaternion = {}) {
  return ganGyroQuaternionToCube3dBasisInto(quaternion, {});
}

export function ganGyroQuaternionToCube3dBasisInto(quaternion = {}, target = {}) {
  const normalized = normalizeQuaternionInto(quaternion, target);
  if (!normalized) return null;
  const y = normalized.y;
  normalized.y = normalized.z;
  normalized.z = -y;
  return normalized;
}

export function ganGyroVelocityToCube3dBasis(velocity = {}) {
  return ganGyroVelocityToCube3dBasisInto(velocity, {});
}

export function ganGyroVelocityToCube3dBasisInto(velocity = {}, target = {}) {
  const { x, y, z } = velocity;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  target.x = x;
  target.y = z;
  target.z = -y;
  return target;
}

export function normalizeQuaternion(quaternion = {}) {
  return normalizeQuaternionInto(quaternion, {});
}

export function normalizeQuaternionInto(quaternion = {}, target = {}) {
  const { x, y, z, w } = quaternion;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) return null;
  const length = Math.sqrt(x * x + y * y + z * z + w * w);
  if (length <= 0.1) return null;
  target.x = x / length;
  target.y = y / length;
  target.z = z / length;
  target.w = w / length;
  return target;
}

export function shouldAcceptGyroRawSample(raw, previous, elapsedMs, options = {}) {
  if (!isValidGyroRawSample(raw)) return false;
  if (!isValidGyroRawSample(previous)) return true;

  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const stillRefreshMs = finiteOption(options.stillRefreshMs, defaultGyroSampleStillRefreshMs);
  if (elapsed >= stillRefreshMs) return true;

  const dot = gyroRawQuaternionDot(raw, previous);
  const velocityDelta = gyroRawVelocityDelta(raw, previous);
  const fastMotion = !Number.isFinite(dot)
    || dot < finiteOption(options.fastDotThreshold, defaultGyroSampleRawFastDotThreshold)
    || velocityDelta > finiteOption(options.fastVelocityEpsilon, defaultGyroSampleRawFastVelocityEpsilon);
  if (elapsed < finiteOption(options.fastMinMs, defaultGyroSampleFastMinMs) && !fastMotion) return false;

  const calmMotion = fastMotion
    || dot < finiteOption(options.calmDotThreshold, defaultGyroSampleRawCalmDotThreshold)
    || velocityDelta > finiteOption(options.calmVelocityEpsilon, defaultGyroSampleRawCalmVelocityEpsilon);
  if (elapsed < finiteOption(options.calmMinMs, defaultGyroSampleCalmMinMs) && !calmMotion) return false;

  if (dot < finiteOption(options.dotThreshold, defaultGyroSampleRawDotThreshold)) return true;
  return velocityDelta > finiteOption(options.velocityEpsilon, defaultGyroSampleRawVelocityEpsilon);
}

export function gyroRawQuaternionDot(left, right) {
  if (!isValidGyroRawSample(left) || !isValidGyroRawSample(right)) return Number.NaN;
  return Math.abs(
    left.qw * right.qw
    + left.qx * right.qx
    + left.qy * right.qy
    + left.qz * right.qz
  );
}

export function gyroRawVelocityDelta(left, right) {
  if (!isValidGyroRawSample(left) || !isValidGyroRawSample(right)) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(left.vx - right.vx),
    Math.abs(left.vy - right.vy),
    Math.abs(left.vz - right.vz),
  );
}

function isValidGyroRawSample(sample) {
  return Boolean(
    sample
    && Number.isFinite(sample.qw)
    && Number.isFinite(sample.qx)
    && Number.isFinite(sample.qy)
    && Number.isFinite(sample.qz)
    && Number.isFinite(sample.vx)
    && Number.isFinite(sample.vy)
    && Number.isFinite(sample.vz)
  );
}

function finiteOption(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
