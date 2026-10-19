import 'dart:async';

abstract interface class ScheduledRetry {
  void cancel();
}

abstract interface class RetryScheduler {
  ScheduledRetry schedule(Duration delay, void Function() callback);
}

final class TimerRetryScheduler implements RetryScheduler {
  const TimerRetryScheduler();

  @override
  ScheduledRetry schedule(Duration delay, void Function() callback) =>
      _TimerRetry(Timer(delay, callback));
}

final class _TimerRetry implements ScheduledRetry {
  _TimerRetry(this.timer);
  final Timer timer;

  @override
  void cancel() => timer.cancel();
}

enum ReconnectState {
  idle,
  waiting,
  connecting,
  connected,
  exhausted,
  cancelled,
}

final class ReconnectCancellation {
  final Completer<void> _cancelled = Completer<void>();

  bool get isCancelled => _cancelled.isCompleted;
  Future<void> get whenCancelled => _cancelled.future;

  void _cancel() {
    if (!_cancelled.isCompleted) _cancelled.complete();
  }
}

/// Finite, centrally configured retries, independent of timing and rendering.
/// [connect] must honour cancellation, including disconnecting a native
/// connection that completes after cancellation. Generation checks here also
/// prevent late completion from overwriting a newer connection's state.
final class ReconnectController {
  ReconnectController({
    required this.connect,
    this.scheduler = const TimerRetryScheduler(),
    List<Duration> delays = const [
      Duration(seconds: 1),
      Duration(seconds: 2),
      Duration(seconds: 4),
      Duration(seconds: 8),
      Duration(seconds: 16),
    ],
  }) : delays = List.unmodifiable(delays) {
    if (delays.isEmpty || delays.any((delay) => delay.isNegative)) {
      throw ArgumentError.value(delays, 'delays');
    }
  }

  final Future<void> Function(ReconnectCancellation cancellation) connect;
  final RetryScheduler scheduler;
  final List<Duration> delays;
  ReconnectState _state = ReconnectState.idle;
  ReconnectState get state => _state;
  int get attempts => _attempts;
  Object? get lastError => _lastError;
  int _attempts = 0;
  int _generation = 0;
  Object? _lastError;
  ScheduledRetry? _scheduled;
  ReconnectCancellation? _activeCancellation;

  /// Called only on unexpected loss while connection intent is still enabled.
  /// Duplicate native disconnect callbacks must not reset the retry budget.
  void unexpectedDisconnect() {
    if (_state == ReconnectState.waiting ||
        _state == ReconnectState.connecting ||
        _state == ReconnectState.exhausted ||
        _state == ReconnectState.cancelled) {
      return;
    }
    _begin();
  }

  /// User-initiated retry creates a fresh finite budget after exhaustion/cancel.
  void retryManually() {
    _invalidate();
    _begin();
  }

  /// Active disconnect calls this before the transport disconnect, so its
  /// disconnect notification cannot immediately reconnect the device.
  void cancel() {
    _invalidate();
    _state = ReconnectState.cancelled;
  }

  void dispose() => cancel();

  void _begin() {
    _attempts = 0;
    _lastError = null;
    _schedule(_generation);
  }

  void _schedule(int generation) {
    if (_attempts == delays.length) {
      _state = ReconnectState.exhausted;
      return;
    }
    _state = ReconnectState.waiting;
    _scheduled = scheduler.schedule(
      delays[_attempts],
      () => unawaited(_attempt(generation)),
    );
  }

  Future<void> _attempt(int generation) async {
    if (generation != _generation) return;
    _scheduled = null;
    _attempts++;
    _state = ReconnectState.connecting;
    final cancellation = ReconnectCancellation();
    _activeCancellation = cancellation;
    try {
      await connect(cancellation);
      if (generation == _generation && !cancellation.isCancelled) {
        _state = ReconnectState.connected;
        _lastError = null;
      }
    } catch (error) {
      if (generation == _generation && !cancellation.isCancelled) {
        _lastError = error;
        _schedule(generation);
      }
    } finally {
      if (identical(_activeCancellation, cancellation)) {
        _activeCancellation = null;
      }
    }
  }

  void _invalidate() {
    _generation++;
    _scheduled?.cancel();
    _scheduled = null;
    _activeCancellation?._cancel();
    _activeCancellation = null;
  }
}
