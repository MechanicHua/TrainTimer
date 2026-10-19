import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../core/cube/cube_move.dart';
import '../core/cube/cube_state.dart';
import '../core/cube/native_solver.dart';
import '../core/cube/random_state.dart';
import '../core/timing/timing.dart' as timing;
import '../data/data.dart' as data;

/// Coordinates low-frequency business transitions; the timer's display and cube
/// animations subscribe separately. No database work runs in a frame callback.
class AppModel extends ChangeNotifier {
  AppModel({
    required this.database,
    required this.repository,
    required this.solver,
    required this.dataDirectory,
  }) {
    timer = timing.TimerController(clock: clock);
  }
  final data.TrainDatabase database;
  final data.SolveRepository repository;
  final NativeSolver solver;
  final Directory dataDirectory;
  final timing.StopwatchClock clock = timing.StopwatchClock();
  late timing.TimerController timer;
  List<data.SessionRecord> sessions = [];
  List<data.SolveSummary> recent = [];
  data.AggregateSnapshot aggregate = const data.AggregateSnapshot(0, 0, 0);
  String sessionId = 'default-333';
  String scramble = '';
  CubeState cube = CubeState.solved();
  CubeMove? lastMove;
  bool generating = false, saving = false, inspectionEnabled = false;
  bool _resolving = false;
  bool _scrambleReady = false;
  int _refreshRevision = 0;
  bool _disposed = false;
  String? error, lastBackup;
  String? diagnosticError;
  List<Map<String, dynamic>> recovered = [];
  String? _attemptId;
  int? _startedAtUs;
  Future<void> _checkpoint = Future.value();

  Future<void> initialize() async {
    sessions = await repository.sessions();
    if (sessions.isEmpty) {
      await repository.saveSession(
        const data.SessionRecord(id: 'default-333', name: '三阶日常'),
      );
      sessions = await repository.sessions();
    }
    sessionId = sessions.first.id;
    recovered = await repository.recoverableAttempts();
    await refresh();
    await nextScramble();
  }

  bool get active =>
      saving ||
      _resolving ||
      switch (timer.phase) {
        timing.TimerPhase.running ||
        timing.TimerPhase.inspecting ||
        timing.TimerPhase.holding ||
        timing.TimerPhase.saving ||
        timing.TimerPhase.interrupted => true,
        _ => false,
      };
  bool get canInput =>
      !generating && _scrambleReady && scramble.isNotEmpty && recovered.isEmpty;
  String get sessionName => sessions.firstWhere((s) => s.id == sessionId).name;

  Future<void> refresh() async {
    final revision = ++_refreshRevision;
    final session = sessionId;
    final results = await Future.wait([
      repository.list(sessionId: session, limit: 20),
      repository.aggregate(sessionId: session),
    ]);
    if (_disposed || revision != _refreshRevision || session != sessionId) {
      return;
    }
    recent = results[0] as List<data.SolveSummary>;
    aggregate = results[1] as data.AggregateSnapshot;
    _notify();
  }

  Future<void> selectSession(String id) async {
    if (active || generating) return;
    sessionId = id;
    await refresh();
  }

  Future<void> addSession(String name) async {
    if (active || name.trim().isEmpty) return;
    final id = const Uuid().v4();
    await repository.saveSession(data.SessionRecord(id: id, name: name.trim()));
    sessions = await repository.sessions();
    await selectSession(id);
  }

  Future<void> nextScramble() async {
    if (active || generating) return;
    generating = true;
    _scrambleReady = false;
    error = null;
    _notify();
    try {
      final target = randomLegalState(Random.secure());
      final result = await solver.solve(target, CubeState.solved());
      final moves = inverseAlgorithm(result.moves);
      if (CubeState.solved().applyAll(moves) != target) {
        throw StateError('Scramble did not reach its target');
      }
      scramble = moves.map((m) => m.token).join(' ');
      _scrambleReady = true;
      cube = target;
      lastMove = null;
      timer.prepareNext();
      _attemptId = null;
      _startedAtUs = null;
    } catch (e) {
      _failure('本地打乱生成失败，请重试。', e);
    } finally {
      generating = false;
      _notify();
    }
  }

  void configureInspection(bool value) {
    if (active) return;
    final completed = timer.phase == timing.TimerPhase.completed;
    inspectionEnabled = value;
    timer = timing.TimerController(clock: clock, inspectionEnabled: value);
    _attemptId = null;
    _startedAtUs = null;
    _notify();
    if (completed) unawaited(nextScramble());
  }

  void keyDown({required bool start, bool escape = false}) {
    if (!canInput) return;
    if (timer.phase == timing.TimerPhase.completed) {
      if (start) unawaited(nextScramble());
      return;
    }
    if (escape) {
      timer.escape();
    } else if (start) {
      timer.pressStart();
    } else {
      timer.pressOrdinaryKey();
    }
    _afterInput();
  }

  void keyUp({bool inputAllowed = true}) {
    timer.releaseStart(inputAllowed: canInput && inputAllowed);
    _afterInput();
  }

