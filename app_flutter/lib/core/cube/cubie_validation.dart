/// URFDLB coordinates shared by legal-state sampling and packet validation.
const cornerFacelets = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const cornerColors = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const edgeFacelets = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
const edgeColors = [
  'UR',
  'UF',
  'UL',
  'UB',
  'DR',
  'DF',
  'DL',
  'DB',
  'FR',
  'FL',
  'BL',
  'BR',
];

int permutationParity(List<int> p) {
  var result = 0;
  for (var i = 0; i < p.length; i++) {
    for (var j = i + 1; j < p.length; j++) {
      if (p[i] > p[j]) result ^= 1;
    }
  }
  return result;
}

void validateCubies(String facelets) {
  final cp = <int>[], ep = <int>[];
  var twist = 0, flip = 0;
  for (final positions in cornerFacelets) {
    final colors = positions.map((i) => facelets[i]).toList(growable: false);
    final orientation = colors.indexWhere((c) => c == 'U' || c == 'D');
    if (orientation < 0) {
      throw const FormatException('Missing corner U/D sticker');
    }
    final index = cornerColors.indexWhere(
      (c) =>
          c[0] == colors[orientation] &&
          c[1] == colors[(orientation + 1) % 3] &&
          c[2] == colors[(orientation + 2) % 3],
    );
    if (index < 0 || cp.contains(index)) {
      throw const FormatException('Invalid or repeated corner');
    }
    cp.add(index);
    twist += orientation;
  }
  for (final positions in edgeFacelets) {
    final a = facelets[positions[0]], b = facelets[positions[1]];
    var index = edgeColors.indexOf('$a$b');
    if (index < 0) {
      index = edgeColors.indexOf('$b$a');
      flip++;
    }
    if (index < 0 || ep.contains(index)) {
      throw const FormatException('Invalid or repeated edge');
    }
    ep.add(index);
  }
  if (twist % 3 != 0 ||
      flip % 2 != 0 ||
      permutationParity(cp) != permutationParity(ep)) {
    throw const FormatException(
      'Impossible cube orientation or permutation parity',
    );
  }
}
