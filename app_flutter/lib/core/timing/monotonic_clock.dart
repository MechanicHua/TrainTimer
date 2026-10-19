/// Time since an arbitrary origin. Wall-clock dates never decide solve duration.
abstract interface class MonotonicClock {
  Duration get now;
}

final class StopwatchClock implements MonotonicClock {
  StopwatchClock() : _stopwatch = Stopwatch()..start();

  final Stopwatch _stopwatch;

  @override
  Duration get now => _stopwatch.elapsed;
}
