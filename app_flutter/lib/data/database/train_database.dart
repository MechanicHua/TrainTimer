import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'schema.dart';

/// A custom-SQL Drift database. Production IO runs on Drift's worker isolate.
class TrainDatabase extends GeneratedDatabase {
  TrainDatabase(super.executor);

  factory TrainDatabase.memory() => TrainDatabase(NativeDatabase.memory());

  static Future<TrainDatabase> open({Directory? directory}) async {
    final root =
        directory ??
        Directory(
          p.join(
            (await getApplicationSupportDirectory()).path,
            'TrainTimerFlutter',
            'v1',
          ),
        );
    await root.create(recursive: true);
    return TrainDatabase(
      NativeDatabase.createInBackground(
        File(p.join(root.path, 'traintimer.sqlite')),
        setup: (database) {
          database.execute('PRAGMA journal_mode = WAL');
          database.execute('PRAGMA synchronous = NORMAL');
          database.execute('PRAGMA busy_timeout = 5000');
          database.execute('PRAGMA foreign_keys = ON');
        },
      ),
    );
  }

  @override
  int get schemaVersion => 1;

  @override
  Iterable<TableInfo<Table, Object?>> get allTables => const [];

  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => const [];

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (_) async {
      for (final statement in schemaStatements) {
        await customStatement(statement);
      }
    },
    onUpgrade: (_, from, to) async {
      // Fail closed until a versioned migration with pre-upgrade backup exists.
      throw StateError('Unsupported database migration: $from → $to');
    },
    beforeOpen: (_) async {
      await customStatement('PRAGMA foreign_keys = ON');
    },
  );

  /// Snapshot includes committed WAL data. The caller validates before publishing.
  /// VACUUM INTO is not incremental; only run this prototype while idle.
  Future<void> snapshotTo(File target) async {
    await customStatement('VACUUM INTO ?', [target.path]);
  }
}
