import 'dart:io';
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/cube/cube_move.dart';
import 'package:traintimer/core/cube/cube_state.dart';
import 'package:traintimer/core/cube/native_solver.dart';
import 'package:traintimer/core/cube/random_state.dart';

void main() {
  test(
    'Dart FFI solves random legal current/target pairs with independent replay',
    () async {
      final library =
          Platform.environment['TRAIN_TIMER_SOLVER'] ??
          '${Directory.current.path}/native/min2phase/build/libtraintimer_min2phase.dylib';
      expect(
        File(library).existsSync(),
        isTrue,
        reason: 'Build the native regression library first',
      );
      final solver = NativeSolver(libraryPath: library);
      final random = Random(20261019);
      for (var i = 0; i < 50; i++) {
        final current = randomLegalState(random),
            target = randomLegalState(random);
        final result = await solver.solve(current, target);
        expect(result.moves.length, lessThanOrEqualTo(20));
        expect(current.applyAll(result.moves), target);
      }
      final target = CubeState.solved().applyAll(parseAlgorithm("R U2 F' L D"));
      final result = await solver.solve(target, CubeState.solved());
      expect(
        CubeState.solved().applyAll(inverseAlgorithm(result.moves)),
        target,
      );
    },
  );
}
