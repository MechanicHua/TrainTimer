import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/cube/cube_state.dart';
import 'package:traintimer/rendering/cube3d/cube_orientation.dart';

void _expectVector(CubeVector3 actual, CubeVector3 expected) {
  expect(actual.x, closeTo(expected.x, 1e-12));
  expect(actual.y, closeTo(expected.y, 1e-12));
  expect(actual.z, closeTo(expected.z, 1e-12));
}

void main() {
  final s = math.sqrt(.5);
  final qx = CubeOrientation(x: s, y: 0, z: 0, w: s);
  final qy = CubeOrientation(x: 0, y: s, z: 0, w: s);
  final qz = CubeOrientation(x: 0, y: 0, z: s, w: s);
  const x = (x: 1.0, y: 0.0, z: 0.0);
  const y = (x: 0.0, y: 1.0, z: 0.0);
  const z = (x: 0.0, y: 0.0, z: 1.0);

  test('right-handed quarter turns rotate each basis vector', () {
    _expectVector(qx.rotate(y), z);
    _expectVector(qy.rotate(z), x);
    _expectVector(qz.rotate(x), y);
    _expectVector(CubeOrientation.identity.rotate(x), x);
  });

  test('normalization and sign canonicalization preserve q/-q equivalence', () {
    final q = CubeOrientation(x: 1, y: 2, z: 3, w: 4);
    final negative = CubeOrientation(x: -10, y: -20, z: -30, w: -40);
    expect(q, negative);
    expect(q.hashCode, negative.hashCode);
    expect(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w, closeTo(1, 1e-15));
    _expectVector(q.rotate(x), negative.rotate(x));
    expect(
      CubeOrientation(x: -1, y: 0, z: 0, w: 0),
      CubeOrientation(x: 1, y: 0, z: 0, w: 0),
    );
    expect(CubeOrientation(x: 1e300, y: 0, z: 0, w: 1e300), qx);
    expect(CubeOrientation(x: 1e-300, y: 0, z: 0, w: 1e-300), qx);
  });

  test('composition order, inverse and explicit reference recentering', () {
    _expectVector((qz * qx).rotate(y), z);
    _expectVector((qx * qz).rotate(y), (x: -1, y: 0, z: 0));
    final reference = qz * qx;
    for (final vector in [x, y, z]) {
      _expectVector(reference.inverse.rotate(reference.rotate(vector)), vector);
      _expectVector(reference.relativeTo(reference).rotate(vector), vector);
      _expectVector(
        (reference * qy).relativeTo(reference).rotate(vector),
        qy.rotate(vector),
      );
    }
  });

  test('GAN axes map exactly to display (x,z,-y,w)', () {
    final ganX = CubeOrientation.fromGan(x: s, y: 0, z: 0, w: s);
    final ganY = CubeOrientation.fromGan(x: 0, y: s, z: 0, w: s);
    final ganZ = CubeOrientation.fromGan(x: 0, y: 0, z: s, w: s);
    expect(ganX, qx);
    expect(ganY, CubeOrientation(x: 0, y: 0, z: -s, w: s));
    expect(ganZ, qy);
    _expectVector(ganY.rotate(x), (x: 0, y: -1, z: 0));
    _expectVector(ganZ.rotate(z), x);
  });

  test(
    'tiny representable changes are retained and invalid samples rejected',
    () {
      final tiny = CubeOrientation(x: 1e-15, y: 0, z: 0, w: 1);
      expect(tiny, isNot(CubeOrientation.identity));
      expect(tiny.rotate(y).z, greaterThan(0));
      expect(
        () => CubeOrientation(x: 0, y: 0, z: 0, w: 0),
        throwsArgumentError,
      );
      expect(
        () => CubeOrientation(x: double.nan, y: 0, z: 0, w: 1),
        throwsArgumentError,
      );
      expect(
        () => CubeOrientation(x: double.infinity, y: 0, z: 0, w: 1),
        throwsArgumentError,
      );
    },
  );

  test('display rotations cannot mutate the immutable logical cube', () {
    final cube = CubeState.solved();
    final facelets = cube.facelets;
    for (var i = 0; i < 100; i++) {
      (qx * qy * qz).rotate((x: i.toDouble(), y: 1, z: -1));
    }
    expect(cube.facelets, facelets);
    expect(cube, CubeState.solved());
  });
}
