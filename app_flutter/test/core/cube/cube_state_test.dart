import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/cube/cube_move.dart';
import 'package:traintimer/core/cube/cube_state.dart';
import 'package:traintimer/core/cube/random_state.dart';

void main() {
  test('impossible edge flip, corner twist and parity are rejected', () {
    final flipped = CubeState.solvedFacelets.split('');
    final edge = flipped[5];
    flipped[5] = flipped[10];
    flipped[10] = edge;
    expect(() => CubeState(flipped.join()), throwsFormatException);
    final twisted = CubeState.solvedFacelets.split('');
    final corner = twisted[8];
    twisted[8] = twisted[9];
    twisted[9] = twisted[20];
    twisted[20] = corner;
    expect(() => CubeState(twisted.join()), throwsFormatException);
    final parity = CubeState.solvedFacelets.split('');
    final sticker = parity[10];
    parity[10] = parity[19];
    parity[19] = sticker;
    expect(() => CubeState(parity.join()), throwsFormatException);
  });
  test('every move has inverse and four quarter turns restore the cube', () {
    final solved = CubeState.solved();
    for (final face in CubeFace.values) {
      final move = CubeMove(face, 1);
      expect(solved.apply(move).apply(move.inverse), solved);
      expect(solved.applyAll(List.filled(4, move)), solved);
      expect(solved.apply(CubeMove(face, 2)), solved.apply(move).apply(move));
    }
  });
  test('noncommuting sequences and their inverses agree', () {
    final moves = parseAlgorithm("R U R' U' F2 D L2 B'");
    final state = CubeState.solved().applyAll(moves);
    expect(state.isSolved, false);
    expect(state.applyAll(inverseAlgorithm(moves)).isSolved, true);
    expect(
      CubeState.solved().applyAll(parseAlgorithm('R U')),
      isNot(CubeState.solved().applyAll(parseAlgorithm('U R'))),
    );
  });
  test('local correction merges same face and cancels inverse pairs', () {
    expect(simplifyAlgorithm(parseAlgorithm('R R')).map((m) => m.token), [
      'R2',
    ]);
    expect(simplifyAlgorithm(parseAlgorithm("R U U' R'")), isEmpty);
    expect(() => parseAlgorithm('R nonsense'), throwsFormatException);
  });
  test(
    'random state has fixed centers, balanced colors, deterministic seed',
    () {
      final a = Random(20261018), b = Random(20261018);
      for (var i = 0; i < 100; i++) {
        final state = randomLegalState(a);
        expect(state, randomLegalState(b));
        for (var f = 0; f < 6; f++) {
          expect(state.facelets[f * 9 + 4], 'URFDLB'[f]);
          expect('URFDLB'[f].allMatches(state.facelets).length, 9);
        }
      }
    },
  );
}
