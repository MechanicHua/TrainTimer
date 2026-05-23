import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSession,
  deleteSession,
  deleteSolves,
  duplicateSession,
  formatTime,
  loadHistory,
  loadSolves,
  mergeSession,
  moveSolves,
  replaceSolves,
  saveSolve,
  summarizeSolves,
  updateSolve,
  updateSolves,
} from '../src/history.js';

test('formats solve times with millisecond precision', () => {
  assert.equal(formatTime(1234.4), '1.234');
  assert.equal(formatTime(61234.4), '1:01.234');
});

test('saves and summarizes solve history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await saveSolve({ durationMs: 10000 }, file);
  await saveSolve({ durationMs: 12000 }, file);

  const solves = await loadSolves(file);
  assert.equal(solves.length, 2);
  assert.deepEqual(summarizeSolves(solves), {
    count: 2,
    validCount: 2,
    dnfCount: 0,
    plus2Count: 0,
    bluetoothSolveCount: 0,
    best: 10000,
    worst: 12000,
    latest: 12000,
    average: 11000,
    standardDeviation: 1000,
    averageBluetoothMoveCount: null,
    averageBluetoothTps: null,
    bestBluetoothTps: null,
    mo3: null,
    ao5: null,
    ao12: null,
    ao50: null,
    ao100: null,
    bestMo3: null,
    bestAo5: null,
    bestAo12: null,
    bestAo50: null,
    bestAo100: null,
  });
});

test('updates penalties and deletes solves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await replaceSolves(
    [
      { id: 'a', durationMs: 10000, comment: 'PLL lockup' },
      { id: 'b', durationMs: 12000 },
    ],
    file,
  );

  const update = await updateSolve('a', { penalty: '+2' }, file);
  assert.equal(update.solve.effectiveDurationMs, 12000);
  assert.equal(update.solve.comment, 'PLL lockup');

  const timeUpdate = await updateSolve('a', { durationMs: 13000, duration: '13.000' }, file);
  assert.equal(timeUpdate.solve.duration, '13.000');
  assert.equal(timeUpdate.solve.effectiveDurationMs, 15000);

  const scrambleUpdate = await updateSolve('a', { scramble: "R U R'", scrambleSource: 'manual-edit' }, file);
  assert.equal(scrambleUpdate.solve.scramble, "R U R'");
  assert.equal(scrambleUpdate.solve.scrambleSource, 'manual-edit');

  const afterDelete = await deleteSolves(['b'], file);
  assert.deepEqual(afterDelete.map((solve) => solve.id), ['a']);
  assert.deepEqual(summarizeSolves(afterDelete), {
    count: 1,
    validCount: 1,
    dnfCount: 0,
    plus2Count: 1,
    bluetoothSolveCount: 0,
    best: 15000,
    worst: 15000,
    latest: 15000,
    average: 15000,
    standardDeviation: 0,
    averageBluetoothMoveCount: null,
    averageBluetoothTps: null,
    bestBluetoothTps: null,
    mo3: null,
    ao5: null,
    ao12: null,
    ao50: null,
    ao100: null,
    bestMo3: null,
    bestAo5: null,
    bestAo12: null,
    bestAo50: null,
    bestAo100: null,
  });
});

test('moves selected solves to another session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');
  const session = await createSession('OH', file);

  await replaceSolves(
    [
      { id: 'a', durationMs: 10000, sessionId: 'default' },
      { id: 'b', durationMs: 12000, sessionId: 'default' },
    ],
    file,
    session.sessions,
  );

  const moved = await moveSolves(['b'], session.session.id, file);
  assert.equal(moved.solves.find((solve) => solve.id === 'a').sessionId, 'default');
  assert.equal(moved.solves.find((solve) => solve.id === 'b').sessionId, session.session.id);
  assert.equal(moved.sessions.some((item) => item.id === session.session.id), true);
});

