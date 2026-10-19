#!/usr/bin/env python3
"""Run all pinned current-to-target pairs through the actual exported C ABI."""
import ctypes
import hashlib
import json
import math
import platform
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parent.parent
library_path = Path(sys.argv[1]).resolve()
output_directory = Path(sys.argv[2]).resolve()
output_directory.mkdir(parents=True, exist_ok=True)
library = ctypes.CDLL(str(library_path))
library.tt_m2p_solve.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_char_p,
    ctypes.c_size_t, ctypes.c_int32, ctypes.c_void_p, ctypes.c_size_t,
    ctypes.POINTER(ctypes.c_int32), ctypes.POINTER(ctypes.c_double)]
library.tt_m2p_solve.restype = ctypes.c_int32
library.tt_m2p_initialize.restype = ctypes.c_int32
fixtures_path = root / 'fixtures/cases.json'
fixtures = json.loads(fixtures_path.read_text())
assert len(fixtures) == 1506 and len({case['id'] for case in fixtures}) == 1506


def solve(case):
    moves = ctypes.create_string_buffer(64)
    count = ctypes.c_int32()
    elapsed = ctypes.c_double()
    status = library.tt_m2p_solve(case['current'].encode(), 54, case['target'].encode(),
        54, 100000000, moves, 64, ctypes.byref(count), ctypes.byref(elapsed))
    tokens = moves.value.decode().split()
    assert status == 0, (case['id'], status)
    assert count.value == len(tokens) <= 20
    assert all(token[0] in 'URFDLB' and (len(token) == 1 or len(token) == 2 and token[1] in "2'") for token in tokens)
    return {'id': case['id'], 'group': case['group'], 'ms': elapsed.value,
        'steps': count.value, 'moves': tokens, 'status': status}


start = time.perf_counter()
assert library.tt_m2p_initialize() == 0
initialization_ms = (time.perf_counter() - start) * 1000
for case in fixtures[:100]:
    solve(case)
rows = [solve(case) for case in fixtures]


def summarize(group):
    times = sorted(row['ms'] for row in group)
    return {'count': len(times), 'mean_ms': sum(times) / len(times),
        **{label: times[max(0, math.ceil(len(times) * q) - 1)]
            for label, q in [('p50_ms', .5), ('p95_ms', .95), ('p99_ms', .99), ('max_ms', 1)]},
        'max_steps': max(row['steps'] for row in group)}


report = {'source_commit': 'db0ee5f431178f2153f9aa60581bd6ca59e89391',
    'platform': platform.platform(), 'architecture': platform.machine(),
    'compiler': subprocess.check_output(['clang++', '--version'], text=True).splitlines()[0],
    'fixture_sha256': hashlib.sha256(fixtures_path.read_bytes()).hexdigest(),
    'scope': 'C ABI warm call, includes input conversion, mutex and independent geometric verification; excludes Dart, UI and Bluetooth',
    'warmups': 100, 'initialization_ms': initialization_ms, 'correct': 1506,
    'failed': 0, 'verification': 'Every successful C ABI call independently applies its facelet permutation moves to current and compares all 54 target stickers before publishing output.',
    'summary': summarize(rows), 'by_group': {name: summarize([r for r in rows if r['group'] == name])
        for name in sorted({row['group'] for row in rows})},
    'platform_validation': {'macos_arm64': 'passed on this host' if platform.system() == 'Darwin' and platform.machine() == 'arm64' else 'not run',
        'windows_x64': 'pending Windows toolchain and runtime', 'windows_arm64': 'pending Windows toolchain and physical device'},
    'slowest': sorted(rows, key=lambda row: row['ms'], reverse=True)[:10]}
(output_directory / 'regression.json').write_text(json.dumps(report, indent=2) + '\n')
with (output_directory / 'regression.tsv').open('w') as output:
    output.write('id\tgroup\tms\tsteps\tstatus\tmoves\n')
    for row in rows:
        output.write(f"{row['id']}\t{row['group']}\t{row['ms']:.9f}\t{row['steps']}\t{row['status']}\t{' '.join(row['moves'])}\n")
print(json.dumps(report, indent=2))
