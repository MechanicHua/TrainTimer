import 'dart:collection';

import '../device_events.dart';

final class SequenceAmbiguity implements Exception {
  const SequenceAmbiguity();

  @override
  String toString() => 'Sequence counter is ambiguous; resynchronize the cube.';
}

final class MoveSequenceDecision {
  const MoveSequenceDecision({
    required this.sequence,
    required this.duplicate,
    required this.origin,
    required this.missingMoves,
  });

  final int sequence;
  final bool duplicate;
  final EventOrigin origin;
  final int missingMoves;

  bool get canTriggerTimer => !duplicate && origin == EventOrigin.live;
}

/// Unwraps a bounded device counter and distinguishes new moves from history.
/// Reordering is classified as history; it must not start a timer. A protocol
/// must request a new baseline after an ambiguous jump of half the counter
/// range or more. Create a fresh tracker only after explicit resynchronization.
final class MoveSequenceTracker {
  MoveSequenceTracker({this.modulus = 256, this.deduplicationCapacity = 512}) {
    if (modulus < 4 || modulus.isOdd) {
      throw ArgumentError.value(modulus, 'modulus', 'must be even and >= 4');
    }
    if (deduplicationCapacity < 1) {
      throw ArgumentError.value(deduplicationCapacity, 'deduplicationCapacity');
    }
  }

  final int modulus;
  final int deduplicationCapacity;
  final LinkedHashSet<int> _seen = LinkedHashSet<int>();
  int? _latest;

  int? get latestSequence => _latest;

  MoveSequenceDecision accept(int rawSequence, {required EventOrigin origin}) {
    if (rawSequence < 0 || rawSequence >= modulus) {
      throw RangeError.range(rawSequence, 0, modulus - 1, 'rawSequence');
    }
    if (origin == EventOrigin.stateSnapshot) {
      throw ArgumentError('A state snapshot is not a move.');
    }
    var sequence = rawSequence;
    final latest = _latest;
    if (latest != null) {
      sequence = latest - latest % modulus + rawSequence;
      if ((sequence - latest).abs() == modulus ~/ 2) {
        throw const SequenceAmbiguity();
      }
      if (sequence - latest >= modulus ~/ 2) sequence -= modulus;
      if (latest - sequence > modulus ~/ 2) sequence += modulus;
    }
    final duplicate = _seen.contains(sequence);
    final resolvedOrigin =
        origin == EventOrigin.history || (latest != null && sequence <= latest)
        ? EventOrigin.history
        : EventOrigin.live;
    final missing =
        !duplicate && resolvedOrigin == EventOrigin.live && latest != null
        ? sequence - latest - 1
        : 0;
    _seen.add(sequence);
    if (_seen.length > deduplicationCapacity) _seen.remove(_seen.first);
    // A historical baseline may anchor the unwrapping, but never arms timing.
    if (_latest == null || sequence > _latest!) _latest = sequence;
    return MoveSequenceDecision(
      sequence: sequence,
      duplicate: duplicate,
      origin: resolvedOrigin,
      missingMoves: missing,
    );
  }
}
