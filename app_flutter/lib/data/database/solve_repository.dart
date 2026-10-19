import 'package:drift/drift.dart';

import 'records.dart';
import 'train_database.dart';

/// The repository exposes bounded summaries; evidence is always fetched explicitly.
class SolveRepository {
  SolveRepository(this.database);
  final TrainDatabase database;
  static const maxPendingWrites = 64;
  int _pendingWrites = 0;

  static const _summaryColumns = '''id, session_id, puzzle, started_at_us,
duration_us, penalty, scramble, note, source, status, completeness,
detail_state, raw_revision, compatibility_json''';

  Future<List<SessionRecord>> sessions() async =>
      (await database
              .customSelect(
                'SELECT id,name,puzzle,sort_order FROM sessions '
                'ORDER BY sort_order,id',
              )
              .get())
          .map(
            (row) => SessionRecord(
              id: row.read<String>('id'),
              name: row.read<String>('name'),
              puzzle: row.read<String>('puzzle'),
              sortOrder: row.read<int>('sort_order'),
            ),
          )
          .toList();

  Future<void> saveSession(SessionRecord session) => _write(() async {
    await database.customStatement(
      '''INSERT INTO sessions(id,name,puzzle,sort_order)
VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
puzzle=excluded.puzzle,sort_order=excluded.sort_order''',
      [session.id, session.name, session.puzzle, session.sortOrder],
    );
    await _changed();
  });

  Future<List<SolveSummary>> list({
    String? sessionId,
    HistoryCursor? before,
    int limit = 50,
  }) async {
    if (limit < 1 || limit > 200) {
      throw RangeError.range(limit, 1, 200, 'limit');
    }
    final conditions = <String>[];
    final variables = <Variable>[];
    if (sessionId != null) {
      conditions.add('session_id = ?');
      variables.add(Variable<String>(sessionId));
    }
    if (before != null) {
      conditions.add('(started_at_us, id) < (?, ?)');
      variables.addAll([
        Variable<int>(before.startedAtUs),
        Variable<String>(before.id),
      ]);
    }
    variables.add(Variable<int>(limit));
    final where = conditions.isEmpty ? '' : 'WHERE ${conditions.join(' AND ')}';
    return (await database
            .customSelect(
              'SELECT $_summaryColumns FROM solves '
              '$where ORDER BY started_at_us DESC,id DESC LIMIT ?',
              variables: variables,
            )
            .get())
        .map(_summary)
        .toList();
  }

  Future<SolveSummary?> find(String id) async {
    final row = await database
        .customSelect(
          'SELECT $_summaryColumns FROM solves '
          'WHERE id = ?',
          variables: [Variable<String>(id)],
        )
        .getSingleOrNull();
    return row == null ? null : _summary(row);
  }

  Future<SolveDetail?> detail(String id, {bool includePose = false}) async {
    final row = await database
        .customSelect(
          'SELECT encoding_version,evidence '
          'FROM solve_details WHERE solve_id = ?',
          variables: [Variable<String>(id)],
        )
        .getSingleOrNull();
    if (row == null) return null;
    final pose = includePose
        ? await database
              .customSelect(
                'SELECT encoding_version,samples FROM pose_tracks WHERE solve_id = ?',
                variables: [Variable<String>(id)],
              )
              .getSingleOrNull()
        : null;
    return SolveDetail(
      evidence: row.read<Uint8List>('evidence'),
      encodingVersion: row.read<int>('encoding_version'),
      poseSamples: pose?.read<Uint8List>('samples'),
      poseEncodingVersion: pose?.read<int>('encoding_version') ?? 1,
    );
  }

