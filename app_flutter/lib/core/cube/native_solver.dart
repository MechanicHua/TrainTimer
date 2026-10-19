import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';
import 'package:ffi/ffi.dart';
import 'cube_move.dart';
import 'cube_state.dart';

typedef _NativeSolve =
    Int32 Function(
      Pointer<Utf8>,
      Size,
      Pointer<Utf8>,
      Size,
      Int32,
      Pointer<Utf8>,
      Size,
      Pointer<Int32>,
      Pointer<Double>,
    );
typedef _DartSolve =
    int Function(
      Pointer<Utf8>,
      int,
      Pointer<Utf8>,
      int,
      int,
      Pointer<Utf8>,
      int,
      Pointer<Int32>,
      Pointer<Double>,
    );

final class SolverResult {
  const SolverResult(this.moves, this.nativeMilliseconds);
  final List<CubeMove> moves;
  final double nativeMilliseconds;
}

/// A single active request; callers explicitly wait or invalidate. Stale work
/// is never published. The native boundary also serializes table access.
final class NativeSolver {
  NativeSolver({this.libraryPath});
  final String? libraryPath;
  bool _busy = false;
  int _revision = 0;

  Future<SolverResult> solve(CubeState current, CubeState target) async {
    if (_busy) throw StateError('Solver already running; queue at the caller');
    _busy = true;
    final revision = ++_revision;
    final path = libraryPath;
    try {
      final result = await Isolate.run(
        () => _solve(path, current.facelets, target.facelets),
      );
      if (revision != _revision) throw StateError('Superseded solver request');
      if (current.applyAll(result.moves) != target) {
        throw StateError('Independent Dart verification failed');
      }
      return result;
    } finally {
      _busy = false;
    }
  }

  void invalidate() {
    _revision++;
  }

  static SolverResult _solve(String? path, String current, String target) {
    final library = path != null
        ? DynamicLibrary.open(path)
        : Platform.isWindows
        ? DynamicLibrary.open('traintimer_min2phase.dll')
        : DynamicLibrary.open(
            'traintimer_min2phase.framework/traintimer_min2phase',
          );
    final solve = library.lookupFunction<_NativeSolve, _DartSolve>(
      'tt_m2p_solve',
    );
    return using((arena) {
      final c = current.toNativeUtf8(allocator: arena);
      final t = target.toNativeUtf8(allocator: arena);
      final output = arena<Uint8>(128).cast<Utf8>();
      final steps = arena<Int32>(), elapsed = arena<Double>();
      final status = solve(
        c,
        current.length,
        t,
        target.length,
        100000000,
        output,
        128,
        steps,
        elapsed,
      );
      if (status != 0) {
        throw StateError('min2phase failed ($status); resynchronize or retry');
      }
      final moves = parseAlgorithm(output.toDartString());
      if (moves.length > 20 || steps.value != moves.length) {
        throw StateError('Invalid solver length');
      }
      return SolverResult(moves, elapsed.value);
    });
  }
}