  void _afterInput() {
    if (timer.phase == timing.TimerPhase.running && _attemptId == null) {
      _attemptId = const Uuid().v4();
      _startedAtUs = DateTime.now().toUtc().microsecondsSinceEpoch;
      _queueCheckpoint();
    }
    _notify();
    if (timer.phase == timing.TimerPhase.saving) unawaited(savePending());
  }

  void previewMove(CubeMove move) {
    if (active) return;
    cube = cube.apply(move);
    lastMove = move;
    _notify();
  }

  Future<void> savePending() async {
    final attempt = timer.pendingAttempt;
    if (attempt == null || saving || timer.phase != timing.TimerPhase.saving) {
      return;
    }
    saving = true;
    _notify();
    _attemptId ??= const Uuid().v4();
    try {
      await _checkpoint;
      await repository.save(
        data.SolveSummary(
          id: _attemptId!,
          sessionId: sessionId,
          startedAtUs:
              _startedAtUs ?? DateTime.now().toUtc().microsecondsSinceEpoch,
          durationUs: attempt.elapsed.inMicroseconds,
          scramble: scramble,
          penalty: data.SolvePenalty.values.byName(attempt.penalty.name),
        ),
        activeAttemptId: _attemptId,
      );
      timer.saveSucceeded();
      error = null;
    } catch (e) {
      timer.saveFailed('$e');
      _failure('成绩未保存，记录仍保留，请重试。', e);
    } finally {
      saving = false;
      _notify();
    }
    if (timer.phase == timing.TimerPhase.completed) {
      try {
        await refresh();
      } catch (e) {
        _failure('成绩已保存，列表刷新失败。', e);
        _notify();
      }
    }
  }

  void sleep() {
    timer.systemSleep();
    if (timer.phase == timing.TimerPhase.interrupted) {
      _attemptId ??= const Uuid().v4();
      _queueCheckpoint();
    }
    _notify();
  }

  Future<void> resolveInterrupted(bool keep) async {
    if (_resolving || timer.phase != timing.TimerPhase.interrupted) return;
    if (keep) {
      timer.resolveInterruption(keepAsDnf: true);
      await savePending();
    } else {
      final id = _attemptId;
      _resolving = true;
      _notify();
      try {
        await _checkpoint;
        if (id != null) await repository.discardCheckpoint(id);
        timer.resolveInterruption(keepAsDnf: false);
      } catch (e) {
        _failure('丢弃失败，中断记录仍保留。', e);
      } finally {
        _resolving = false;
      }
    }
    _notify();
  }

  void _queueCheckpoint() {
    final id = _attemptId!, snapshot = timer.snapshot;
    final json = jsonEncode({
      'sessionId': sessionId,
      'scramble': scramble,
      'startedAtUs': _startedAtUs,
      'elapsedUs': snapshot.elapsed.inMicroseconds,
      'inspectionUs': snapshot.inspection.inMicroseconds,
      'phase': snapshot.phase.name,
    });
    _checkpoint = _checkpoint
        .then(
          (_) => repository.checkpoint(
            id: id,
            checkpointJson: json,
            lastSequence: 0,
            updatedAtUs: DateTime.now().toUtc().microsecondsSinceEpoch,
          ),
        )
        .catchError((Object e) {
          _failure('中断恢复检查点写入失败。', e);
          _notify();
        });
  }

  Future<void> resolveRecovered(Map<String, dynamic> record, bool keep) async {
    if (_resolving) return;
    _resolving = true;
    _notify();
    try {
      final id = record['id'] as String;
      if (keep) {
        final payload =
            jsonDecode(record['checkpoint_json'] as String)
                as Map<String, dynamic>;
        await repository.save(
          data.SolveSummary(
            id: id,
            sessionId: payload['sessionId'] as String,
            startedAtUs:
                payload['startedAtUs'] as int? ??
                record['updated_at_us'] as int,
            durationUs: payload['elapsedUs'] as int? ?? 0,
            scramble: payload['scramble'] as String? ?? '',
            penalty: data.SolvePenalty.dnf,
            note: '系统睡眠或异常退出后的中断记录',
          ),
          activeAttemptId: id,
        );
      } else {
        await repository.discardCheckpoint(id);
      }
      recovered.removeWhere((r) => r['id'] == id);
      await refresh();
    } catch (e) {
      _failure('中断记录处理失败，仍保留待重试。', e);
    } finally {
      _resolving = false;
      _notify();
    }
  }

  Future<void> backup() async {
    if (active) throw StateError('请在计时结束后创建原型快照');
    final root = Directory(
      '${dataDirectory.path}/backups/manual-${DateTime.now().microsecondsSinceEpoch}',
    );
    final backup = await data.SnapshotBackup(database).create(root);
    lastBackup = backup.path;
    _notify();
  }

  void _failure(String message, Object cause) {
    error = message;
    diagnosticError = cause.toString();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    solver.invalidate();
    super.dispose();
  }
}