  /// Duplicate IDs fail instead of silently replacing evidence. The timer owns ID
  /// creation, so a retried failed save can refer to the original attempt.
  Future<void> save(
    SolveSummary solve, {
    SolveDetail? detail,
    String? activeAttemptId,
  }) async {
    if (solve.durationUs < 0) {
      throw ArgumentError.value(solve.durationUs, 'durationUs');
    }
    if (solve.detailState == DetailState.available && detail == null) {
      throw ArgumentError('Available details must be supplied atomically');
    }
    await _write(() async {
      await database.customStatement(
        '''INSERT INTO solves($_summaryColumns)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        [
          solve.id,
          solve.sessionId,
          solve.puzzle,
          solve.startedAtUs,
          solve.durationUs,
          solve.penalty.name,
          solve.scramble,
          solve.note,
          solve.source,
          solve.status.name,
          solve.completeness.name,
          detail == null ? solve.detailState.name : DetailState.available.name,
          solve.rawRevision,
          solve.compatibilityJson,
        ],
      );
      if (detail != null) {
        await database.customStatement(
          'INSERT INTO solve_details VALUES(?,?,?)',
          [solve.id, detail.encodingVersion, detail.evidence],
        );
        if (detail.poseSamples != null) {
          await database.customStatement(
            'INSERT INTO pose_tracks VALUES(?,?,?)',
            [solve.id, detail.poseEncodingVersion, detail.poseSamples],
          );
        }
      }
      await _aggregateDelta(solve, 1);
      if (activeAttemptId != null) {
        await database.customStatement(
          'DELETE FROM active_attempts WHERE id=?',
          [activeAttemptId],
        );
      }
      await _changed();
    });
  }

  /// Metadata edits preserve raw evidence revision and existing analysis.
  Future<void> update(String id, {String? note, SolvePenalty? penalty}) =>
      _write(() async {
        final old = await find(id);
        if (old == null) throw StateError('Solve no longer exists: $id');
        await _aggregateDelta(old, -1);
        await database.customStatement(
          'UPDATE solves SET note=?,penalty=? WHERE id=?',
          [note ?? old.note, (penalty ?? old.penalty).name, id],
        );
        await _aggregateDelta((await find(id))!, 1);
        await _changed();
      });

  Future<void> delete(String id) => _write(() async {
    final solve = await find(id);
    if (solve == null) return;
    await _aggregateDelta(solve, -1);
    await database.customStatement('DELETE FROM solves WHERE id=?', [id]);
    await _changed();
  });

  /// Sleep recovery is an explicit choice: DNF keeps the evidence and raw time;
  /// discard uses [delete]. Pending interruptions never enter valid statistics.
  Future<void> resolveInterruptedAsDnf(String id) => _write(() async {
    final old = await find(id);
    if (old == null || old.status != SolveStatus.interrupted) {
      throw StateError('No unresolved interruption: $id');
    }
    await database.customStatement(
      "UPDATE solves SET status='complete',penalty='dnf' WHERE id=?",
      [id],
    );
    await _aggregateDelta((await find(id))!, 1);
    await _changed();
  });

  Future<AggregateSnapshot> aggregate({String? sessionId}) async {
    final row = await database
        .customSelect(
          'SELECT solve_count,valid_count,total_us '
          'FROM statistics_cache WHERE scope=?',
          variables: [
            Variable<String>(
              sessionId == null ? 'global' : 'session:$sessionId',
            ),
          ],
        )
        .getSingleOrNull();
    return row == null
        ? const AggregateSnapshot(0, 0, 0)
        : AggregateSnapshot(
            row.read<int>('solve_count'),
            row.read<int>('valid_count'),
            row.read<int>('total_us'),
          );
  }

  /// Late analysis cannot replace results for changed or deleted evidence.
  Future<bool> saveAnalysis({
    required String solveId,
    required int rawRevision,
    required String algorithmVersion,
    required String resultJson,
  }) => _write(() async {
    final solve = await find(solveId);
    if (solve == null ||
        solve.rawRevision != rawRevision ||
        solve.completeness != EvidenceCompleteness.complete ||
        solve.status != SolveStatus.complete) {
      return false;
    }
    await database.customStatement(
      '''INSERT INTO solve_analysis VALUES(?,?,?,?)
ON CONFLICT(solve_id) DO UPDATE SET algorithm_version=excluded.algorithm_version,
raw_revision=excluded.raw_revision,result_json=excluded.result_json''',
      [solveId, algorithmVersion, rawRevision, resultJson],
    );
    await _changed();
    return true;
  });

  /// Short checkpoint batches are versioned by their last durable sequence.
  Future<void> checkpoint({
    required String id,
    required String checkpointJson,
    required int lastSequence,
    required int updatedAtUs,
  }) => _write(() async {
    await database.customStatement(
      '''INSERT INTO active_attempts VALUES(?,?,?,?)
ON CONFLICT(id) DO UPDATE SET checkpoint_json=excluded.checkpoint_json,
last_sequence=excluded.last_sequence,updated_at_us=excluded.updated_at_us
WHERE excluded.last_sequence >= active_attempts.last_sequence''',
      [id, checkpointJson, lastSequence, updatedAtUs],
    );
    await _changed();
  });

  Future<List<Map<String, dynamic>>> recoverableAttempts() async =>
      (await database
              .customSelect(
                'SELECT * FROM active_attempts '
                'ORDER BY updated_at_us DESC LIMIT 100',
              )
              .get())
          .map((r) => r.data)
          .toList();

  /// Discard only the selected durable checkpoint and record the data revision
  /// in the same transaction, so backup scheduling can observe the change.
  Future<void> discardCheckpoint(String id) => _write(() async {
    await database.customStatement('DELETE FROM active_attempts WHERE id=?', [
      id,
    ]);
    await _changed();
  });

  Future<void> _aggregateDelta(SolveSummary solve, int direction) async {
    final effective = solve.effectiveDurationUs;
    // An unresolved interruption is excluded even from the completed count.
    final count = solve.status == SolveStatus.complete ? direction : 0;
    for (final scope in ['global', 'session:${solve.sessionId}']) {
      await database.customStatement(
        '''INSERT INTO statistics_cache
(scope,solve_count,valid_count,total_us,revision) VALUES(?,?,?,?,1)
ON CONFLICT(scope) DO UPDATE SET solve_count=solve_count+excluded.solve_count,
valid_count=valid_count+excluded.valid_count,total_us=total_us+excluded.total_us,
revision=revision+1''',
        [
          scope,
          count,
          effective == null ? 0 : direction,
          (effective ?? 0) * direction,
        ],
      );
    }
  }

  /// Backpressure prevents an unbounded Drift isolate queue. The caller keeps
  /// unsaved attempts visible and may retry when a short transaction completes.
  Future<T> _write<T>(Future<T> Function() operation) async {
    if (_pendingWrites >= maxPendingWrites) {
      throw StateError(
        'Database write queue is full; retry the unsaved operation',
      );
    }
    _pendingWrites++;
    try {
      return await database.transaction(operation);
    } finally {
      _pendingWrites--;
    }
  }

  Future<void> _changed() => database.customStatement(
    'UPDATE database_metadata SET data_revision=data_revision+1 WHERE singleton=1',
  );

  static SolveSummary _summary(QueryRow row) => SolveSummary(
    id: row.read<String>('id'),
    sessionId: row.read<String>('session_id'),
    puzzle: row.read<String>('puzzle'),
    startedAtUs: row.read<int>('started_at_us'),
    durationUs: row.read<int>('duration_us'),
    penalty: SolvePenalty.values.byName(row.read<String>('penalty')),
    scramble: row.read<String>('scramble'),
    note: row.read<String>('note'),
    source: row.read<String>('source'),
    status: SolveStatus.values.byName(row.read<String>('status')),
    completeness: EvidenceCompleteness.values.byName(
      row.read<String>('completeness'),
    ),
    detailState: DetailState.values.byName(row.read<String>('detail_state')),
    rawRevision: row.read<int>('raw_revision'),
    compatibilityJson: row.read<String>('compatibility_json'),
  );
}
