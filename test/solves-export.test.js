import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExportPayload,
  exportHistoryForSolves,
  safeExportFilename,
  scopedExportHistory,
  selectedExportHistory,
  solvesToCsv,
  solvesToCstimerCsv,
  solvesToCstimerJson,
  solvesToTextTable,
} from '../src/solves-export.js';

const sessions = [
  { id: 'default', name: 'Default' },
  { id: 'oh', name: 'One Handed' },
];

const solves = [
  {
    id: 'a',
    sessionId: 'default',
    createdAt: '2026-05-23T10:00:00.000Z',
    durationMs: 10000,
    duration: '10.000',
    penalty: 'ok',
    effectiveDurationMs: 10000,
    effectiveDuration: '10.000',
    scramble: 'R U',
    scrambleSource: 'test',
    scramblePuzzle: 'three',
    inspectionEnabled: false,
    comment: 'normal',
  },
  {
    id: 'b',
    sessionId: 'oh',
    createdAt: '2026-05-23T10:01:00.000Z',
    durationMs: 12000,
    duration: '12.000',
    penalty: '+2',
    effectiveDurationMs: 14000,
    effectiveDuration: '14.000',
    scramble: 'F, R',
    scrambleSource: 'test',
    scramblePuzzle: 'four',
    inspectionEnabled: true,
    timerSource: 'bluetooth',
    timerStartedAt: '2026-05-23T10:00:58.000Z',
    timerStartedAtMs: 1779530458000,
    timerFinishedAt: '2026-05-23T10:01:10.000Z',
    timerFinishedAtMs: 1779530470000,
    bluetoothMoves: ['R', 'U2', "F'"],
    bluetoothMoveLog: [
      { step: 1, move: 'R', elapsedMs: 300, timestampMs: 1779530458300, solveStartedAtMs: 1779530458000 },
      { step: 2, move: 'U2', elapsedMs: 700, timestampMs: 1779530458700, solveStartedAtMs: 1779530458000 },
      { step: 3, move: "F'", elapsedMs: 1200, timestampMs: 1779530459200, solveStartedAtMs: 1779530458000 },
    ],
    bluetoothMoveCount: 3,
    bluetoothTps: 0.25,
    bluetoothDeviceName: 'GoCube',
    bluetoothProtocols: ['gocube-move'],
    bluetoothSources: ['0x0003'],
    cfopStages: [
      { key: 'oll', label: 'O', name: 'OLL', completed: true, startStep: 1, endStep: 2, durationMs: 700, observationMs: 300, tps: 2.86 },
    ],
    opEvents: [
      { kind: 'pll', caseId: 'pll-t', name: 'T Perm', pdfLabel: 'T', startStep: 1, endStep: 3, durationMs: 1200, observationMs: 300, tps: 2.5, moves: ['R', 'U2', "F'"], formulaAccepted: false, formulaReason: 'pll-not-solved' },
    ],
    tags: ['PLL', '慢十字'],
    comment: 'PLL "lockup"',
  },
];

test('scopes exports to a session', () => {
  const scoped = scopedExportHistory({ sessions, solves }, 'session', 'oh');
  assert.deepEqual(scoped.sessions, [{ id: 'oh', name: 'One Handed' }]);
  assert.deepEqual(scoped.solves.map((solve) => solve.id), ['b']);
});

test('builds selected exports with only used sessions', () => {
  const selected = selectedExportHistory(solves, sessions, new Set(['b']));
  assert.deepEqual(selected.sessions, [{ id: 'oh', name: 'One Handed' }]);
  assert.deepEqual(selected.solves.map((solve) => solve.id), ['b']);
});

test('builds listed exports in provided order', () => {
  const listed = exportHistoryForSolves([solves[1], solves[0]], sessions);
  assert.deepEqual(listed.solves.map((solve) => solve.id), ['b', 'a']);
  assert.deepEqual(listed.sessions, sessions);
});

