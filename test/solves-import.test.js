import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSolveImport } from '../src/solves-import.js';
import { solvesToCsv } from '../src/solves-export.js';

test('parses TrainTimer JSON exports', () => {
  const parsed = parseSolveImport('solves.json', JSON.stringify({
    sessions: [{ id: 'default', name: '默认' }],
    solves: [{ id: 'a', durationMs: 10000 }],
  }));

  assert.equal(parsed.source, 'json');
  assert.deepEqual(parsed.sessions, [{ id: 'default', name: '默认' }]);
  assert.deepEqual(parsed.solves, [{ id: 'a', durationMs: 10000 }]);
});

test('parses exported CSV solves and sessions', () => {
  const csv = [
    'id,sessionId,sessionName,createdAt,durationMs,duration,penalty,effectiveDurationMs,effectiveDuration,scramble,scrambleSource,scramblePuzzle,inspectionEnabled,timerSource,bluetoothMoves,bluetoothMoveCount,bluetoothTps,bluetoothDeviceName,bluetoothProtocols,bluetoothSources,tags,comment',
    `s1,oh,OH,2026-05-23T00:00:00.000Z,12345,12.345,+2,14345,14.345,"R, U",tnoodle,four,true,bluetooth,"R U2 F'",3,0.243,GoCube,gocube-move,0x0003,PLL;慢十字,"PLL ""lockup"""`,
    's2,default,默认,2026-05-23T00:01:00.000Z,62000,1:02.000,ok,62000,1:02.000,U,tnoodle,three,false,manual,,,,,,,,',
  ].join('\n');

  const parsed = parseSolveImport('solves.csv', csv);

  assert.equal(parsed.source, 'csv');
  assert.deepEqual(parsed.sessions, [
    { id: 'oh', name: 'OH', scramblePuzzle: 'four' },
    { id: 'default', name: '默认', scramblePuzzle: 'three' },
  ]);
  assert.deepEqual(parsed.solves, [
    {
      id: 's1',
      sessionId: 'oh',
      createdAt: '2026-05-23T00:00:00.000Z',
      durationMs: 12345,
      duration: '12.345',
      penalty: '+2',
      scramble: 'R, U',
      scrambleSource: 'tnoodle',
      scramblePuzzle: 'four',
      inspectionEnabled: true,
      timerSource: 'bluetooth',
      bluetoothMoves: ['R', 'U2', "F'"],
      bluetoothMoveCount: 3,
      bluetoothTps: 0.243,
      bluetoothDeviceName: 'GoCube',
      bluetoothProtocols: ['gocube-move'],
      bluetoothSources: ['0x0003'],
      tags: ['PLL', '慢十字'],
      comment: 'PLL "lockup"',
    },
    {
      id: 's2',
      sessionId: 'default',
      createdAt: '2026-05-23T00:01:00.000Z',
      durationMs: 62000,
      duration: '1:02.000',
      penalty: 'ok',
      scramble: 'U',
      scrambleSource: 'tnoodle',
      scramblePuzzle: 'three',
      inspectionEnabled: false,
      timerSource: 'manual',
      bluetoothMoves: [],
      bluetoothMoveCount: undefined,
      bluetoothTps: undefined,
      bluetoothDeviceName: '',
      bluetoothProtocols: [],
      bluetoothSources: [],
      tags: [],
      comment: '',
    },
  ]);
});

