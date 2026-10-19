import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/timing/timing.dart';

final class FakeClock implements MonotonicClock {
  @override
  Duration now = Duration.zero;
  void advance(Duration duration) => now += duration;
}

BluetoothTurn turn(
  int sequence,
  Duration at, {
  bool target = false,
  bool solved = false,
  MoveOrigin origin = MoveOrigin.live,
  bool gap = false,
}) => BluetoothTurn(
  sequence: sequence,
  notation: 'R',
  at: at,
  reachedTarget: target,
  isSolved: solved,
  origin: origin,
  hasGap: gap,
);

void main() {
  test('499999 microseconds cancels; exactly 500000 starts on release', () {
    final clock = FakeClock();
    final timer = TimerController(clock: clock);
    timer.pressStart();
    clock.advance(const Duration(microseconds: 499999));
    expect(timer.snapshot.holdReady, isFalse);
    timer.releaseStart();
    expect(timer.phase, TimerPhase.awaitingStart);
    timer.pressStart();
    clock.advance(const Duration(milliseconds: 500));
    expect(timer.snapshot.holdReady, isTrue);
    timer.releaseStart();
    expect(timer.phase, TimerPhase.running);
    expect(timer.snapshot.elapsed, Duration.zero);
  });

  test('input classification and repeated key down do not stop or restart', () {
    final clock = FakeClock();
    final timer = TimerController(clock: clock);
    timer.pressStart(inputAllowed: false);
    expect(timer.phase, TimerPhase.awaitingStart);
    timer.pressStart();
    clock.advance(const Duration(milliseconds: 300));
    timer.pressStart(isRepeat: true);
    clock.advance(const Duration(milliseconds: 200));
    timer.releaseStart();
    timer.pressOrdinaryKey(inputAllowed: false);
    timer.pressOrdinaryKey(isRepeat: true);
    timer.pressStart(isRepeat: true);
    expect(timer.phase, TimerPhase.running);
    clock.advance(const Duration(microseconds: 1234567));
    timer.pressOrdinaryKey();
    expect(
      timer.pendingAttempt!.elapsed,
      const Duration(microseconds: 1234567),
    );
  });

  for (final sample in [
    (14999999, SolvePenalty.none),
    (15000000, SolvePenalty.plusTwo),
    (16999999, SolvePenalty.plusTwo),
    (17000000, SolvePenalty.dnf),
  ]) {
    test('inspection penalty uses exact ${sample.$1}us start time', () {
      final clock = FakeClock();
      final timer = TimerController(clock: clock, inspectionEnabled: true);
      timer.pressStart();
      timer.releaseStart();
      expect(timer.phase, TimerPhase.inspecting);
      clock.advance(Duration(microseconds: sample.$1 - 500000));
      timer.pressStart();
      clock.advance(const Duration(milliseconds: 500));
      timer.releaseStart();
      clock.advance(const Duration(seconds: 7));
      timer.pressOrdinaryKey();
      final attempt = timer.pendingAttempt!;
      expect(attempt.inspection, Duration(microseconds: sample.$1));
      expect(attempt.elapsed, const Duration(seconds: 7));
      expect(attempt.penalty, sample.$2);
      expect(
        attempt.effectiveTime,
        sample.$2 == SolvePenalty.dnf
            ? null
            : Duration(seconds: sample.$2 == SolvePenalty.plusTwo ? 9 : 7),
      );
    });
  }

  test('short inspection hold preserves original inspection start', () {
    final clock = FakeClock();
    final timer = TimerController(clock: clock, inspectionEnabled: true);
    timer.pressStart();
    clock.advance(const Duration(seconds: 14));
    timer.pressStart();
    clock.advance(const Duration(milliseconds: 499));
    timer.releaseStart();
    expect(timer.phase, TimerPhase.inspecting);
    expect(timer.snapshot.inspection, const Duration(milliseconds: 14499));
    timer.escape();
    expect(timer.phase, TimerPhase.awaitingStart);
    expect(timer.pendingAttempt, isNull);
    expect(timer.snapshot.shouldKeepAwake, isFalse);
  });

  test('Esc saves DNF; save failure retains evidence until acknowledged', () {
    final clock = FakeClock();
    final timer = TimerController(clock: clock);
    timer.pressStart();
    clock.advance(const Duration(milliseconds: 500));
    timer.releaseStart();
    clock.advance(const Duration(seconds: 4));
    timer.escape();
    expect(timer.phase, TimerPhase.saving);
    expect(timer.pendingAttempt!.penalty, SolvePenalty.dnf);
    final evidence = timer.pendingAttempt;
    timer.saveFailed('disk full');
    expect(timer.prepareNext(), isFalse);
    expect(identical(timer.pendingAttempt, evidence), isTrue);
    expect(timer.snapshot.saveError, 'disk full');
    timer.saveSucceeded();
    expect(timer.prepareNext(), isTrue);
    expect(timer.snapshot.saveError, isNull);
  });

  test(
    'same packet target then next move starts immediately and is recorded',
    () {
      final clock = FakeClock()..now = const Duration(seconds: 10);
      final timer = TimerController(clock: clock, mode: TimerMode.bluetooth);
      timer.acceptTurn(turn(10, clock.now, target: true));
      expect(timer.phase, TimerPhase.awaitingStart);
      timer.acceptTurn(turn(11, clock.now));
      expect(timer.phase, TimerPhase.running);
      expect(timer.snapshot.moveCount, 1);
      clock.advance(const Duration(milliseconds: 25));
      timer.acceptTurn(turn(12, clock.now, solved: true));
      expect(timer.pendingAttempt!.elapsed, const Duration(milliseconds: 25));
      expect(timer.pendingAttempt!.turns.map((turn) => turn.sequence), [
        11,
        12,
      ]);
      expect(timer.pendingAttempt!.turns.first.offset, Duration.zero);
    },
  );

  test('duplicates, history, full-state confirmation do not start or stop', () {
    final clock = FakeClock();
    final timer = TimerController(clock: clock, mode: TimerMode.bluetooth);
    timer.acceptTurn(turn(40, clock.now, target: true));
    timer.acceptTurn(turn(40, clock.now));
    timer.acceptTurn(turn(41, clock.now, origin: MoveOrigin.history));
    expect(timer.phase, TimerPhase.awaitingStart);
    timer.targetStateConfirmed();
    expect(timer.phase, TimerPhase.awaitingStart);
    timer.acceptTurn(turn(42, clock.now));
    timer.targetStateConfirmed();
    expect(timer.phase, TimerPhase.running);
    expect(timer.snapshot.moveCount, 1);
  });

  test(
    'disconnect and missing steps continue timing with incomplete evidence',
    () {
      final clock = FakeClock();
      final timer = TimerController(clock: clock, mode: TimerMode.bluetooth);
      timer.targetStateConfirmed();
      timer.acceptTurn(turn(1, clock.now));
      timer.connectionLost();
      clock.advance(const Duration(seconds: 10));
      expect(timer.phase, TimerPhase.running);
      timer.acceptTurn(turn(3, clock.now, gap: true));
      timer.pressOrdinaryKey();
      final attempt = timer.pendingAttempt!;
      expect(attempt.elapsed, const Duration(seconds: 10));
      expect(attempt.hasCompleteMoveEvidence, isFalse);
      expect(
        attempt.issues,
        containsAll([EvidenceIssue.disconnected, EvidenceIssue.missingMoves]),
      );
    },
  );

  test(
    'sleep records interruption and awaits explicit DNF/discard decision',
    () {
      for (final keep in [false, true]) {
        final clock = FakeClock();
        final timer = TimerController(clock: clock);
        timer.pressStart();
        clock.advance(const Duration(milliseconds: 500));
        timer.releaseStart();
        clock.advance(const Duration(seconds: 2));
        timer.systemSleep();
        expect(timer.phase, TimerPhase.interrupted);
        expect(timer.pendingAttempt!.requiresInterruptionDecision, isTrue);
        expect(timer.pendingAttempt!.effectiveTime, isNull);
        expect(timer.snapshot.shouldKeepAwake, isFalse);
        expect(timer.prepareNext(), isFalse);
        clock.advance(const Duration(hours: 8));
        expect(timer.pendingAttempt!.elapsed, const Duration(seconds: 2));
        timer.resolveInterruption(keepAsDnf: keep);
        if (keep) {
          expect(timer.phase, TimerPhase.saving);
          expect(timer.pendingAttempt!.penalty, SolvePenalty.dnf);
          expect(timer.pendingAttempt!.requiresInterruptionDecision, isFalse);
        } else {
          expect(timer.phase, TimerPhase.completed);
          expect(timer.pendingAttempt, isNull);
        }
      }
    },
  );

  test(
    'inspection interrupted by sleep is retained with zero solve duration',
    () {
      final clock = FakeClock();
      final timer = TimerController(clock: clock, inspectionEnabled: true);
      timer.pressStart();
      clock.advance(const Duration(seconds: 12));
      timer.systemSleep();
      expect(timer.pendingAttempt!.elapsed, Duration.zero);
      expect(timer.pendingAttempt!.inspection, const Duration(seconds: 12));
      expect(timer.phase, TimerPhase.interrupted);
    },
  );

  test('next-attempt gesture observes immediately, expires, and resets', () {
    final gesture = NextAttemptGesture();
    expect(
      gesture.observe(
        notation: 'R',
        at: Duration.zero,
        wasSolved: true,
        isSolved: false,
      ),
      isFalse,
    );
    expect(
      gesture.observe(
        notation: "R'",
        at: const Duration(milliseconds: 600),
        wasSolved: false,
        isSolved: true,
      ),
      isTrue,
    );
    gesture.observe(
      notation: 'R',
      at: const Duration(seconds: 1),
      wasSolved: true,
      isSolved: false,
    );
    expect(
      gesture.observe(
        notation: "R'",
        at: const Duration(milliseconds: 1601),
        wasSolved: false,
        isSolved: true,
      ),
      isFalse,
    );
    gesture.observe(
      notation: 'U',
      at: const Duration(seconds: 2),
      wasSolved: true,
      isSolved: false,
    );
    gesture.observe(
      notation: 'F',
      at: const Duration(milliseconds: 2100),
      wasSolved: false,
      isSolved: false,
    );
    expect(
      gesture.observe(
        notation: "U'",
        at: const Duration(milliseconds: 2200),
        wasSolved: false,
        isSolved: true,
      ),
      isFalse,
    );
  });
}
