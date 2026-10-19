import 'dart:typed_data';

enum SolvePenalty { none, plusTwo, dnf }

enum SolveStatus { complete, interrupted }

enum EvidenceCompleteness { complete, missingMoves, summaryOnly }

enum DetailState { available, absent, pruned }

class SessionRecord {
  const SessionRecord({
    required this.id,
    required this.name,
    this.puzzle = '333',
    this.sortOrder = 0,
  });
  final String id;
  final String name;
  final String puzzle;
  final int sortOrder;
}

/// Wall time is UTC microseconds; duration is an elapsed, monotonic interval.
/// Integer precision is not a claim about hardware measurement accuracy.
class SolveSummary {
  const SolveSummary({
    required this.id,
    required this.sessionId,
    required this.startedAtUs,
    required this.durationUs,
    required this.scramble,
    this.puzzle = '333',
    this.note = '',
    this.source = 'keyboard',
    this.penalty = SolvePenalty.none,
    this.status = SolveStatus.complete,
    this.completeness = EvidenceCompleteness.summaryOnly,
    this.detailState = DetailState.absent,
    this.rawRevision = 1,
    this.compatibilityJson = '{}',
  });
  final String id, sessionId, puzzle, scramble, note, source, compatibilityJson;
  final int startedAtUs, durationUs, rawRevision;
  final SolvePenalty penalty;
  final SolveStatus status;
  final EvidenceCompleteness completeness;
  final DetailState detailState;

  int? get effectiveDurationUs =>
      status == SolveStatus.interrupted || penalty == SolvePenalty.dnf
      ? null
      : durationUs + (penalty == SolvePenalty.plusTwo ? 2000000 : 0);

  HistoryCursor get cursor => HistoryCursor(startedAtUs, id);
}

class HistoryCursor {
  const HistoryCursor(this.startedAtUs, this.id);
  final int startedAtUs;
  final String id;
}

/// Opaque, versioned evidence. The protocol/recording codec owns its structure.
class SolveDetail {
  const SolveDetail({
    required this.evidence,
    this.encodingVersion = 1,
    this.poseSamples,
    this.poseEncodingVersion = 1,
  });
  final Uint8List evidence;
  final int encodingVersion;
  final Uint8List? poseSamples;
  final int poseEncodingVersion;
}

class AggregateSnapshot {
  const AggregateSnapshot(this.count, this.validCount, this.totalUs);
  final int count, validCount, totalUs;
  double? get meanUs => validCount == 0 ? null : totalUs / validCount;
}
