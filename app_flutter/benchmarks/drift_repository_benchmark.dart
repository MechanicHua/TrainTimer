import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:traintimer/data/data.dart';

/// Runs on the Flutter test VM with no widgets, compositor, display or GPU.
/// The executor really uses Drift's background isolate and repository mapping.
/// The supplied disposable synthetic fixture is reduced from 2m to 1m rows.
void main() {
  const fixturePath = String.fromEnvironment('TRAINTIMER_BENCHMARK_DB');
  test(
    'Drift isolate repository capacity',
    () async {
      if (p.basename(fixturePath) != 'traintimer.sqlite') {
        throw ArgumentError('Expected disposable traintimer.sqlite fixture');
      }
      final database = await TrainDatabase.open(
        directory: Directory(p.dirname(fixturePath)),
      );
      final repository = SolveRepository(database);
      final scenarios = <Map<String, Object>>[];
      try {
        final sources = await database
            .customSelect(
              'SELECT source,COUNT(*) AS count FROM solves GROUP BY source',
            )
            .get();
        if (sources.length != 1 ||
            sources.single.read<String>('source') != 'synthetic' ||
            sources.single.read<int>('count') != 2000000) {
          throw StateError(
            'Only an exact 2m-row disposable synthetic fixture is accepted',
          );
        }
        for (final size in [2000000, 1000000]) {
          if (size == 1000000) {
            await database.transaction(() async {
              // This destructive operation only touches the explicitly validated,
              // disposable synthetic fixture, never an application data directory.
              await database.customStatement(
                'DELETE FROM solves WHERE id >= ?',
                [1000000.toRadixString(16).padLeft(32, '0')],
              );
              await database.customStatement('DELETE FROM statistics_cache');
              const values =
                  "SUM(status='complete'),"
                  "SUM(status='complete' AND penalty!='dnf'),"
                  "SUM(CASE WHEN status='complete' AND penalty!='dnf' THEN "
                  "duration_us+CASE penalty WHEN 'plusTwo' THEN 2000000 ELSE 0 END "
                  'ELSE 0 END),1';
              await database.customStatement(
                "INSERT INTO statistics_cache SELECT 'global',$values FROM solves",
              );
              await database.customStatement(
                "INSERT INTO statistics_cache SELECT 'session:'||session_id,$values "
                'FROM solves GROUP BY session_id',
              );
            });
          }
          final first = await repository.list();
          final cursor = first.last.cursor;
          final deep = await database
              .customSelect(
                'SELECT started_at_us,id FROM solves '
                'ORDER BY started_at_us,id LIMIT 1 OFFSET ${size ~/ 2}',
              )
              .getSingle();
          final deepCursor = HistoryCursor(
            deep.read<int>('started_at_us'),
            deep.read<String>('id'),
          );
          final samples = <String, List<double>>{
            for (final name in [
              'first_page',
              'cursor_page',
              'deep_cursor_page',
              'million_session',
              'session_switch',
              'aggregate_cache',
              'detail_with_pose',
              'insert_with_detail_and_aggregates',
            ])
              name: [],
          };
          Future<void> measure<T>(
            String name,
            Future<T> Function() operation,
          ) async {
            final clock = Stopwatch()..start();
            await operation();
            clock.stop();
            samples[name]!.add(clock.elapsedMicroseconds / 1000);
          }

          final evidence = Uint8List.fromList(
            List.generate(426, (i) => i % 256),
          );
          for (var repeat = 0; repeat < 100; repeat++) {
            await measure('first_page', () => repository.list());
            await measure('cursor_page', () => repository.list(before: cursor));
            await measure(
              'deep_cursor_page',
              () => repository.list(before: deepCursor),
            );
            await measure(
              'million_session',
              () => repository.list(sessionId: 'million-session'),
            );
            final session = size == 1000000
                ? 'million-session'
                : 'session-${(repeat % 20).toString().padLeft(2, '0')}';
            await measure(
              'session_switch',
              () => repository.list(sessionId: session),
            );
            await measure('aggregate_cache', () => repository.aggregate());
            final detailId = (4 + repeat * 20)
                .toRadixString(16)
                .padLeft(32, '0');
            await measure(
              'detail_with_pose',
              () => repository.detail(detailId, includePose: true),
            );
            final id = 'drift-benchmark-$repeat';
            await measure(
              'insert_with_detail_and_aggregates',
              () => repository.save(
                SolveSummary(
                  id: id,
                  sessionId: 'million-session',
                  startedAtUs: 2000000000000000 + repeat,
                  durationUs: 10000000,
                  scramble: 'R U',
                  source: 'synthetic',
                  completeness: EvidenceCompleteness.complete,
                ),
                detail: SolveDetail(evidence: evidence),
              ),
            );
            await repository.delete(id);
          }
          scenarios.add({
            'rows': size,
            'latencies': {
              for (final entry in samples.entries)
                entry.key: _describe(entry.value),
            },
            'aggregate': {'count': (await repository.aggregate()).count},
          });
        }
        final output = File('benchmarks/results/drift-repository.json');
        await output.parent.create(recursive: true);
        await output.writeAsString(
          const JsonEncoder.withIndent('  ').convert({
            'measurement':
                'Drift background isolate + repository round trip; Flutter test VM; NO UI acceptance',
            'run_at_utc': DateTime.now().toUtc().toIso8601String(),
            'dart': Platform.version,
            'os': Platform.operatingSystemVersion,
            'conditions':
                'warm connection; OS caches uncontrolled; 50 summaries per page; 100 samples per operation',
            'fixture':
                'same Python-generated 2m mixed summary/detail/pose fixture; then reduced to first 1m synthetic records',
            'scenarios': scenarios,
          }),
        );
      } finally {
        await database.close();
      }
    },
    skip: fixturePath.isEmpty,
    timeout: const Timeout(Duration(minutes: 10)),
  );
}

Map<String, Object> _describe(List<double> raw) {
  final sorted = raw.toList()..sort();
  double percentile(int p) =>
      sorted[((p / 100 * sorted.length).ceil() - 1).clamp(
        0,
        sorted.length - 1,
      )];
  return {
    'p50_ms': percentile(50),
    'p95_ms': percentile(95),
    'p99_ms': percentile(99),
    'worst_ms': sorted.last,
    'samples': raw.length,
    'raw_ms': raw,
  };
}
