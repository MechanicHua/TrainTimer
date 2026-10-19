enum TimerMode { keyboard, bluetooth }

enum TimerPhase {
  preparingScramble,
  awaitingStart,
  inspecting,
  holding,
  running,
  saving,
  completed,
  interrupted,
}

enum SolvePenalty { none, plusTwo, dnf }

enum EvidenceIssue { disconnected, missingMoves, systemSleep, clockFallback }

enum MoveOrigin { live, history }

enum InspectionReminder { none, eightSeconds, twelveSeconds }

/// Sequence is unwrapped by the protocol adapter, and never wraps here.
/// [at] uses the same monotonic origin as the controller's clock. Until a
/// device's time calibration has been validated, use host receive time.
final class BluetoothTurn {
  const BluetoothTurn({
    required this.sequence,
    required this.notation,
    required this.at,
    required this.reachedTarget,
    required this.isSolved,
    this.origin = MoveOrigin.live,
    this.hasGap = false,
  });

  final int sequence;
  final String notation;
  final Duration at;
  final bool reachedTarget;
  final bool isSolved;
  final MoveOrigin origin;
  final bool hasGap;
}

final class RecordedTurn {
  const RecordedTurn({
    required this.sequence,
    required this.notation,
    required this.offset,
    required this.origin,
  });

  final int sequence;
  final String notation;
  final Duration offset;
  final MoveOrigin origin;
}

/// Raw elapsed time and penalty stay separate, including a DNF interruption.
final class CompletedAttempt {
  CompletedAttempt({
    required this.mode,
    required this.elapsed,
    required this.inspection,
    required this.penalty,
    required Iterable<RecordedTurn> turns,
    required Iterable<EvidenceIssue> issues,
    this.requiresInterruptionDecision = false,
  }) : turns = List.unmodifiable(turns),
       issues = Set.unmodifiable(issues);

  final TimerMode mode;
  final Duration elapsed;
  final Duration inspection;
  final SolvePenalty penalty;
  final List<RecordedTurn> turns;
  final Set<EvidenceIssue> issues;
  final bool requiresInterruptionDecision;

  bool get hasCompleteMoveEvidence =>
      mode == TimerMode.bluetooth &&
      issues.every((issue) => issue == EvidenceIssue.clockFallback);

  Duration? get effectiveTime =>
      requiresInterruptionDecision || penalty == SolvePenalty.dnf
      ? null
      : elapsed +
            (penalty == SolvePenalty.plusTwo
                ? const Duration(seconds: 2)
                : Duration.zero);

  CompletedAttempt resolveInterruptionAsDnf() => CompletedAttempt(
    mode: mode,
    elapsed: elapsed,
    inspection: inspection,
    penalty: SolvePenalty.dnf,
    turns: turns,
    issues: issues,
  );
}

/// A small presentation snapshot; sampling it does not copy the move history.
final class TimerSnapshot {
  const TimerSnapshot({
    required this.phase,
    required this.elapsed,
    required this.inspection,
    required this.penalty,
    required this.holdReady,
    required this.shouldKeepAwake,
    required this.moveCount,
    required this.hasIncompleteEvidence,
    required this.completedAttempt,
    required this.saveError,
  });

  final TimerPhase phase;
  final Duration elapsed;
  final Duration inspection;
  final SolvePenalty penalty;
  final bool holdReady;
  final bool shouldKeepAwake;
  final int moveCount;
  final bool hasIncompleteEvidence;
  final CompletedAttempt? completedAttempt;
  final String? saveError;

  InspectionReminder get inspectionReminder {
    if (phase != TimerPhase.inspecting && phase != TimerPhase.holding) {
      return InspectionReminder.none;
    }
    if (inspection >= const Duration(seconds: 12)) {
      return InspectionReminder.twelveSeconds;
    }
    if (inspection >= const Duration(seconds: 8)) {
      return InspectionReminder.eightSeconds;
    }
    return InspectionReminder.none;
  }
}
