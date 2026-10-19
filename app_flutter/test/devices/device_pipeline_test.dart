import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/devices/devices.dart';

final class FakeRetry implements ScheduledRetry {
  FakeRetry(this.callback);
  final void Function() callback;
  bool cancelled = false;
  @override
  void cancel() => cancelled = true;
  void fire() {
    if (!cancelled) callback();
  }
}

final class FakeScheduler implements RetryScheduler {
  final List<Duration> delays = [];
  final List<FakeRetry> retries = [];
  @override
  ScheduledRetry schedule(Duration delay, void Function() callback) {
    delays.add(delay);
    final retry = FakeRetry(callback);
    retries.add(retry);
    return retry;
  }
}

void main() {
  test(
    'sequence wraps, drops duplicates and identifies late/history moves',
    () {
      final tracker = MoveSequenceTracker();
      expect(tracker.accept(254, origin: EventOrigin.live).sequence, 254);
      expect(tracker.accept(255, origin: EventOrigin.live).missingMoves, 0);
      expect(tracker.accept(0, origin: EventOrigin.live).sequence, 256);
      final duplicate = tracker.accept(0, origin: EventOrigin.live);
      expect(duplicate.duplicate, isTrue);
      expect(duplicate.canTriggerTimer, isFalse);
      final history = tracker.accept(253, origin: EventOrigin.history);
      expect(history.sequence, 253);
      expect(history.canTriggerTimer, isFalse);
      expect(tracker.accept(3, origin: EventOrigin.live).missingMoves, 2);
      final late = tracker.accept(2, origin: EventOrigin.live);
      expect(late.origin, EventOrigin.history);
      expect(late.canTriggerTimer, isFalse);
    },
  );

  test('ambiguous half-range counter jump requires resynchronization', () {
    final tracker = MoveSequenceTracker();
    tracker.accept(0, origin: EventOrigin.live);
    expect(
      () => tracker.accept(128, origin: EventOrigin.live),
      throwsA(isA<SequenceAmbiguity>()),
    );
  });

  test(
    'raw packet copied; diagnostics disabled and bounded in every dimension',
    () {
      final bytes = Uint8List.fromList([1, 2, 3]);
      final packet = RawNotification(
        characteristic: 'test',
        receivedAt: Duration.zero,
        bytes: bytes,
      );
      bytes[0] = 99;
      expect(packet.bytes.first, 1);
      expect(() => packet.bytes[0] = 2, throwsUnsupportedError);
      final buffer = DiagnosticBuffer(capacity: 2);
      DiagnosticEntry entry(int n) => DiagnosticEntry(
        at: Duration(seconds: n),
        message: 'x' * 1000,
        bytes: Uint8List(1000),
      );
      buffer.add(entry(1));
      expect(buffer.length, 0);
      buffer.enabled = true;
      for (var i = 1; i <= 3; i++) {
        buffer.add(entry(i));
      }
      expect(buffer.length, 2);
      expect(buffer.entries.first.at, const Duration(seconds: 2));
      expect(buffer.entries.first.message.length, 512);
      expect(buffer.entries.first.packetPrefix!.length, 64);
    },
  );

  test(
    'retries use finite increasing delays; duplicate loss cannot reset budget',
    () async {
      final scheduler = FakeScheduler();
      final controller = ReconnectController(
        scheduler: scheduler,
        delays: const [Duration(seconds: 1), Duration(seconds: 3)],
        connect: (_) async => throw StateError('unavailable'),
      );
      controller.unexpectedDisconnect();
      controller.unexpectedDisconnect();
      expect(scheduler.retries.length, 1);
      scheduler.retries.last.fire();
      await pumpEventQueue();
      expect(controller.state, ReconnectState.waiting);
      expect(scheduler.delays, [
        const Duration(seconds: 1),
        const Duration(seconds: 3),
      ]);
      scheduler.retries.last.fire();
      await pumpEventQueue();
      expect(controller.state, ReconnectState.exhausted);
      expect(controller.attempts, 2);
      controller.unexpectedDisconnect();
      expect(scheduler.retries.length, 2);
      controller.retryManually();
      expect(controller.attempts, 0);
      expect(controller.state, ReconnectState.waiting);
      controller.dispose();
    },
  );

  test(
    'manual disconnect cancels timer and invalidates in-flight completion',
    () async {
      final scheduler = FakeScheduler();
      final completion = Completer<void>();
      ReconnectCancellation? token;
      final controller = ReconnectController(
        scheduler: scheduler,
        connect: (cancellation) {
          token = cancellation;
          return completion.future;
        },
      );
      controller.unexpectedDisconnect();
      scheduler.retries.last.fire();
      expect(controller.state, ReconnectState.connecting);
      controller.cancel();
      expect(token!.isCancelled, isTrue);
      completion.complete();
      await pumpEventQueue();
      expect(controller.state, ReconnectState.cancelled);
      controller.unexpectedDisconnect();
      expect(scheduler.retries.length, 1);
      controller.retryManually();
      final scheduled = scheduler.retries.last;
      controller.cancel();
      scheduled.fire();
      expect(controller.state, ReconnectState.cancelled);
    },
  );
}
