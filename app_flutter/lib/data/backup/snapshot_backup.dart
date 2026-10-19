import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart' as sql;
import 'package:uuid/uuid.dart';

import '../database/train_database.dart';

/// Phase-one snapshot proof. Rotation and idle/cancellation scheduling are future
/// work: VACUUM INTO is consistent, but it occupies the single database worker.
class SnapshotBackup {
  SnapshotBackup(this.database);
  final TrainDatabase database;

  Future<Directory> create(Directory destination) async {
    await destination.create(recursive: true);
    final id = const Uuid().v4();
    final staging = Directory(p.join(destination.path, '.pending-$id'));
    await staging.create();
    final snapshot = File(p.join(staging.path, 'database.sqlite'));
    try {
      await database.snapshotTo(snapshot);
      final manifest = await Isolate.run(() => _inspect(snapshot.path));
      await File(
        p.join(staging.path, 'manifest.json'),
      ).writeAsString(jsonEncode(manifest), flush: true);
      // Publish only an already validated snapshot and its checksum together.
      return await staging.rename(p.join(destination.path, 'backup-$id'));
    } catch (_) {
      if (await staging.exists()) await staging.delete(recursive: true);
      rethrow;
    }
  }

  /// Validation happens at a temporary restore location before any source switch.
  static Future<void> verify(Directory backup) async {
    final expected =
        jsonDecode(
              await File(p.join(backup.path, 'manifest.json')).readAsString(),
            )
            as Map<String, dynamic>;
    final actual = await Isolate.run(
      () => _inspect(p.join(backup.path, 'database.sqlite')),
    );
    for (final field in [
      'format',
      'schemaVersion',
      'sha256',
      'bytes',
      'dataRevision',
    ]) {
      if (expected[field] != actual[field]) {
        throw FormatException('Backup validation failed: $field');
      }
    }
  }

  static Future<Map<String, Object>> _inspect(String path) async {
    final file = File(path);
    final digest = await sha256.bind(file.openRead()).first;
    final connection = sql.sqlite3.open(path, mode: sql.OpenMode.readOnly);
    try {
      final check = connection.select('PRAGMA integrity_check');
      if (check.length != 1 || check.first.values.first != 'ok') {
        throw const FormatException('Snapshot integrity check failed');
      }
      final version =
          connection.select('PRAGMA user_version').first.values.first as int;
      if (version != 1) {
        throw FormatException('Unsupported snapshot version $version');
      }
      if (connection.select('PRAGMA foreign_key_check').isNotEmpty) {
        throw const FormatException('Snapshot foreign key check failed');
      }
      return {
        'format': 'traintimer-flutter-snapshot-v1',
        'schemaVersion': version,
        'sha256': digest.toString(),
        'bytes': await file.length(),
        'dataRevision':
            connection
                    .select(
                      'SELECT data_revision FROM database_metadata WHERE singleton=1',
                    )
                    .first['data_revision']
                as int,
        'createdAtUtc': DateTime.now().toUtc().toIso8601String(),
      };
    } finally {
      connection.dispose();
    }
  }
}
