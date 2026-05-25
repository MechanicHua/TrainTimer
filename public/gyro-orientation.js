const SQRT_HALF = Math.SQRT1_2;

// GAN reports a right-handed basis with +X red, +Y blue, +Z white.
// The 3D model uses +X red, +Y white, +Z green, so vectors map to (x, z, -y).
const ganToCube3dBasis = normalizeQuaternion({
  x: -SQRT_HALF,
  y: 0,
  z: 0,
  w: SQRT_HALF,
});
const cube3dToGanBasis = invertUnitQuaternion(ganToCube3dBasis);

export function ganGyroQuaternionToCube3dBasis(quaternion = {}) {
  const normalized = normalizeQuaternion(quaternion);
  if (!normalized) return null;
  // Keep observed GAN landmarks stable: q.w ~= 0 flips yellow up, q.x ~= 0 is the white-up baseline.
  return normalizeQuaternion(multiplyQuaternions(
    multiplyQuaternions(ganToCube3dBasis, normalized),
    cube3dToGanBasis,
  ));
}

export function ganGyroVelocityToCube3dBasis(velocity = {}) {
  const { x, y, z } = velocity;
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y: z, z: -y };
}

export function normalizeQuaternion(quaternion = {}) {
  const { x, y, z, w } = quaternion;
  if (![x, y, z, w].every(Number.isFinite)) return null;
  const length = Math.hypot(x, y, z, w);
  if (length <= 0.1) return null;
  return {
    x: x / length,
    y: y / length,
    z: z / length,
    w: w / length,
  };
}

function multiplyQuaternions(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function invertUnitQuaternion(quaternion) {
  return {
    x: -quaternion.x,
    y: -quaternion.y,
    z: -quaternion.z,
    w: quaternion.w,
  };
}
