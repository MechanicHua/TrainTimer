import 'dart:math';
import 'cube_state.dart';
import 'cubie_validation.dart';

/// Uniform legal cubie sampler, not a random-move scramble. TNoodle generator
/// compatibility and its rejection rules remain a separate acceptance gate.
CubeState randomLegalState(Random random) {
  final cp = List<int>.generate(8, (i) => i)..shuffle(random);
  final ep = List<int>.generate(12, (i) => i)..shuffle(random);
  if (permutationParity(cp) != permutationParity(ep)) {
    final tmp = ep[0];
    ep[0] = ep[1];
    ep[1] = tmp;
  }
  final co = List<int>.generate(7, (_) => random.nextInt(3));
  co.add((3 - co.fold(0, (a, b) => a + b) % 3) % 3);
  final eo = List<int>.generate(11, (_) => random.nextInt(2));
  eo.add(eo.fold(0, (a, b) => a ^ b));
  final chars = CubeState.solvedFacelets.split('');
  for (var i = 0; i < 8; i++) {
    for (var n = 0; n < 3; n++) {
      chars[cornerFacelets[i][(n + co[i]) % 3]] = cornerColors[cp[i]][n];
    }
  }
  for (var i = 0; i < 12; i++) {
    for (var n = 0; n < 2; n++) {
      chars[edgeFacelets[i][(n + eo[i]) % 2]] = edgeColors[ep[i]][n];
    }
  }
  return CubeState(chars.join());
}