test('exports CSV with stable columns and quoting', () => {
  const csv = solvesToCsv([solves[1]], sessions);
  assert.equal(csv.split('\n')[0], 'id,sessionId,sessionName,createdAt,durationMs,duration,penalty,effectiveDurationMs,effectiveDuration,scramble,scrambleSource,scramblePuzzle,inspectionEnabled,timerSource,timerStartedAt,timerStartedAtMs,timerFinishedAt,timerFinishedAtMs,bluetoothMoves,bluetoothMoveLog,bluetoothMoveCount,bluetoothTps,bluetoothDeviceName,bluetoothProtocols,bluetoothSources,cfopStages,opEvents,tags,comment');
  assert.match(csv, /"F, R"/);
  assert.match(csv, /test,four,true,bluetooth,2026-05-23T10:00:58\.000Z,1779530458000,2026-05-23T10:01:10\.000Z,1779530470000,R U2 F',/);
  assert.match(csv, /""timestampMs"":1779530458300/);
  assert.match(csv, /""key"":""oll""/);
  assert.match(csv, /""kind"":""pll""/);
  assert.match(csv, /,3,0.25,GoCube,gocube-move,0x0003/);
  assert.match(csv, /PLL;慢十字/);
  assert.match(csv, /"PLL ""lockup"""/);
});

test('exports csTimer-compatible CSV rows', () => {
  const csv = solvesToCstimerCsv(solves);
  const rows = csv.trim().split('\n');

  assert.equal(rows[0], 'No.;Time;Comment;Scramble;Date;P.1');
  assert.match(rows[0], /;/);
  assert.match(rows[1], /^1;10\.000;normal;R U;.+;$/);
  assert.match(rows[2], /^2;12\.000\+;"PLL ""lockup""";F, R;.+;$/);
});

test('builds copyable text tables with solve metadata', () => {
  const text = solvesToTextTable(solves, sessions, {
    scope: '全部会话 · 筛选 2 / 2 条',
    exportedAt: '2026-05-23T12:00:00.000Z',
  });
  const rows = text.trim().split('\n');

  assert.equal(rows[0], 'TrainTimer 成绩列表');
  assert.equal(rows[1], '范围: 全部会话 · 筛选 2 / 2 条');
  assert.equal(rows[2], '数量: 2');
  assert.equal(rows[5], '#\t成绩\t罚时\t来源\t转动\tTPS\t时间\t会话\t类型\t标签\t备注\t打乱');
  assert.equal(rows[6], '1\t10.000\tOK\t手动\t\t\t2026-05-23T10:00:00.000Z\tDefault\t3x3\t\tnormal\tR U');
  assert.equal(rows[7], '2\t14.000+\t+2\t蓝牙\t3\t0.250\t2026-05-23T10:01:00.000Z\tOne Handed\t4x4\tPLL, 慢十字\tPLL "lockup"\tF, R');
});

test('exports DNF solves with csTimer raw time wrapper', () => {
  const csv = solvesToCstimerCsv([{ ...solves[0], penalty: 'dnf' }]);

  assert.match(csv, /DNF\(10\.000\)/);
});

test('exports csTimer JSON backups with sessions and penalties', () => {
  const json = solvesToCstimerJson(solves, sessions);
  const payload = JSON.parse(json);
  const properties = JSON.parse(payload.properties);
  const sessionData = JSON.parse(properties.sessionData);
  const session1 = JSON.parse(payload.session1);
  const session2 = JSON.parse(payload.session2);

  assert.deepEqual(sessionData, {
    1: { name: 'Default', scramblePuzzle: 'three', scrType: '333' },
    2: { name: 'One Handed', scramblePuzzle: 'four', scrType: '444' },
  });
  assert.deepEqual(session1, [
    [[0, 10000], 'R U', 'normal', 1779530400],
  ]);
  assert.deepEqual(session2, [
    [[2000, 12000], 'F, R', 'PLL "lockup"', 1779530460],
  ]);
});

test('exports DNF solves in csTimer JSON backups', () => {
  const payload = JSON.parse(solvesToCstimerJson([{ ...solves[0], penalty: 'dnf' }], sessions));
  const session1 = JSON.parse(payload.session1);

  assert.equal(session1[0][0][0], -1);
  assert.equal(session1[0][0][1], 10000);
});

test('builds JSON export metadata', () => {
  const payload = createExportPayload('selected', sessions, solves, '2026-05-23T12:00:00.000Z');
  assert.equal(payload.version, 2);
  assert.equal(payload.scope, 'selected');
  assert.equal(payload.exportedAt, '2026-05-23T12:00:00.000Z');
});

test('sanitizes export filenames', () => {
  assert.equal(safeExportFilename('OH Session #1.json'), 'OH-Session-1-json');
  assert.equal(safeExportFilename('中文'), 'session');
});
