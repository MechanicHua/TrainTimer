import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSolveImport } from '../src/solves-import.js';

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
    'id,sessionId,sessionName,createdAt,durationMs,duration,penalty,effectiveDurationMs,effectiveDuration,scramble,scrambleSource,inspectionEnabled,timerSource,bluetoothMoves,tags,comment',
    `s1,oh,OH,2026-05-23T00:00:00.000Z,12345,12.345,+2,14345,14.345,"R, U",tnoodle,true,bluetooth,"R U2 F'",PLL;慢十字,"PLL ""lockup"""`,
    's2,default,默认,2026-05-23T00:01:00.000Z,62000,1:02.000,ok,62000,1:02.000,U,tnoodle,false,manual,,,',
  ].join('\n');

  const parsed = parseSolveImport('solves.csv', csv);

  assert.equal(parsed.source, 'csv');
  assert.deepEqual(parsed.sessions, [
    { id: 'oh', name: 'OH' },
    { id: 'default', name: '默认' },
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
      inspectionEnabled: true,
      timerSource: 'bluetooth',
      bluetoothMoves: ['R', 'U2', "F'"],
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
      inspectionEnabled: false,
      timerSource: 'manual',
      bluetoothMoves: [],
      tags: [],
      comment: '',
    },
  ]);
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
    { createId: () => `cs-${nextId += 1}` },
  );

  assert.equal(parsed.source, 'cstimer-csv');
  assert.deepEqual(parsed.sessions, [{ id: 'cstimer-import', name: 'csTimer Import' }]);
  assert.equal(parsed.solves[0].id, 'cs-1');
  assert.equal(parsed.solves[0].sessionId, 'cstimer-import');
  assert.equal(parsed.solves[0].durationMs, 12345);
  assert.equal(parsed.solves[0].penalty, '+2');
  assert.equal(parsed.solves[0].comment, 'PLL lockup');
  assert.equal(parsed.solves[0].scramble, 'R U');
  assert.equal(parsed.solves[0].scrambleSource, 'cstimer-csv');
  assert.equal(parsed.solves[1].durationMs, 62500);
  assert.equal(parsed.solves[1].penalty, 'dnf');
  assert.equal(parsed.solves[1].comment, '失误');
});
