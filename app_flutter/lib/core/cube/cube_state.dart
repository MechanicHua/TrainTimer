import 'cube_move.dart';
import 'cubie_validation.dart';

typedef Int3 = ({int x, int y, int z});

/// Fixed URFDLB facelets. Geometry and presentation never own the logical state.
final class CubeState {
  CubeState(String facelets) : facelets = _check(facelets);
  CubeState._known(this.facelets);
  static const solvedFacelets =
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  factory CubeState.solved() => CubeState(solvedFacelets);
  final String facelets;
  bool get isSolved => facelets == solvedFacelets;

  CubeState apply(CubeMove move) {
    var chars = facelets.split('');
    final permutation = _permutations[move.face.index];
    for (var turn = 0; turn < move.turns; turn++) {
      final next = List<String>.filled(54, '');
      for (var i = 0; i < 54; i++) {
        next[permutation[i]] = chars[i];
      }
      chars = next;
    }
    return CubeState._known(chars.join());
  }

  CubeState applyAll(Iterable<CubeMove> moves) =>
      moves.fold(this, (state, move) => state.apply(move));
  @override
  bool operator ==(Object other) =>
      other is CubeState && other.facelets == facelets;
  @override
  int get hashCode => facelets.hashCode;

  static String _check(String value) {
    if (value.length != 54 ||
        value.split('').any((c) => !'URFDLB'.contains(c))) {
      throw const FormatException('Expected 54 URFDLB facelets');
    }
    for (var face = 0; face < 6; face++) {
      final color = 'URFDLB'[face];
      if (value[face * 9 + 4] != color || color.allMatches(value).length != 9) {
        throw const FormatException('Invalid centers or color counts');
      }
    }
    validateCubies(value);
    return value;
  }
}

final class StickerGeometry {
  const StickerGeometry(this.position, this.normal, this.right, this.up);
  final Int3 position, normal, right, up;
}

final stickerGeometry = List<StickerGeometry>.unmodifiable([
  for (var f = 0; f < 6; f++)
    for (var row = 0; row < 3; row++)
      for (var col = 0; col < 3; col++) _sticker(f, row, col),
]);

StickerGeometry _sticker(int face, int row, int col) {
  final a = col - 1, b = 1 - row;
  return switch (face) {
    0 => StickerGeometry(
      (x: a, y: 1, z: -b),
      (x: 0, y: 1, z: 0),
      (x: 1, y: 0, z: 0),
      (x: 0, y: 0, z: -1),
    ),
    1 => StickerGeometry(
      (x: 1, y: b, z: -a),
      (x: 1, y: 0, z: 0),
      (x: 0, y: 0, z: -1),
      (x: 0, y: 1, z: 0),
    ),
    2 => StickerGeometry(
      (x: a, y: b, z: 1),
      (x: 0, y: 0, z: 1),
      (x: 1, y: 0, z: 0),
      (x: 0, y: 1, z: 0),
    ),
    3 => StickerGeometry(
      (x: a, y: -1, z: b),
      (x: 0, y: -1, z: 0),
      (x: 1, y: 0, z: 0),
      (x: 0, y: 0, z: 1),
    ),
    4 => StickerGeometry(
      (x: -1, y: b, z: a),
      (x: -1, y: 0, z: 0),
      (x: 0, y: 0, z: 1),
      (x: 0, y: 1, z: 0),
    ),
    _ => StickerGeometry(
      (x: -a, y: b, z: -1),
      (x: 0, y: 0, z: -1),
      (x: -1, y: 0, z: 0),
      (x: 0, y: 1, z: 0),
    ),
  };
}

Int3 rotateQuarter(Int3 v, int axis, int sign) {
  final rotated = switch (axis) {
    0 => (x: v.x, y: -v.z, z: v.y),
    1 => (x: v.z, y: v.y, z: -v.x),
    _ => (x: -v.y, y: v.x, z: v.z),
  };
  if (sign > 0) return rotated;
  return rotateQuarter(rotateQuarter(rotated, axis, 1), axis, 1);
}

({int axis, int layer, int sign}) moveGeometry(CubeFace face) => switch (face) {
  CubeFace.u => (axis: 1, layer: 1, sign: -1),
  CubeFace.r => (axis: 0, layer: 1, sign: -1),
  CubeFace.f => (axis: 2, layer: 1, sign: -1),
  CubeFace.d => (axis: 1, layer: -1, sign: 1),
  CubeFace.l => (axis: 0, layer: -1, sign: 1),
  CubeFace.b => (axis: 2, layer: -1, sign: 1),
};
int component(Int3 v, int axis) => axis == 0
    ? v.x
    : axis == 1
    ? v.y
    : v.z;

final _permutations = [for (final face in CubeFace.values) _permutation(face)];
List<int> _permutation(CubeFace face) {
  final def = moveGeometry(face);
  return [
    for (final sticker in stickerGeometry)
      if (component(sticker.position, def.axis) == def.layer)
        stickerGeometry.indexWhere(
          (other) =>
              other.position ==
                  rotateQuarter(sticker.position, def.axis, def.sign) &&
              other.normal == rotateQuarter(sticker.normal, def.axis, def.sign),
        )
      else
        stickerGeometry.indexOf(sticker),
  ];
}
