#!/usr/bin/env python3
"""Hash only selected project sources, with safe project-relative report paths."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
directories = ['lib', 'native/min2phase/src', 'native/min2phase/include',
    'native/min2phase/vendor', 'tool/manual_host']
required = ['pubspec.yaml', 'pubspec.lock', 'macos/Runner/MainFlutterWindow.swift',
    'macos/Runner/AppDelegate.swift', 'macos/Runner/Info.plist',
    'native/min2phase/SOURCE.json', 'native/min2phase/CMakeLists.txt',
    'native/min2phase/NOTICE', 'native/min2phase/LICENSE',
    'native/min2phase/min2phase-cxx-portability.patch', 'tool/build-macos-prototype.sh']
files = {root / name for name in required}
for directory in directories:
    base = root / directory
    if not base.is_dir():
        raise SystemExit(f'Missing source directory: {directory}')
    files.update(file for file in base.rglob('*') if file.is_file()
        and '__pycache__' not in file.parts)
hashes = {}
for file in sorted(files):
    # Never report external paths or follow a source symlink outside the project.
    file.resolve().relative_to(root)
    name = file.relative_to(root).as_posix()
    hashes[name] = hashlib.sha256(file.read_bytes()).hexdigest()
encoded = json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()
snapshot = dict(algorithm='SHA-256', sha256=hashlib.sha256(encoded).hexdigest(), files=hashes)
Path(sys.argv[2]).write_text(json.dumps(snapshot, indent=2) + '\n')