test('round-trips TrainTimer CSV timing, CFOP, and OP metadata', () => {
  const solve = {
    id: 'op1',
    sessionId: 'default',
    createdAt: '2026-06-03T10:00:00.000Z',
    durationMs: 1500,
    duration: '1.500',
    penalty: 'ok',
    effectiveDurationMs: 1500,
    effectiveDuration: '1.500',
    scramble: "R U R'",
    scrambleSource: 'test',
    scramblePuzzle: 'three',
    inspectionEnabled: false,
    timerSource: 'bluetooth',
    timerStartedAt: '2026-06-03T09:59:58.500Z',
    timerStartedAtMs: 1780451998500,
    timerFinishedAt: '2026-06-03T10:00:00.000Z',
    timerFinishedAtMs: 1780452000000,
    bluetoothMoves: ['R', 'U', "R'"],
    bluetoothMoveLog: [
      { step: 1, move: 'R', elapsedMs: 300, timestampMs: 1780451998800, solveStartedAtMs: 1780451998500 },
      { step: 2, move: 'U', elapsedMs: 900, timestampMs: 1780451999400, solveStartedAtMs: 1780451998500 },
      { step: 3, move: "R'", elapsedMs: 1500, timestampMs: 1780452000000, solveStartedAtMs: 1780451998500 },
    ],
    bluetoothMoveCount: 3,
    bluetoothTps: 2,
    bluetoothDeviceName: 'GAN',
    bluetoothProtocols: ['gan-gen4'],
    bluetoothSources: ['move'],
    cfopStages: [
      { key: 'oll', label: 'O', name: 'OLL', completed: true, startStep: 1, endStep: 3, durationMs: 1500, observationMs: 300, tps: 2 },
    ],
    opEvents: [
      { kind: 'pll', caseId: 'pll-t', name: 'T Perm', pdfLabel: 'T', startStep: 1, endStep: 3, durationMs: 1500, observationMs: 300, tps: 2, moves: ['R', 'U', "R'"], formulaAccepted: false, formulaReason: 'pll-not-solved' },
    ],
    tags: ['OP'],
    comment: 'with OP metadata',
  };

  const parsed = parseSolveImport(
    'op.csv',
    solvesToCsv([solve], [{ id: 'default', name: 'Default', scramblePuzzle: 'three' }]),
  );

  assert.equal(parsed.source, 'csv');
  assert.equal(parsed.solves[0].timerStartedAt, solve.timerStartedAt);
  assert.equal(parsed.solves[0].timerStartedAtMs, solve.timerStartedAtMs);
  assert.equal(parsed.solves[0].timerFinishedAt, solve.timerFinishedAt);
  assert.equal(parsed.solves[0].timerFinishedAtMs, solve.timerFinishedAtMs);
  assert.deepEqual(parsed.solves[0].bluetoothMoveLog, solve.bluetoothMoveLog);
  assert.deepEqual(parsed.solves[0].cfopStages, solve.cfopStages);
  assert.deepEqual(parsed.solves[0].opEvents, solve.opEvents);
});

test('creates ids for CSV rows without ids', () => {
  let nextId = 0;
  const parsed = parseSolveImport(
    'solves.csv',
    'duration,penalty,scramble\n9.876,ok,R U',
    { createId: () => `generated-${nextId += 1}` },
  );

  assert.equal(parsed.solves[0].id, 'generated-1');
  assert.equal(parsed.solves[0].durationMs, 9876);
});

test('parses csTimer CSV exports', () => {
  let nextId = 0;
  const parsed = parseSolveImport(
    'cstimer.csv',
    [
      'No.;Time;Comment;Scramble;Date;P.1',
      '1;12.345+;"PLL lockup";"R U";2026-05-23 10:00:00;',
      '2;DNF(1:02.500);失误;F2;1716458400;',
    ].join('\n'),
    { createId: () => `cs-${nextId += 1}`, scramblePuzzle: 'two' },
  );

  assert.equal(parsed.source, 'cstimer-csv');
  assert.deepEqual(parsed.sessions, [{ id: 'cstimer-import', name: 'csTimer Import', scramblePuzzle: 'two' }]);
  assert.equal(parsed.solves[0].id, 'cs-1');
  assert.equal(parsed.solves[0].sessionId, 'cstimer-import');
  assert.equal(parsed.solves[0].durationMs, 12345);
  assert.equal(parsed.solves[0].penalty, '+2');
  assert.equal(parsed.solves[0].comment, 'PLL lockup');
  assert.equal(parsed.solves[0].scramble, 'R U');
  assert.equal(parsed.solves[0].scrambleSource, 'cstimer-csv');
  assert.equal(parsed.solves[0].scramblePuzzle, 'two');
  assert.equal(parsed.solves[1].durationMs, 62500);
  assert.equal(parsed.solves[1].penalty, 'dnf');
  assert.equal(parsed.solves[1].comment, '失误');
});

test('parses csTimer JSON backups with session metadata', () => {
  let nextId = 0;
  const exportedAt = 1716458400;
  const parsed = parseSolveImport(
    'cstimer.json',
    JSON.stringify({
      properties: JSON.stringify({
        sessionData: JSON.stringify({
          1: { name: '3x3', scrType: '333' },
          2: { name: '4x4', scramblePuzzle: 'four' },
        }),
      }),
      session1: JSON.stringify([
        [[0, 12345], 'R U', 'clean', exportedAt],
        [[2000, 10000], 'F2', '+2 lockup', exportedAt + 60],
      ]),
      session2: [
        [[-1, 62500], 'L2', 'DNF case', exportedAt + 120],
      ],
    }),
    { createId: () => `json-${nextId += 1}` },
  );

  assert.equal(parsed.source, 'cstimer-json');
  assert.deepEqual(parsed.sessions, [
    { id: 'cstimer-1', name: '3x3', scramblePuzzle: 'three' },
    { id: 'cstimer-2', name: '4x4', scramblePuzzle: 'four' },
  ]);
  assert.deepEqual(parsed.solves.map((solve) => solve.id), ['json-1', 'json-2', 'json-3']);
  assert.equal(parsed.solves[0].sessionId, 'cstimer-1');
  assert.equal(parsed.solves[0].durationMs, 12345);
  assert.equal(parsed.solves[0].penalty, 'ok');
  assert.equal(parsed.solves[0].scramble, 'R U');
  assert.equal(parsed.solves[0].scrambleSource, 'cstimer-json');
  assert.equal(parsed.solves[0].scramblePuzzle, 'three');
  assert.equal(parsed.solves[0].comment, 'clean');
  assert.equal(parsed.solves[0].createdAt, new Date(exportedAt * 1000).toISOString());
  assert.equal(parsed.solves[1].penalty, '+2');
  assert.equal(parsed.solves[2].sessionId, 'cstimer-2');
  assert.equal(parsed.solves[2].scramblePuzzle, 'four');
  assert.equal(parsed.solves[2].penalty, 'dnf');
});

