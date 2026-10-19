#!/usr/bin/env python3
"""SQLite-only capacity fixture. This does NOT measure Flutter/Drift/UI latency.

Uses the exact schema in lib/data/database/schema.dart. Default: one million rows
in one session, then two million rows across 21 sessions. Files are ephemeral;
only the environment, query plans and raw latency samples remain in results/.
"""
import argparse
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import re
import signal
import sqlite3
import statistics
import struct
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
SUMMARY = ('id,session_id,puzzle,started_at_us,duration_us,penalty,scramble,note,'
           'source,status,completeness,detail_state,raw_revision,compatibility_json')
ORDER = ' ORDER BY started_at_us DESC,id DESC LIMIT 50'
FIRST = f'SELECT {SUMMARY} FROM solves' + ORDER
PAGE = f'SELECT {SUMMARY} FROM solves WHERE (started_at_us,id)<(?,?)' + ORDER
SESSION = f'SELECT {SUMMARY} FROM solves WHERE session_id=?' + ORDER


def percentiles(samples):
    ordered = sorted(samples)
    return {**{f'p{p}_ms': ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)]
               for p in [50, 95, 99]}, 'worst_ms': max(ordered),
            'samples': len(samples), 'raw_ms': samples}


def timed(callback):
    start = time.perf_counter_ns()
    callback()
    return (time.perf_counter_ns() - start) / 1e6


def templates():
    """Versioned synthetic moves + real compressed quantized quaternion samples.

    Not a production device codec. Each tuple holds 60/100/200 physical moves,
    delta microseconds and sequence; pose has 120 timestamped quaternion samples.
    """
    rng = random.Random(20261018)
    result = []
    for variant in range(128):
        count = [60, 100, 200][variant % 3]
        evidence = b'TTM1' + struct.pack('<H', count)
        evidence += b''.join(struct.pack('<BIH', rng.randrange(18),
                             rng.randrange(70000, 400000), seq)
                             for seq in range(count))
        poses = bytearray(b'TTP1')
        for frame in range(120):
            angle = (frame + variant) * 0.015
            poses.extend(struct.pack('<Hhhhh', 16667, 0,
                         int(math.sin(angle / 2) * 32767), 0,
                         int(math.cos(angle / 2) * 32767)))
        result.append((evidence, gzip.compress(bytes(poses), mtime=0)))
    return result


def generate(connection, start, end, payloads):
    insert = 'INSERT INTO solves(' + SUMMARY + ') VALUES(' + ','.join('?' * 14) + ')'
    seed_at_us = 1767225600000000
    for first in range(start, end, 5000):
        summaries, details, poses = [], [], []
        for index in range(first, min(first + 5000, end)):
            ident = f'{index:032x}'
            session = 'million-session' if index < 1000000 else f'session-{index % 20:02d}'
            has_detail = index % 5 != 0
            # A reproducible spread over dates, with deliberate equal timestamps.
            started = seed_at_us + ((index * 15485863) % 31536000) * 1000000
            summaries.append((ident, session, '333', started,
                8000000 + index % 25000000,
                'dnf' if index % 37 == 0 else 'plusTwo' if index % 19 == 0 else 'none',
                "R U R' F2 D L2 B U2 R2 F' L D2", '', 'synthetic', 'complete',
                'complete' if has_detail else 'summaryOnly',
                'available' if has_detail else 'absent', 1, '{}'))
            evidence, pose = payloads[index % len(payloads)]
            if has_detail:
                details.append((ident, 1, evidence))
                if index % 4 == 0:
                    poses.append((ident, 1, pose))
        with connection:
            connection.executemany(insert, summaries)
            connection.executemany('INSERT INTO solve_details VALUES(?,?,?)', details)
            connection.executemany('INSERT INTO pose_tracks VALUES(?,?,?)', poses)
        if first % 100000 == 0:
            print(f'Generated {min(first + 5000, end):,}/{end:,}', flush=True)


