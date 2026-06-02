import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ganGyroQuaternionToCube3dBasis,
  ganGyroQuaternionToCube3dBasisInto,
  ganGyroVelocityToCube3dBasis,
  ganGyroVelocityToCube3dBasisInto,
  normalizeQuaternion,
  normalizeQuaternionInto,
  shouldAcceptGyroRawSample,
} from '../public/gyro-orientation.js';

test('normalizes valid quaternions and rejects invalid values', () => {
  assert.deepEqual(normalizeQuaternion({ x: 0, y: 0, z: 0, w: 2 }), { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(normalizeQuaternion({ x: 0, y: 0, z: 0, w: 0 }), null);
  assert.equal(normalizeQuaternion({ x: 0, y: Number.NaN, z: 0, w: 1 }), null);
});

test('writes normalized quaternions into a reusable target', () => {
  const target = { x: 9, y: 9, z: 9, w: 9 };
  assert.equal(normalizeQuaternionInto({ x: 0, y: 0, z: 0, w: 2 }, target), target);
  assert.deepEqual(target, { x: 0, y: 0, z: 0, w: 1 });
});

test('maps GAN gyro axes into the 3D cube coordinate basis', () => {
  const quarterTurn = Math.PI / 2;

  assertQuaternionClose(
    ganGyroQuaternionToCube3dBasis(axisAngleQuaternion([1, 0, 0], quarterTurn)),
    axisAngleQuaternion([1, 0, 0], quarterTurn),
  );
  assertQuaternionClose(
    ganGyroQuaternionToCube3dBasis(axisAngleQuaternion([0, 1, 0], quarterTurn)),
    axisAngleQuaternion([0, 0, -1], quarterTurn),
  );
  assertQuaternionClose(
    ganGyroQuaternionToCube3dBasis(axisAngleQuaternion([0, 0, 1], quarterTurn)),
    axisAngleQuaternion([0, 1, 0], quarterTurn),
  );
});

test('keeps observed GAN q landmarks aligned with white and yellow face-up states', () => {
  assert.equal(topFaceAfterQuaternion(ganGyroQuaternionToCube3dBasis({ w: 1, x: 0, y: 0, z: 0 })), 'U');
  assert.equal(topFaceAfterQuaternion(ganGyroQuaternionToCube3dBasis({ w: 0, x: 1, y: 0, z: 0 })), 'D');
  assert.equal(topFaceAfterQuaternion(ganGyroQuaternionToCube3dBasis({ w: 0.002, x: 0.999, y: 0, z: 0 })), 'D');
  assert.equal(topFaceAfterQuaternion(ganGyroQuaternionToCube3dBasis({ w: 0.999, x: 0.002, y: 0, z: 0 })), 'U');
});

test('maps GAN gyro velocity into the 3D cube coordinate basis', () => {
  assert.deepEqual(ganGyroVelocityToCube3dBasis({ x: 2, y: -3, z: 4 }), { x: 2, y: 4, z: 3 });
  assert.equal(ganGyroVelocityToCube3dBasis({ x: 1, y: Number.NaN, z: 0 }), null);
});

test('writes mapped gyro values into reusable targets', () => {
  const quaternionTarget = {};
  const velocityTarget = {};
  assert.equal(ganGyroQuaternionToCube3dBasisInto({ x: 0, y: 0, z: 0, w: 2 }, quaternionTarget), quaternionTarget);
  assert.deepEqual(quaternionTarget, { x: 0, y: 0, z: -0, w: 1 });
  assert.equal(ganGyroVelocityToCube3dBasisInto({ x: 2, y: -3, z: 4 }, velocityTarget), velocityTarget);
  assert.deepEqual(velocityTarget, { x: 2, y: 4, z: 3 });
});

test('adaptive gyro sample filter coalesces tiny high-rate jitter', () => {
  const previous = rawQuaternion(axisAngleQuaternion([0, 1, 0], 0));
  const tinyJitter = rawQuaternion(axisAngleQuaternion([0, 1, 0], 0.004));
  const deliberateMotion = rawQuaternion(axisAngleQuaternion([0, 1, 0], 0.01));

  assert.equal(shouldAcceptGyroRawSample(tinyJitter, previous, 4), false);
  assert.equal(shouldAcceptGyroRawSample(tinyJitter, previous, 24), false);
  assert.equal(shouldAcceptGyroRawSample(tinyJitter, previous, 70), true);
  assert.equal(shouldAcceptGyroRawSample(deliberateMotion, previous, 24), true);
});

test('adaptive gyro sample filter keeps fast motion responsive', () => {
  const previous = rawQuaternion(axisAngleQuaternion([0, 1, 0], 0));
  const fastTurn = rawQuaternion(axisAngleQuaternion([0, 1, 0], 0.06));
  const velocitySpike = { ...previous, vx: 40 };

  assert.equal(shouldAcceptGyroRawSample(fastTurn, previous, 2), true);
  assert.equal(shouldAcceptGyroRawSample(velocitySpike, previous, 2), true);
});

test('adaptive gyro sample filter rejects invalid samples and accepts initial sync', () => {
  const initial = rawQuaternion(axisAngleQuaternion([1, 0, 0], 0.02));

  assert.equal(shouldAcceptGyroRawSample(initial, null, 0), true);
  assert.equal(shouldAcceptGyroRawSample({ ...initial, qw: Number.NaN }, null, 0), false);
});

function axisAngleQuaternion(axis, angle) {
  const half = angle / 2;
  const sin = Math.sin(half);
  return {
    x: axis[0] * sin,
    y: axis[1] * sin,
    z: axis[2] * sin,
    w: Math.cos(half),
  };
}

function rawQuaternion(quaternion, velocity = {}) {
  return {
    qw: quaternion.w,
    qx: quaternion.x,
    qy: quaternion.y,
    qz: quaternion.z,
    vx: velocity.x || 0,
    vy: velocity.y || 0,
    vz: velocity.z || 0,
  };
}

function assertQuaternionClose(actual, expected, epsilon = 1e-12) {
  assert.ok(actual);
  const aligned = actual.w * expected.w + actual.x * expected.x + actual.y * expected.y + actual.z * expected.z < 0
    ? { x: -actual.x, y: -actual.y, z: -actual.z, w: -actual.w }
    : actual;
  assert.ok(Math.abs(aligned.x - expected.x) < epsilon, `x: ${aligned.x} !== ${expected.x}`);
  assert.ok(Math.abs(aligned.y - expected.y) < epsilon, `y: ${aligned.y} !== ${expected.y}`);
  assert.ok(Math.abs(aligned.z - expected.z) < epsilon, `z: ${aligned.z} !== ${expected.z}`);
  assert.ok(Math.abs(aligned.w - expected.w) < epsilon, `w: ${aligned.w} !== ${expected.w}`);
}

function topFaceAfterQuaternion(quaternion) {
  assert.ok(quaternion);
  const normals = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    F: [0, 0, 1],
    B: [0, 0, -1],
    R: [1, 0, 0],
    L: [-1, 0, 0],
  };
  return Object.entries(normals)
    .map(([face, normal]) => [face, rotateVectorByQuaternion(normal, quaternion)[1]])
    .sort((left, right) => right[1] - left[1])[0][0];
}

function rotateVectorByQuaternion(vector, quaternion) {
  const q = [quaternion.x, quaternion.y, quaternion.z];
  const uv = cross(q, vector);
  const uuv = cross(q, uv);
  return vector.map((value, index) => value + 2 * (quaternion.w * uv[index] + uuv[index]));
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
