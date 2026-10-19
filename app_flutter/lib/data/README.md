# Data prototype

`data.dart` exports the integration API. `TrainDatabase.open()` stores data in
`<application-support>/TrainTimerFlutter/v1/traintimer.sqlite`, with WAL and
foreign keys enabled. It never discovers or changes the old application's files.
The `directory` override is for isolated fixtures. Production SQL executes in
`NativeDatabase.createInBackground`; `memory()` is for correctness tests only.

```dart
final database = await TrainDatabase.open();
final records = SolveRepository(database);
await records.saveSession(const SessionRecord(id: 'main', name: '三阶'));
await records.save(SolveSummary(
  id: const Uuid().v4(),
  sessionId: 'main',
  startedAtUs: DateTime.now().toUtc().microsecondsSinceEpoch,
  durationUs: elapsedMonotonicMicroseconds,
  scramble: scramble,
));
final page = await records.list(sessionId: 'main');
final nextPage = await records.list(sessionId: 'main', before: page.last.cursor);
await database.close();
```

The caller creates a stable attempt ID before saving and retains unsaved results
on any failure. Duplicate IDs fail rather than overwrite evidence. At most 64
write transactions can be pending per repository; further writes fail with an
explicit retryable queue-full error. A page holds at most 200 summaries and does
not fetch evidence or pose tracks. The UI controls its own bounded page cache.

All stored times use integer microseconds. Start dates are UTC wall time;
elapsed timing comes from a monotonic clock outside this module. `durationUs`
always holds raw solve time, while `effectiveDurationUs` applies +2 or returns
null for DNF and unresolved interruptions. `aggregate()` includes completed DNF
in count but excludes DNF and interruptions from valid count and duration total.
`resolveInterruptedAsDnf` and `delete` implement the explicit recovery choices.

Summary, optional versioned evidence, optional pose, incremental count/sum caches
and active-attempt removal commit in one transaction. Physical moves and protocol
clock metadata are owned by the evidence codec, not duplicated in database rows.
`checkpoint` rejects sequence regression; restoration still requires the timing
controller to decode the checkpoint and ask the user how to handle interruption.

`saveAnalysis` verifies the raw evidence revision, existence and completeness in
the committing transaction. Note/penalty edits preserve raw evidence revision.
The caller still owns task cancellation and algorithm-version selection. Rolling
averages, distribution caches and CFOP analysis are outside this phase-one data
prototype; the count/sum cache is not a replacement for these statistics.

`SnapshotBackup` uses SQLite `VACUUM INTO`, validates integrity, foreign keys and
schema, computes a streamed SHA-256 on a worker isolate, and publishes the database
and manifest together by renaming a staging directory. It includes committed WAL
data. The prototype must be invoked while idle: VACUUM occupies the database
executor until completion and is not an incremental/cancellable backup scheduler.
Daily scheduling, rotation, full restore/source switching, pre-upgrade backups,
transfer codecs, import staging and pruning are still later-stage work. Unsupported
schema upgrades fail closed rather than modifying unknown data.

See `../../benchmarks/README.md` for capacity fixtures and measurement boundaries.
