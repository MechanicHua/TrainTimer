import 'monotonic_clock.dart';
import 'timer_models.dart';

/// Pure synchronous state machine. The owner samples [snapshot] for display and
/// persists [pendingAttempt]; neither frame cadence nor database latency is a
/// clock. Platform input adapters must classify text/shortcuts before calling.
final class TimerController {
  TimerController({
    required this.clock,
    this.mode = TimerMode.keyboard,
    this.inspectionEnabled = false,
    this.holdDuration = const Duration(milliseconds: 500),
  }) : _phase = mode == TimerMode.bluetooth
           ? TimerPhase.preparingScramble
           : TimerPhase.awaitingStart {
    if (holdDuration.isNegative) {
      throw ArgumentError.value(holdDuration, 'holdDuration');
    }
  }

  final MonotonicClock clock;
  final TimerMode mode;
  final bool inspectionEnabled;
  final Duration holdDuration;

  TimerPhase _phase;
  TimerPhase? _holdOrigin;
  Duration? _heldAt;
  Duration? _inspectionStartedAt;
  Duration? _startedAt;
  Duration _finishedElapsed = Duration.zero;
  Duration _finishedInspection = Duration.zero;
  SolvePenalty _penalty = SolvePenalty.none;
  int? _lastSequence;
  final List<RecordedTurn> _turns = [];
  final Set<EvidenceIssue> _issues = {};
  CompletedAttempt? _pendingAttempt;
  String? _saveError;

  TimerPhase get phase => _phase;
  CompletedAttempt? get pendingAttempt => _pendingAttempt;

  TimerSnapshot get snapshot {
    final now = clock.now;
    final inspection = _inspectionStartedAt == null
        ? _finishedInspection
        : _nonNegative(now - _inspectionStartedAt!);
    return TimerSnapshot(
      phase: _phase,
      elapsed: _startedAt != null && _phase == TimerPhase.running
          ? _nonNegative(now - _startedAt!)
          : _finishedElapsed,
      inspection: inspection,
      penalty: _inspectionStartedAt != null
          ? inspectionPenalty(inspection)
          : _penalty,
      holdReady: _phase == TimerPhase.holding && now - _heldAt! >= holdDuration,
      shouldKeepAwake:
          _phase == TimerPhase.running ||
          _phase == TimerPhase.inspecting ||
          (_phase == TimerPhase.holding && _inspectionStartedAt != null),
      moveCount: _turns.length,
      hasIncompleteEvidence: _issues.any(
        (issue) => issue != EvidenceIssue.clockFallback,
      ),
      completedAttempt: _pendingAttempt,
      saveError: _saveError,
    );
  }

  static SolvePenalty inspectionPenalty(Duration inspection) {
    if (inspection >= const Duration(seconds: 17)) return SolvePenalty.dnf;
    if (inspection >= const Duration(seconds: 15)) return SolvePenalty.plusTwo;
    return SolvePenalty.none;
  }

  /// Call only for a fresh key-down, never for OS repeat notifications.
  /// The first press begins inspection when enabled; a later hold starts solve.
  void pressStart({bool isRepeat = false, bool inputAllowed = true}) {
    if (isRepeat || !inputAllowed) return;
    if (_phase == TimerPhase.running) {
      _finish(clock.now);
      return;
    }
    if (mode != TimerMode.keyboard) return;
    if (_phase != TimerPhase.awaitingStart && _phase != TimerPhase.inspecting) {
      return;
    }
    if (_phase == TimerPhase.awaitingStart && inspectionEnabled) {
      _beginInspection(clock.now);
      return;
    }
    _holdOrigin = _phase;
    _heldAt = clock.now;
    _phase = TimerPhase.holding;
  }

  void releaseStart({bool inputAllowed = true}) {
    if (_phase != TimerPhase.holding) return;
    final now = clock.now;
    if (!inputAllowed || now - _heldAt! < holdDuration) {
      _phase = _holdOrigin!;
    } else {
      _start(now);
    }
    _heldAt = null;
    _holdOrigin = null;
  }

  void pressOrdinaryKey({bool isRepeat = false, bool inputAllowed = true}) {
    if (!isRepeat && inputAllowed && _phase == TimerPhase.running) {
      _finish(clock.now);
    }
  }

  /// Inspection cancellation creates no solve. Running Esc ends as DNF.
  void escape() {
    if (_phase == TimerPhase.running) {
      _finish(clock.now, forcedPenalty: SolvePenalty.dnf);
    } else if (_phase == TimerPhase.inspecting ||
        _phase == TimerPhase.holding) {
      _inspectionStartedAt = null;
      _heldAt = null;
      _holdOrigin = null;
      _phase = mode == TimerMode.bluetooth
          ? TimerPhase.preparingScramble
          : TimerPhase.awaitingStart;
    }
  }

  /// A trusted current full state can arm an already scrambled cube. It cannot
  /// end a solve: a snapshot alone proves neither history nor finish time.
  void targetStateConfirmed() {
    if (mode != TimerMode.bluetooth || _phase != TimerPhase.preparingScramble) {
      return;
    }
    _armBluetooth(clock.now);
  }