test('duplicates a session with copied solve ids and metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');
  const session = await createSession('OH', file);

  await replaceSolves(
    [
      { id: 'a', durationMs: 10000, sessionId: 'default' },
      {
        id: 'b',
        durationMs: 12000,
        sessionId: session.session.id,
        comment: 'good solve',
        tags: ['PLL'],
        timerSource: 'bluetooth',
        bluetoothMoves: ['R', 'U'],
      },
    ],
    file,
    session.sessions,
  );

  const duplicated = await duplicateSession(session.session.id, 'OH 备份', file);
  assert.equal(duplicated.session.name, 'OH 备份');
  assert.notEqual(duplicated.session.id, session.session.id);
  assert.equal(duplicated.sessions.some((item) => item.id === duplicated.session.id), true);

  const history = await loadHistory(file);
  const originalSolves = history.solves.filter((solve) => solve.sessionId === session.session.id);
  const copiedSolves = history.solves.filter((solve) => solve.sessionId === duplicated.session.id);
  assert.equal(originalSolves.length, 1);
  assert.equal(copiedSolves.length, 1);
  assert.notEqual(copiedSolves[0].id, originalSolves[0].id);
  assert.equal(copiedSolves[0].durationMs, originalSolves[0].durationMs);
  assert.equal(copiedSolves[0].comment, 'good solve');
  assert.deepEqual(copiedSolves[0].tags, ['PLL']);
  assert.deepEqual(copiedSolves[0].bluetoothMoves, ['R', 'U']);
  assert.equal(await duplicateSession('missing-session', 'missing', file), null);
});

test('merges a non-default session into another session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');
  const oh = await createSession('OH', file);
  const blind = await createSession('Blind', file);

  await replaceSolves(
    [
      { id: 'default-solve', durationMs: 9000, sessionId: 'default' },
      { id: 'oh-solve', durationMs: 10000, sessionId: oh.session.id, tags: ['OH'] },
      { id: 'blind-solve', durationMs: 60000, sessionId: blind.session.id },
    ],
    file,
    blind.sessions,
  );

  const merged = await mergeSession(oh.session.id, 'default', file);
  assert.equal(merged.sourceSession.name, 'OH');
  assert.equal(merged.targetSession.id, 'default');

  const history = await loadHistory(file);
  assert.equal(history.sessions.some((session) => session.id === oh.session.id), false);
  assert.equal(history.sessions.some((session) => session.id === blind.session.id), true);
  assert.equal(history.solves.find((solve) => solve.id === 'oh-solve').sessionId, 'default');
  assert.deepEqual(history.solves.find((solve) => solve.id === 'oh-solve').tags, ['OH']);
  assert.equal(history.solves.find((solve) => solve.id === 'blind-solve').sessionId, blind.session.id);
  assert.equal(await mergeSession('default', blind.session.id, file), null);
  assert.equal(await mergeSession(blind.session.id, blind.session.id, file), null);
  assert.equal(await mergeSession('missing', 'default', file), null);
});

test('updates penalties for selected solves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await replaceSolves(
    [
      { id: 'a', durationMs: 10000, penalty: 'ok' },
      { id: 'b', durationMs: 12000, penalty: 'ok' },
      { id: 'c', durationMs: 15000, penalty: 'ok' },
    ],
    file,
  );

  const result = await updateSolves(['a', 'c'], { penalty: 'dnf' }, file);
  assert.equal(result.solves.find((solve) => solve.id === 'a').effectiveDurationMs, null);
  assert.equal(result.solves.find((solve) => solve.id === 'b').penalty, 'ok');
  assert.equal(result.solves.find((solve) => solve.id === 'c').penalty, 'dnf');
});

