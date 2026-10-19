#!/usr/bin/env python3
"""Create a disposable 2m-row fixture for drift_repository_benchmark.dart."""
import argparse
from pathlib import Path
import re
import sqlite3

import sqlite_benchmark as fixture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=False)
    path = args.directory / 'traintimer.sqlite'
    connection = sqlite3.connect(path)
    try:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA synchronous=NORMAL')
        connection.execute('PRAGMA foreign_keys=ON')
        schema = (fixture.HERE.parent / 'lib/data/database/schema.dart').read_text()
        for statement in re.findall(r"r'''(.*?)'''", schema, flags=re.S):
            connection.execute(statement)
        connection.execute('PRAGMA user_version=1')
        connection.executemany('INSERT INTO sessions(id,name,puzzle) VALUES(?,?,?)',
            [('million-session', 'Million-row session', '333')] +
            [(f'session-{index:02d}', f'Session {index}', '333') for index in range(20)])
        connection.commit()
        fixture.generate(connection, 0, 2000000, fixture.templates())
        fixture.rebuild(connection)
        connection.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    finally:
        connection.close()
    print(f'Disposable fixture: {path}')


if __name__ == '__main__':
    main()