test('parses CubeDesk JSON solves', () => {
  let nextId = 0;
  const parsed = parseSolveImport(
    'cubedesk.json',
    JSON.stringify({
      solves: [
        {
          id: 'cube-1',
          time: 12.345,
          raw_time: 10.345,
          cube_type: '333',
          scramble: "R U R'",
          session_id: 'speed',
          ended_at: 1716458400123,
          plus_two: true,
          notes: 'lockup',
          is_smart_cube: true,
          smart_turns: "R U R'",
          smart_turn_count: 3,
          smart_device_id: 'GAN12',
        },
        {
          id: 'cube-2',
          time: -1,
          raw_time: 62.5,
          cube_type: '444',
          scramble: 'F2',
          session_id: 'big',
          created_at: '2026-05-23T10:00:00.000Z',
          dnf: true,
          trainer_name: 'OLL',
        },
      ],
    }),
    { createId: () => `cube-${nextId += 1}` },
  );

  assert.equal(parsed.source, 'cubedesk-json');
  assert.deepEqual(parsed.sessions, [
    { id: 'cubedesk-json-speed', name: 'CubeDesk speed', scramblePuzzle: 'three' },
    { id: 'cubedesk-json-big', name: 'CubeDesk big', scramblePuzzle: 'four' },
  ]);
  assert.equal(parsed.solves[0].id, 'cube-1');
  assert.equal(parsed.solves[0].sessionId, 'cubedesk-json-speed');
  assert.equal(parsed.solves[0].durationMs, 10345);
  assert.equal(parsed.solves[0].penalty, '+2');
  assert.equal(parsed.solves[0].scrambleSource, 'cubedesk-json');
  assert.equal(parsed.solves[0].scramblePuzzle, 'three');
  assert.equal(parsed.solves[0].createdAt, new Date(1716458400123).toISOString());
  assert.deepEqual(parsed.solves[0].bluetoothMoves, ['R', 'U', "R'"]);
  assert.equal(parsed.solves[0].bluetoothMoveCount, 3);
  assert.equal(parsed.solves[0].timerSource, 'bluetooth');
  assert.deepEqual(parsed.solves[0].bluetoothProtocols, ['cubedesk-smart-cube']);
  assert.deepEqual(parsed.solves[0].bluetoothSources, ['GAN12']);
  assert.equal(parsed.solves[1].durationMs, 62500);
  assert.equal(parsed.solves[1].penalty, 'dnf');
  assert.equal(parsed.solves[1].scramblePuzzle, 'four');
  assert.deepEqual(parsed.solves[1].tags, ['OLL']);
});

test('parses CubeDesk CSV solve text exports', () => {
  let nextId = 0;
  const parsed = parseSolveImport(
    'cubedesk_session.csv',
    [
      'Index,Time,Scramble,Date,Notes,Cube Type',
      '1,12.34+,R U,2026-05-23 10:00:00,plus two,3x3',
      '2,1:02.50,F2,1716458400,slow,4x4',
    ].join('\n'),
    { createId: () => `cdcsv-${nextId += 1}` },
  );

  assert.equal(parsed.source, 'cubedesk-csv');
  assert.deepEqual(parsed.sessions, [{ id: 'cubedesk-import', name: 'CubeDesk Import', scramblePuzzle: 'three' }]);
  assert.deepEqual(parsed.solves.map((solve) => solve.id), ['cdcsv-1', 'cdcsv-2']);
  assert.equal(parsed.solves[0].durationMs, 12340);
  assert.equal(parsed.solves[0].penalty, '+2');
  assert.equal(parsed.solves[0].scramble, 'R U');
  assert.equal(parsed.solves[0].scramblePuzzle, 'three');
  assert.equal(parsed.solves[0].comment, 'plus two');
  assert.equal(parsed.solves[1].durationMs, 62500);
  assert.equal(parsed.solves[1].scramblePuzzle, 'four');
});