test('normalizes and updates solve tags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await replaceSolves(
    [
      { id: 'a', durationMs: 10000, tags: 'PLL, 慢十字, PLL' },
      { id: 'b', durationMs: 12000, timerSource: 'bluetooth', bluetoothMoves: 'R U2 F′ invalid' },
    ],
    file,
  );

  let history = await loadHistory(file);
  assert.deepEqual(history.solves.find((solve) => solve.id === 'a').tags, ['PLL', '慢十字']);
  assert.deepEqual(history.solves.find((solve) => solve.id === 'b').tags, []);
  assert.equal(history.solves.find((solve) => solve.id === 'a').timerSource, 'manual');
  assert.deepEqual(history.solves.find((solve) => solve.id === 'b').bluetoothMoves, ['R', 'U2', "F'"]);
  assert.equal(history.solves.find((solve) => solve.id === 'b').bluetoothMoveCount, 3);
  assert.equal(history.solves.find((solve) => solve.id === 'b').bluetoothTps, 0.25);

  await updateSolves(['a', 'b'], { tags: ['失误', 'PLL', '失误'] }, file);
  history = await loadHistory(file);
  assert.deepEqual(history.solves.map((solve) => solve.tags), [['失误', 'PLL'], ['失误', 'PLL']]);
});

test('normalizes manually entered solve metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await saveSolve({
    durationMs: 12345.6,
    penalty: '+2',
    comment: 'manual entry',
    tags: ['PLL', '慢十字'],
    timerSource: 'bluetooth',
    bluetoothMoves: ['R', 'U2'],
    bluetoothMoveCount: 2,
    bluetoothTps: 0.162,
    sessionId: 'manual-session',
    scrambleSource: 'manual',
  }, file);

  const history = await loadHistory(file);
  assert.equal(history.sessions.some((session) => session.id === 'manual-session'), true);
  const [solve] = history.solves;
  assert.match(solve.id, /^solve-/);
  assert.deepEqual({ ...solve, id: undefined }, {
    id: undefined,
    durationMs: 12346,
    penalty: '+2',
    comment: 'manual entry',
    tags: ['PLL', '慢十字'],
    timerSource: 'bluetooth',
    bluetoothMoves: ['R', 'U2'],
    bluetoothMoveCount: 2,
    bluetoothTps: 0.162,
    sessionId: 'manual-session',
    scramble: '',
    scrambleSource: 'manual',
    scramblePuzzle: 'three',
    duration: '12.346',
    effectiveDurationMs: 14346,
    effectiveDuration: '14.346',
  });
});

test('preserves imported bluetooth summary fields when move list is unavailable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await saveSolve({
    id: 'imported-bluetooth',
    durationMs: 20000,
    timerSource: 'bluetooth',
    bluetoothMoves: [],
    bluetoothMoveCount: 18,
    bluetoothTps: 0.9,
  }, file);

  const history = await loadHistory(file);
  assert.equal(history.solves[0].bluetoothMoveCount, 18);
  assert.equal(history.solves[0].bluetoothTps, 0.9);
  assert.deepEqual(summarizeSolves(history.solves), {
    count: 1,
    validCount: 1,
    dnfCount: 0,
    plus2Count: 0,
    bluetoothSolveCount: 1,
    averageBluetoothMoveCount: 18,
    averageBluetoothTps: 0.9,
    bestBluetoothTps: 0.9,
    best: 20000,
    worst: 20000,
    latest: 20000,
    average: 20000,
    standardDeviation: 0,
    mo3: null,
    ao5: null,
    ao12: null,
    ao50: null,
    ao100: null,
    bestMo3: null,
    bestAo5: null,
    bestAo12: null,
    bestAo50: null,
    bestAo100: null,
  });
});

test('keeps empty bluetooth TPS null for ordinary solves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await saveSolve({
    id: 'manual-no-bluetooth',
    durationMs: 10000,
    timerSource: 'manual',
    bluetoothMoves: [],
    bluetoothMoveCount: 0,
    bluetoothTps: null,
  }, file);

  const history = await loadHistory(file);
  assert.equal(history.solves[0].bluetoothMoveCount, 0);
  assert.equal(history.solves[0].bluetoothTps, null);
});

