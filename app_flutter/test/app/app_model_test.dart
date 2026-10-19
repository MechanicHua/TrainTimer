import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/app/app_model.dart';
import 'package:traintimer/core/cube/native_solver.dart';
import 'package:traintimer/core/timing/timing.dart' as timing;
import 'package:traintimer/data/data.dart';

/// Real SQLite plus controlled repository failures exercise the application
/// boundary rather than duplicating the timer state-machine unit tests.
class _Repository extends SolveRepository {
  _Repository(super.database);
  bool failRefresh = false;
  bool failCheckpoint = false;
  bool failDiscard = false;
  Completer<void>? discardGate;
  final discardStarted = Completer<void>();
  final saved = <SolveSummary>[];

  @override
  Future<List<SolveSummary>> list({
    String? sessionId,
    HistoryCursor? before,
    int limit = 50,
  }) {
    if (failRefresh) {
      return Future.error(StateError('Injected refresh failure'));
    }
    return super.list(sessionId: sessionId, before: before, limit: limit);
  }

  @override
  Future<void> save(
    SolveSummary solve, {
    SolveDetail? detail,
    String? activeAttemptId,
  }) async {
    saved.add(solve);
    await super.save(solve, detail: detail, activeAttemptId: activeAttemptId);
  }

  @override
  Future<void> checkpoint({
    required String id,
    required String checkpointJson,
    required int lastSequence,
    required int updatedAtUs,
  }) async {
    if (failCheckpoint) throw StateError('Injected checkpoint failure');
    await super.checkpoint(
      id: id,
      checkpointJson: checkpointJson,
      lastSequence: lastSequence,
      updatedAtUs: updatedAtUs,
    );
  }

  @override
  Future<void> discardCheckpoint(String id) async {
    if (!discardStarted.isCompleted) discardStarted.complete();
    await discardGate?.future;
    if (failDiscard) throw StateError('Injected discard failure');
    await super.discardCheckpoint(id);
  }
}

Future<void> _start(AppModel model) async {
  while (model.generating) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  if (model.inspectionEnabled) {
    model.keyDown(start: true);
    model.keyUp();
    expect(model.timer.phase, timing.TimerPhase.inspecting);
  }
  model.keyDown(start: true);
  await Future<void>.delayed(const Duration(milliseconds: 550));
  model.keyUp();
  expect(model.timer.phase, timing.TimerPhase.running);
}

Future<void> _waitForSave(AppModel model) async {
  final timeout = Stopwatch()..start();
  while (model.saving) {
    if (timeout.elapsed > const Duration(seconds: 5)) {
      throw TimeoutException('The app did not finish its save operation');
    }
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
}

void main() {
  late TrainDatabase database;
  late _Repository repository;
  late AppModel model;
  setUp(() async {
    database = TrainDatabase.memory();
    repository = _Repository(database);
    final library =
        Platform.environment['TRAIN_TIMER_SOLVER'] ??
        '${Directory.current.path}/native/min2phase/build/libtraintimer_min2phase.dylib';
    expect(
      File(library).existsSync(),
      isTrue,
      reason:
          'Build the native regression library before AppModel integration tests',
    );
    model = AppModel(
      database: database,
      repository: repository,
      solver: NativeSolver(libraryPath: library),
      dataDirectory: Directory.systemTemp,
    );
    await model.initialize();
    expect(model.scramble, isNotEmpty);
  });
  tearDown(() async {
    model.dispose();
    await database.close();
  });

  test(
    'inspection changes after a saved attempt allocate a new ID and start date',
    () async {
      await _start(model);
      model.keyDown(start: false);
      await _waitForSave(model);
      expect(model.timer.phase, timing.TimerPhase.completed);
      model.configureInspection(true);
      await _start(model);
      model.keyDown(start: false);
      await _waitForSave(model);
      expect(model.timer.phase, timing.TimerPhase.completed);
      expect(model.timer.snapshot.saveError, isNull);
      expect((await repository.aggregate()).count, 2);
      expect(repository.saved.map((solve) => solve.id).toSet(), hasLength(2));
      expect(
        repository.saved.last.startedAtUs,
        greaterThan(repository.saved.first.startedAtUs),
      );
      expect(await repository.recoverableAttempts(), isEmpty);
    },
  );

  test(
    'discard remains interrupted until durable deletion succeeds and can retry',
    () async {
      await _start(model);
      model.sleep();
      expect(model.timer.phase, timing.TimerPhase.interrupted);
      repository.discardGate = Completer<void>();
      repository.failDiscard = true;
      final discard = model.resolveInterrupted(false);
      await repository.discardStarted.future.timeout(
        const Duration(seconds: 5),
      );
      expect(model.active, isTrue);
      expect(model.timer.phase, timing.TimerPhase.interrupted);
      // Async checkpoint/discard work must not unlock the next attempt.
      final oldScramble = model.scramble;
      await model.nextScramble();
      expect(model.scramble, oldScramble);
      expect(model.generating, isFalse);
      repository.discardGate!.complete();
      await discard;
      expect(model.timer.phase, timing.TimerPhase.interrupted);
      expect(model.timer.pendingAttempt, isNotNull);
      expect(await repository.recoverableAttempts(), hasLength(1));
      repository.failDiscard = false;
      repository.discardGate = null;
      await model.resolveInterrupted(false);
      expect(model.timer.phase, timing.TimerPhase.completed);
      expect(await repository.recoverableAttempts(), isEmpty);
      expect((await repository.aggregate()).count, 0);
    },
  );

  test(
    'refresh failure after a committed save never retries the insert',
    () async {
      await _start(model);
      repository.failRefresh = true;
      model.keyDown(start: false);
      await _waitForSave(model);
      expect(model.timer.phase, timing.TimerPhase.completed);
      expect(model.timer.snapshot.saveError, isNull);
      expect(repository.saved, hasLength(1));
      expect((await repository.aggregate()).count, 1);
      expect(model.error ?? '', isNot(contains('成绩未保存')));
      await model.savePending();
      expect(repository.saved, hasLength(1));
      repository.failRefresh = false;
      await model.refresh();
      expect(model.recent, hasLength(1));
      expect(model.recent.single.id, repository.saved.single.id);
    },
  );

  test('failed start checkpoint does not poison the final save', () async {
    repository.failCheckpoint = true;
    await _start(model);
    model.keyDown(start: false);
    await _waitForSave(model);
    expect(model.timer.phase, timing.TimerPhase.completed);
    expect(model.timer.snapshot.saveError, isNull);
    expect((await repository.aggregate()).count, 1);
    expect(await repository.recoverableAttempts(), isEmpty);
  });
}