def rebuild(connection):
    # SQLite progress handler checks cancellation during the scan; transaction
    # rollback preserves the previous cache if interrupted.
    with connection:
        connection.execute('DELETE FROM statistics_cache')
        valid = "status='complete' AND penalty!='dnf'"
        values = (f"SUM(status='complete'),SUM({valid}),"
                  f"SUM(CASE WHEN {valid} THEN duration_us + "
                  "CASE penalty WHEN 'plusTwo' THEN 2000000 ELSE 0 END ELSE 0 END),1")
        connection.execute("INSERT INTO statistics_cache SELECT 'global'," + values + ' FROM solves')
        connection.execute("INSERT INTO statistics_cache SELECT 'session:'||session_id," +
                           values + ' FROM solves GROUP BY session_id')


def measure(connection, count, repeats):
    rebuild(connection)
    oldest = connection.execute('SELECT started_at_us,id FROM solves '
                               'ORDER BY started_at_us,id LIMIT 1 OFFSET ?', (count // 2,)).fetchone()
    # OFFSET appears only in untimed fixture cursor selection. Timed pages use
    # the same tuple cursor as the actual repository.
    samples = {name: [] for name in ['first_page', 'deep_cursor_page',
               'million_session', 'session_switch', 'detail_with_pose',
               'insert_with_detail_and_aggregates']}
    for repeat in range(repeats):
        samples['first_page'].append(timed(lambda: connection.execute(FIRST).fetchall()))
        samples['deep_cursor_page'].append(timed(lambda: connection.execute(PAGE, oldest).fetchall()))
        samples['million_session'].append(timed(lambda: connection.execute(SESSION, ('million-session',)).fetchall()))
        session = 'million-session' if count <= 1000000 else f'session-{repeat % 20:02d}'
        samples['session_switch'].append(timed(lambda: connection.execute(SESSION, (session,)).fetchall()))
        ident = f'{4 + repeat * 20:032x}'
        def detail():
            connection.execute('SELECT encoding_version,evidence FROM solve_details WHERE solve_id=?', (ident,)).fetchone()
            connection.execute('SELECT encoding_version,samples FROM pose_tracks WHERE solve_id=?', (ident,)).fetchone()
        samples['detail_with_pose'].append(timed(detail))
        ident = f'benchmark-{repeat:032x}'
        def insert():
            with connection:
                connection.execute(f'INSERT INTO solves({SUMMARY}) VALUES({",".join("?" * 14)})',
                    (ident, 'million-session', '333', 2000000000000000 + repeat,
                     10000000, 'none', 'R U', '', 'synthetic', 'complete', 'complete', 'available', 1, '{}'))
                connection.execute('INSERT INTO solve_details VALUES(?,?,?)', (ident, 1, b'TTM1' + bytes(420)))
                for scope in ['global', 'session:million-session']:
                    connection.execute('''INSERT INTO statistics_cache VALUES(?,1,1,10000000,1)
ON CONFLICT(scope) DO UPDATE SET solve_count=solve_count+1,valid_count=valid_count+1,
total_us=total_us+10000000,revision=revision+1''', (scope,))
                connection.execute('UPDATE database_metadata SET data_revision=data_revision+1')
        samples['insert_with_detail_and_aggregates'].append(timed(insert))
        with connection:
            connection.execute('DELETE FROM solves WHERE id=?', (ident,))
            connection.execute("UPDATE statistics_cache SET solve_count=solve_count-1,"
                               "valid_count=valid_count-1,total_us=total_us-10000000,revision=revision+1 "
                               "WHERE scope IN ('global','session:million-session')")
    samples['statistics_rebuild'] = [timed(lambda: rebuild(connection)) for _ in range(5)]
    plans = {}
    for name, query, arguments in [('first_page', FIRST, ()), ('deep_cursor_page', PAGE, oldest),
                                  ('million_session', SESSION, ('million-session',))]:
        plans[name] = [list(row) for row in connection.execute('EXPLAIN QUERY PLAN ' + query, arguments)]
    return {'rows': count, 'conditions': 'warm connection; OS caches uncontrolled; no Flutter/Drift/UI',
            'latencies': {name: percentiles(items) for name, items in samples.items()},
            'query_plans': plans,
            'record_mix': dict(connection.execute('SELECT detail_state,COUNT(*) FROM solves GROUP BY detail_state')),
            'detail_rows': connection.execute('SELECT COUNT(*) FROM solve_details').fetchone()[0],
            'pose_rows': connection.execute('SELECT COUNT(*) FROM pose_tracks').fetchone()[0],
            'sessions': connection.execute('SELECT COUNT(DISTINCT session_id) FROM solves').fetchone()[0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sizes', type=int, nargs='+', default=[1000000, 2000000])
    parser.add_argument('--repeats', type=int, default=100)
    parser.add_argument('--output', type=Path, default=HERE / 'results' / 'sqlite-capacity.json')
    args = parser.parse_args()
    if args.sizes != sorted(set(args.sizes)) or min(args.sizes) < 1 or args.repeats < 1:
        parser.error('Sizes must be positive and strictly increasing; repeats >= 1')
    schema = (HERE.parent / 'lib/data/database/schema.dart').read_text()
    statements = re.findall(r"r'''(.*?)'''", schema, flags=re.S)
    if len(statements) < 10:
        raise RuntimeError('Schema fixture not found')
    report = {'measurement': 'Python sqlite3 storage microbenchmark; not app acceptance',
              'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'schema_sha256': hashlib.sha256(schema.encode()).hexdigest(),
              'environment': {'platform': platform.platform(), 'machine': platform.machine(),
                  'python': platform.python_version(), 'sqlite': sqlite3.sqlite_version,
                  'logical_cpus': os.cpu_count(), 'run_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                  'journal_mode': 'WAL', 'synchronous': 'NORMAL', 'page_size': 4096},
              'fixture': {'details_fraction': 0.8, 'pose_fraction': 0.2,
                  'moves_per_detail': [60, 100, 200], 'pose_samples': 120,
                  'pose_encoding': 'gzip of delta time + 4 int16 normalized quaternion components',
                  'synthetic': True, 'schema_source': 'lib/data/database/schema.dart'},
              'scenarios': []}
    if platform.system() == 'Darwin':
        for key in ['hw.memsize', 'machdep.cpu.brand_string']:
            result = subprocess.run(['sysctl', '-n', key], text=True, capture_output=True)
            report['environment'][key] = result.stdout.strip() or 'unavailable'
        result = subprocess.run(['system_profiler', 'SPHardwareDataType', '-json'],
                                text=True, capture_output=True)
        try:
            hardware = json.loads(result.stdout)['SPHardwareDataType'][0]
            report['environment']['hardware'] = {key: hardware[key] for key in
                ['machine_name', 'machine_model', 'chip_type', 'physical_memory'] if key in hardware}
        except (ValueError, KeyError, IndexError):
            report['environment']['hardware'] = 'unavailable'
    cancelled = False
    def cancel(*_):
        nonlocal cancelled
        cancelled = True
    signal.signal(signal.SIGINT, cancel)
    with tempfile.TemporaryDirectory(prefix='traintimer-storage-') as temporary:
        path = Path(temporary) / 'capacity.sqlite'
        connection = sqlite3.connect(path)
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA synchronous=NORMAL')
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA cache_size=-32768')
        connection.set_progress_handler(lambda: int(cancelled), 10000)
        try:
            for statement in statements:
                connection.execute(statement)
            connection.execute('PRAGMA user_version=1')
            connection.executemany('INSERT INTO sessions(id,name,puzzle) VALUES(?,?,?)',
                [('million-session', 'Million-row session', '333')] +
                [(f'session-{index:02d}', f'Session {index}', '333') for index in range(20)])
            connection.commit()
            previous = 0
            payloads = templates()
            for size in args.sizes:
                started = time.perf_counter()
                generate(connection, previous, size, payloads)
                connection.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                scenario = measure(connection, size, args.repeats)
                connection.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                scenario['database_bytes'] = path.stat().st_size
                scenario['scenario_seconds'] = time.perf_counter() - started
                scenario['integrity_check'] = connection.execute('PRAGMA quick_check').fetchone()[0]
                report['scenarios'].append(scenario)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(report, indent=2) + '\n')
                print(json.dumps({key: value for key, value in scenario.items() if key not in ['latencies', 'query_plans']}), flush=True)
                previous = size
        finally:
            connection.close()
    print(f'Report: {args.output}', flush=True)


if __name__ == '__main__':
    main()
