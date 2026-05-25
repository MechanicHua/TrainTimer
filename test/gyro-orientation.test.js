import test from 'node:test';
import assert from 'node:assert/strict';
import { ganGyroQuaternionToCube3dBasis, ganGyroVelocityToCube3dBasis, normalizeQuaternion } from '../public/gyro-orientation.js';

test('normalizes valid quaternions and rejects invalid values', () => {
  assert.deepEqual(normalizeQuaternion({ x: 0, y: 0, z: 0, w: 2 }), { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(normalizeQuaternion({ x: 0, y: 0, z: 0, w: 0 }), null);
  assert.equal(normalizeQuaternion({ x: 0, y: Number.NaN, z: 0, w: 1 }), null);
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
});

test('maps GAN gyro velocity into the 3D cube coordinate basis', () => {
  assert.deepEqual(ganGyroVelocityToCube3dBasis({ x: 2, y: -3, z: 4 }), { x: 2, y: 4, z: 3 });
  assert.equal(ganGyroVelocityToCube3dBasis({ x: 1, y: Number.NaN, z: 0 }), null);
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
