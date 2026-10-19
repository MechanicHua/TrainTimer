/// Hand-written SQL keeps the prototype independent of code generation.
/// The storage benchmark reads these exact statements as its schema fixture.
const schemaStatements = <String>[
  r'''
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  puzzle TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
)
''',
  r'''
CREATE TABLE solves (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  puzzle TEXT NOT NULL,
  started_at_us INTEGER NOT NULL,
  duration_us INTEGER NOT NULL CHECK(duration_us >= 0),
  penalty TEXT NOT NULL CHECK(penalty IN ('none', 'plusTwo', 'dnf')),
  scramble TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('complete', 'interrupted')),
  completeness TEXT NOT NULL CHECK(completeness IN ('complete', 'missingMoves', 'summaryOnly')),
  detail_state TEXT NOT NULL CHECK(detail_state IN ('available', 'absent', 'pruned')),
  raw_revision INTEGER NOT NULL DEFAULT 1,
  compatibility_json TEXT NOT NULL DEFAULT '{}'
)
''',
  r'''
CREATE INDEX solves_time ON solves(started_at_us DESC, id DESC)
''',
  r'''
CREATE INDEX solves_session_time ON solves(session_id, started_at_us DESC, id DESC)
''',
  r'''
CREATE TABLE solve_details (
  solve_id TEXT PRIMARY KEY REFERENCES solves(id) ON DELETE CASCADE,
  encoding_version INTEGER NOT NULL,
  evidence BLOB NOT NULL
)
''',
  r'''
CREATE TABLE pose_tracks (
  solve_id TEXT PRIMARY KEY REFERENCES solves(id) ON DELETE CASCADE,
  encoding_version INTEGER NOT NULL,
  samples BLOB NOT NULL
)
''',
  r'''
CREATE TABLE solve_analysis (
  solve_id TEXT PRIMARY KEY REFERENCES solves(id) ON DELETE CASCADE,
  algorithm_version TEXT NOT NULL,
  raw_revision INTEGER NOT NULL,
  result_json TEXT NOT NULL
)
''',
  r'''
CREATE TABLE statistics_cache (
  scope TEXT PRIMARY KEY,
  solve_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  total_us INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0
)
''',
  r'''
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)
''',
  r'''
CREATE TABLE devices (id TEXT PRIMARY KEY, descriptor_json TEXT NOT NULL)
''',
  r'''
CREATE TABLE active_attempts (
  id TEXT PRIMARY KEY,
  checkpoint_json TEXT NOT NULL,
  last_sequence INTEGER NOT NULL,
  updated_at_us INTEGER NOT NULL
)
''',
  r'''
CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at_us INTEGER NOT NULL
)
''',
  r'''
CREATE TABLE database_metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  data_revision INTEGER NOT NULL DEFAULT 0
)
''',
  r'''
INSERT INTO database_metadata(singleton) VALUES(1)
''',
];