  /// Process each decoded move separately, including moves in the same packet.
  /// Never wait one second after the target turn: the next live turn starts.
  void acceptTurn(BluetoothTurn turn) {
    if (mode != TimerMode.bluetooth) return;
    if (_lastSequence != null && turn.sequence <= _lastSequence!) return;
    _lastSequence = turn.sequence;
    if (turn.hasGap && _phase == TimerPhase.running) {
      _issues.add(EvidenceIssue.missingMoves);
    }
    if (turn.origin == MoveOrigin.history) {
      if (_phase == TimerPhase.running) {
        // Without validated historical timestamps, do not invent an ordering
        // inside an already recorded solve or claim complete move evidence.
        _issues.add(EvidenceIssue.missingMoves);
      }
      return;
    }
    if (_phase == TimerPhase.preparingScramble) {
      if (turn.reachedTarget) _armBluetooth(turn.at);
      return;
    }
    if (_phase == TimerPhase.awaitingStart || _phase == TimerPhase.inspecting) {
      _start(turn.at);
      if (turn.hasGap) _issues.add(EvidenceIssue.missingMoves);
    }
    if (_phase != TimerPhase.running) return;
    final offset = turn.at - _startedAt!;
    if (offset.isNegative ||
        (_turns.isNotEmpty && offset < _turns.last.offset)) {
      _issues.add(EvidenceIssue.missingMoves);
      return;
    }
    _turns.add(
      RecordedTurn(
        sequence: turn.sequence,
        notation: turn.notation,
        offset: offset,
        origin: turn.origin,
      ),
    );
    if (turn.isSolved) _finish(turn.at);
  }

  void connectionLost() {
    if (_phase == TimerPhase.running) {
      _issues.add(EvidenceIssue.disconnected);
    }
  }

  void markMissingMoves() {
    if (_phase == TimerPhase.running) _issues.add(EvidenceIssue.missingMoves);
  }

  /// Host receive time is valid timing, but must not be advertised as verified
  /// device interval time. This marker does not imply missing move evidence.
  void markClockFallback() {
    if (_phase == TimerPhase.running) _issues.add(EvidenceIssue.clockFallback);
  }

  /// Persist this pending attempt in active_attempts, excluded from statistics.
  /// Resume never silently turns an interrupted attempt into a valid solve.
  void systemSleep() {
    if (_phase != TimerPhase.running &&
        _phase != TimerPhase.inspecting &&
        _phase != TimerPhase.holding) {
      return;
    }
    _issues.add(EvidenceIssue.systemSleep);
    _finish(clock.now, interrupted: true);
  }

  void resolveInterruption({required bool keepAsDnf}) {
    if (_phase != TimerPhase.interrupted) return;
    if (keepAsDnf) {
      _pendingAttempt = _pendingAttempt!.resolveInterruptionAsDnf();
      _penalty = SolvePenalty.dnf;
      _phase = TimerPhase.saving;
    } else {
      _pendingAttempt = null;
      _phase = TimerPhase.completed;
    }
  }

  /// A failed save retains evidence and keeps the attempt retryable.
  void saveFailed(String message) {
    if (_phase != TimerPhase.saving) return;
    _saveError = message;
  }

  void saveSucceeded() {
    if (_phase != TimerPhase.saving) return;
    _saveError = null;
    _phase = TimerPhase.completed;
  }

  /// Explicit next-attempt boundary; cannot discard running or unsaved evidence.
  bool prepareNext() {
    if (_phase != TimerPhase.completed) return false;
    _heldAt = null;
    _holdOrigin = null;
    _inspectionStartedAt = null;
    _startedAt = null;
    _finishedElapsed = Duration.zero;
    _finishedInspection = Duration.zero;
    _penalty = SolvePenalty.none;
    _turns.clear();
    _issues.clear();
    _pendingAttempt = null;
    _saveError = null;
    _phase = mode == TimerMode.bluetooth
        ? TimerPhase.preparingScramble
        : TimerPhase.awaitingStart;
    return true;
  }

  void _armBluetooth(Duration at) {
    if (inspectionEnabled) {
      _beginInspection(at);
    } else {
      _phase = TimerPhase.awaitingStart;
    }
  }

  void _beginInspection(Duration at) {
    _inspectionStartedAt = at;
    _phase = TimerPhase.inspecting;
  }

  void _start(Duration at) {
    _finishedInspection = _inspectionStartedAt == null
        ? Duration.zero
        : _nonNegative(at - _inspectionStartedAt!);
    _penalty = inspectionPenalty(_finishedInspection);
    _inspectionStartedAt = null;
    _startedAt = at;
    _phase = TimerPhase.running;
  }

  void _finish(
    Duration at, {
    SolvePenalty? forcedPenalty,
    bool interrupted = false,
  }) {
    if (_inspectionStartedAt != null) {
      _finishedInspection = _nonNegative(at - _inspectionStartedAt!);
      _penalty = inspectionPenalty(_finishedInspection);
      _inspectionStartedAt = null;
    }
    _finishedElapsed = _startedAt == null
        ? Duration.zero
        : _nonNegative(at - _startedAt!);
    _penalty = forcedPenalty ?? _penalty;
    _pendingAttempt = CompletedAttempt(
      mode: mode,
      elapsed: _finishedElapsed,
      inspection: _finishedInspection,
      penalty: _penalty,
      turns: _turns,
      issues: _issues,
      requiresInterruptionDecision: interrupted,
    );
    _heldAt = null;
    _holdOrigin = null;
    _phase = interrupted ? TimerPhase.interrupted : TimerPhase.saving;
  }

  static Duration _nonNegative(Duration duration) =>
      duration.isNegative ? Duration.zero : duration;
}
