import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/data/data.dart';

void main() {
  late TrainDatabase database;
  late SolveRepository repository;
  SolveSummary solve(
    String id, {
    int startedAt = 100,
    SolvePenalty penalty = SolvePenalty.none,
    SolveStatus status = SolveStatus.complete,
  }) => SolveSummary(
    id: id,
    sessionId: 'main',
    startedAtUs: startedAt,
    durationUs: 10000000,
    scramble: "R U R'",
    penalty: penalty,
    status: status,
    completeness: EvidenceCompleteness.complete,
  );

  group('repository', () {
    setUp(() async {
      database = TrainDatabase.memory();
      repository = SolveRepository(database);
      await repository.saveSession(const SessionRecord(id: 'main', name: '三阶'));
    });
    tearDown(() => database.close());

    test(
      'cursor pagination is stable across identical timestamps and insertions',
      () async {
        for (final id in ['a', 'b', 'c', 'd']) {
          await repository.save(solve(id));
        }
        final first = await repository.list(limit: 2);
        expect(first.map((e) => e.id), ['d', 'c']);
        await repository.save(solve('new', startedAt: 101));
        final second = await repository.list(
          limit: 2,
          before: first.last.cursor,
        );
        expect(second.map((e) => e.id), ['b', 'a']);
        await expectLater(repository.list(limit: 1000000), throwsRangeError);
      },
    );

    test('summary, evidence and optional pose commit together', () async {
      final evidence = Uint8List.fromList([1, 2, 3]);
      await repository.save(
        solve('record'),
        detail: SolveDetail(
          evidence: evidence,
          poseSamples: Uint8List.fromList([4, 5]),
        ),
      );
      expect(
        (await repository.list()).single.detailState,
        DetailState.available,
      );
      expect((await repository.detail('record'))!.poseSamples, isNull);
      expect(
        (await repository.detail('record', includePose: true))!.poseSamples,
        [4, 5],
      );
      expect((await repository.detail('record'))!.evidence, evidence);
      await expectLater(repository.save(solve('record')), throwsA(anything));
      expect((await repository.aggregate()).count, 1);
      await repository.delete('record');
      expect(await repository.detail('record', includePose: true), isNull);
    });

    test('foreign key failure rolls back the whole save', () async {
      final orphan = SolveSummary(
        id: 'orphan',
        sessionId: 'missing',
        startedAtUs: 100,
        durationUs: 1,
        scramble: 'R',
      );
      await expectLater(
        repository.save(
          orphan,
          detail: SolveDetail(evidence: Uint8List.fromList([1])),
        ),
        throwsA(anything),
      );
      expect(await repository.find('orphan'), isNull);
      expect((await repository.aggregate()).count, 0);
    });

    test(
      'penalties do not mutate raw time; interruptions stay out of statistics',
      () async {
        await repository.save(solve('valid'));
        await repository.save(solve('dnf', penalty: SolvePenalty.dnf));
        await repository.save(solve('sleep', status: SolveStatus.interrupted));
        await repository.update(
          'valid',
          penalty: SolvePenalty.plusTwo,
          note: 'note',
        );
        final aggregate = await repository.aggregate();
        expect(aggregate.count, 2);
        expect(aggregate.validCount, 1);
        expect(aggregate.totalUs, 12000000);
        expect((await repository.find('valid'))!.durationUs, 10000000);
        expect((await repository.find('valid'))!.rawRevision, 1);
        expect(
          (await repository.aggregate(sessionId: 'main')).totalUs,
          12000000,
        );
        await repository.delete('valid');
        expect((await repository.aggregate()).totalUs, 0);
        await repository.resolveInterruptedAsDnf('sleep');
        expect((await repository.aggregate()).count, 2);
        expect((await repository.aggregate()).validCount, 0);
        expect((await repository.find('sleep'))!.penalty, SolvePenalty.dnf);
      },
    );

    test('late analysis rejects deleted and stale evidence', () async {
      await repository.save(solve('analysis'));
      expect(
        await repository.saveAnalysis(
          solveId: 'analysis',
          rawRevision: 2,
          algorithmVersion: 'test',
          resultJson: '{}',
        ),
        isFalse,
      );
      expect(
        await repository.saveAnalysis(
          solveId: 'analysis',
          rawRevision: 1,
          algorithmVersion: 'test',
          resultJson: '{}',
        ),
        isTrue,
      );
      await repository.delete('analysis');
      expect(
        await repository.saveAnalysis(
          solveId: 'analysis',
          rawRevision: 1,
          algorithmVersion: 'test',
          resultJson: '{}',
        ),
        isFalse,
      );
    });

    test(
      'checkpoint sequence never regresses and final save removes checkpoint',
      () async {
        await repository.checkpoint(
          id: 'attempt',
          checkpointJson: '{"seq":5}',
          lastSequence: 5,
          updatedAtUs: 100,
        );
        await repository.checkpoint(
          id: 'attempt',
          checkpointJson: '{"seq":4}',
          lastSequence: 4,
          updatedAtUs: 101,
        );
        expect(
          (await repository.recoverableAttempts()).single['last_sequence'],
          5,
        );
        await repository.save(solve('done'), activeAttemptId: 'attempt');
        expect(await repository.recoverableAttempts(), isEmpty);
      },
    );

    test(
      'checkpoint discard changes only its ID and bumps data revision',
      () async {
        for (final id in ['discard', 'keep']) {
          await repository.checkpoint(
            id: id,
            checkpointJson: '{}',
            lastSequence: 0,
            updatedAtUs: 100,
          );
        }
        final before =
            (await database
                    .customSelect('SELECT data_revision FROM database_metadata')
                    .getSingle())
                .read<int>('data_revision');
        await repository.discardCheckpoint('discard');
        expect((await repository.recoverableAttempts()).single['id'], 'keep');
        final after =
            (await database
                    .customSelect('SELECT data_revision FROM database_metadata')
                    .getSingle())
                .read<int>('data_revision');
        expect(after, before + 1);
      },
    );

    test(
      'write queue applies backpressure and recovers after completion',
      () async {
        final writes = List.generate(
          SolveRepository.maxPendingWrites,
          (index) => repository.saveSession(
            SessionRecord(id: 'queued-$index', name: 'queued'),
          ),
        );
        await expectLater(
          repository.saveSession(
            const SessionRecord(id: 'overflow', name: 'overflow'),
          ),
          throwsStateError,
        );
        await Future.wait(writes);
        await repository.saveSession(
          const SessionRecord(id: 'recovered', name: 'recovered'),
        );
        expect(
          (await repository.sessions()).any(
            (session) => session.id == 'overflow',
          ),
          isFalse,
        );
        expect(
          (await repository.sessions()).any(
            (session) => session.id == 'recovered',
          ),
          isTrue,
        );
      },
    );
  });

  test(
    'validated snapshot contains committed WAL writes and detects corruption',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'traintimer-backup-test-',
      );
      final production = await TrainDatabase.open(
        directory: Directory('${root.path}/db'),
      );
      try {
        final writer = SolveRepository(production);
        await writer.saveSession(const SessionRecord(id: 'main', name: 'test'));
        await writer.save(solve('wal'));
        final backup = await SnapshotBackup(
          production,
        ).create(Directory('${root.path}/backups'));
        await SnapshotBackup.verify(backup);
        final file = File('${backup.path}/database.sqlite');
        final handle = await file.open(mode: FileMode.append);
        await handle.writeByte(7);
        await handle.close();
        await expectLater(SnapshotBackup.verify(backup), throwsFormatException);
      } finally {
        await production.close();
        await root.delete(recursive: true);
      }
    },
  );
}