test('keeps solve ids unique after replace and import-style merges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  await replaceSolves(
    [
      { id: 'same', durationMs: 10000 },
      { id: 'same', durationMs: 11000 },
      { durationMs: 12000 },
    ],
    file,
  );

  let history = await loadHistory(file);
  assert.equal(new Set(history.solves.map((solve) => solve.id)).size, 3);
  assert.equal(history.solves[0].id, 'same');
  assert.equal(history.solves[1].id, 'same-2');
  assert.match(history.solves[2].id, /^solve-/);

  await replaceSolves([...history.solves, { id: 'same', durationMs: 13000 }], file, history.sessions);
  history = await loadHistory(file);
  assert.equal(new Set(history.solves.map((solve) => solve.id)).size, 4);
  assert.deepEqual(history.solves.map((solve) => solve.id).filter((id) => id.startsWith('same')), ['same', 'same-2', 'same-3']);
});

test('tracks sessions and filters deleted session solves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'train-timer-'));
  const file = join(dir, 'solves.json');

  const created = await createSession('OH', file);
  await saveSolve({ id: 'default-solve', durationMs: 10000, sessionId: 'default' }, file);
  await saveSolve({ id: 'oh-solve', durationMs: 12000, sessionId: created.session.id }, file);

  let history = await loadHistory(file);
  assert.equal(history.sessions.length, 2);
  assert.equal(history.solves.length, 2);

  await deleteSession(created.session.id, file);
  history = await loadHistory(file);
  assert.deepEqual(history.solves.map((solve) => solve.id), ['default-solve']);
});

test('summarizes average of 5 and 12 with best and worst trimmed', () => {
  const solves = [10, 11, 12, 13, 30, 9, 15, 16, 17, 18, 19, 40].map((seconds, index) => ({
    id: String(index),
    durationMs: seconds * 1000,
  }));
  const summary = summarizeSolves(solves);

  assert.equal(summary.mo3, 77000 / 3);
  assert.equal(summary.ao5, 18000);
  assert.equal(summary.ao12, 16100);
  assert.equal(summary.bestMo3, 11000);
  assert.equal(summary.bestAo5, 12000);
  assert.equal(summary.bestAo12, 16100);
});

test('summarizes bluetooth move count and TPS', () => {
  const summary = summarizeSolves([
    { durationMs: 2000, timerSource: 'bluetooth', bluetoothMoves: ['R', 'U2', "F'", 'D'] },
    { durationMs: 3000, timerSource: 'bluetooth', bluetoothMoves: ['R', 'U'] },
    { durationMs: 10000 },
  ]);

  assert.equal(summary.bluetoothSolveCount, 2);
  assert.equal(summary.averageBluetoothMoveCount, 3);
  assert.equal(summary.averageBluetoothTps, 1.3335);
  assert.equal(summary.bestBluetoothTps, 2);
});

test('session summaries include extended stats and WCA-style DNF trimming', () => {
  const oneDnfWindow = [10, 11, 12, 13, 14].map((seconds, index) => ({
    id: String(index),
    durationMs: seconds * 1000,
    penalty: index === 4 ? 'dnf' : 'ok',
  }));
  const oneDnfSummary = summarizeSolves(oneDnfWindow);
  assert.equal(oneDnfSummary.validCount, 4);
  assert.equal(oneDnfSummary.dnfCount, 1);
  assert.equal(oneDnfSummary.worst, 13000);
  assert.equal(oneDnfSummary.standardDeviation, Math.sqrt(1250000));
  assert.equal(oneDnfSummary.mo3, null);
  assert.equal(oneDnfSummary.bestMo3, 11000);
  assert.equal(oneDnfSummary.ao5, 12000);
  assert.equal(oneDnfSummary.bestAo5, 12000);

  const twoDnfSummary = summarizeSolves(oneDnfWindow.map((solve, index) => ({
    ...solve,
    penalty: index >= 3 ? 'dnf' : solve.penalty,
  })));
  assert.equal(twoDnfSummary.dnfCount, 2);
  assert.equal(twoDnfSummary.ao5, null);
  assert.equal(twoDnfSummary.bestAo5, null);
});
