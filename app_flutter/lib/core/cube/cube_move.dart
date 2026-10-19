enum CubeFace { u, r, f, d, l, b }

final class CubeMove {
  const CubeMove(this.face, this.turns) : assert(turns >= 1 && turns <= 3);

  factory CubeMove.parse(String token) {
    final match = RegExp(r"^([URFDLB])(2|')?$").firstMatch(token);
    if (match == null) throw FormatException('Invalid outer-layer move', token);
    return CubeMove(
      CubeFace.values['URFDLB'.indexOf(match[1]!)],
      match[2] == '2'
          ? 2
          : match[2] == "'"
          ? 3
          : 1,
    );
  }

  final CubeFace face;
  final int turns;
  CubeMove get inverse => CubeMove(face, 4 - turns);
  String get token =>
      '${face.name.toUpperCase()}${turns == 2
          ? '2'
          : turns == 3
          ? "'"
          : ''}';
  @override
  String toString() => token;
  @override
  bool operator ==(Object other) =>
      other is CubeMove && other.face == face && other.turns == turns;
  @override
  int get hashCode => Object.hash(face, turns);
}

List<CubeMove> parseAlgorithm(String text) => text.trim().isEmpty
    ? const []
    : text
          .trim()
          .split(RegExp(r'\s+'))
          .map(CubeMove.parse)
          .toList(growable: false);

List<CubeMove> inverseAlgorithm(Iterable<CubeMove> moves) =>
    moves.toList().reversed.map((move) => move.inverse).toList(growable: false);

/// Local reduction only; intentionally does not search for a shorter solution.
List<CubeMove> simplifyAlgorithm(Iterable<CubeMove> moves) {
  final result = <CubeMove>[];
  for (final move in moves) {
    if (result.isNotEmpty && result.last.face == move.face) {
      final turns = (result.removeLast().turns + move.turns) % 4;
      if (turns != 0) result.add(CubeMove(move.face, turns));
    } else {
      result.add(move);
    }
  }
  return result;
}
