import 'dart:math' as math;

typedef CubeVector3 = ({double x, double y, double z});

/// A normalized, right-handed display rotation, independent of cube facelets.
/// Exact component equality intentionally keeps even tiny sensor changes visible.
final class CubeOrientation {
  const CubeOrientation._(this.x, this.y, this.z, this.w);

  static const identity = CubeOrientation._(0, 0, 0, 1);

  factory CubeOrientation({
    required double x,
    required double y,
    required double z,
    required double w,
  }) {
    if (![x, y, z, w].every((component) => component.isFinite)) {
      throw ArgumentError('Orientation components must be finite');
    }
    // Scale first so valid large or very small inputs do not overflow/underflow.
    final scale = math.max(
      math.max(x.abs(), y.abs()),
      math.max(z.abs(), w.abs()),
    );
    if (scale == 0) throw ArgumentError('A zero quaternion has no orientation');
    x /= scale;
    y /= scale;
    z /= scale;
    w /= scale;
    final length = math.sqrt(x * x + y * y + z * z + w * w);
    x /= length;
    y /= length;
    z /= length;
    w /= length;
    // q and -q are the same rotation. Canonicalize without an angular epsilon.
    final first = w != 0
        ? w
        : x != 0
        ? x
        : y != 0
        ? y
        : z;
    if (first < 0) return CubeOrientation._(-x, -y, -z, -w);
    return CubeOrientation._(x, y, z, w);
  }

  /// Same basis conversion as the frozen public/gyro-orientation.js:
  /// GAN (x,y,z,w) becomes display (x,z,-y,w). No sampling threshold is applied.
  factory CubeOrientation.fromGan({
    required double x,
    required double y,
    required double z,
    required double w,
  }) => CubeOrientation(x: x, y: z, z: -y, w: w);

  final double x, y, z, w;

  CubeOrientation get inverse => CubeOrientation(x: -x, y: -y, z: -z, w: w);

  /// Composition applies [right] first, then this rotation.
  CubeOrientation operator *(CubeOrientation right) => CubeOrientation(
    x: w * right.x + x * right.w + y * right.z - z * right.y,
    y: w * right.y - x * right.z + y * right.w + z * right.x,
    z: w * right.z + x * right.y - y * right.x + z * right.w,
    w: w * right.w - x * right.x - y * right.y - z * right.z,
  );

  /// Explicit display recentering: the captured reference becomes identity.
  /// Convert both GAN samples to the display basis before calling this method.
  CubeOrientation relativeTo(CubeOrientation reference) =>
      reference.inverse * this;

  CubeVector3 rotate(CubeVector3 vector) {
    // q * v * q^-1, expanded to avoid temporary quaternion objects per vertex.
    final tx = 2 * (y * vector.z - z * vector.y);
    final ty = 2 * (z * vector.x - x * vector.z);
    final tz = 2 * (x * vector.y - y * vector.x);
    return (
      x: vector.x + w * tx + y * tz - z * ty,
      y: vector.y + w * ty + z * tx - x * tz,
      z: vector.z + w * tz + x * ty - y * tx,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is CubeOrientation &&
      x == other.x &&
      y == other.y &&
      z == other.z &&
      w == other.w;

  @override
  int get hashCode => Object.hash(x, y, z, w);
}
