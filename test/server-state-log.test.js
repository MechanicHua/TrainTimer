import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHistory, saveSolve, updateSolve } from '../src/history.js';

test('finishing state packet persists without changing the saved solve identity', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'train-timer-state-log-'));
  const historyPath = join(directory, 'solves.json');
  t.after(() => rm(directory, { recursive: true, force: true }));

  const initialStateLog = [statePacket(1000, false, '01')];
  await saveSolve({
    id: 'state-log-solve',
    durationMs: 1234,
    timerSource: 'bluetooth',
    bluetoothStateLog: initialStateLog,
  }, historyPath);

  const finishingStateLog = [...initialStateLog, statePacket(1800, true, '02')];
  const result = await updateSolve('state-log-solve', { bluetoothStateLog: finishingStateLog }, historyPath);
  assert.equal(result.solve.id, 'state-log-solve');
  assert.equal(result.solve.bluetoothStateLog.length, 2);
  assert.equal(result.solve.bluetoothStateLog.at(-1).solved, true);

  const history = await loadHistory(historyPath);
  assert.equal(history.solves[0].bluetoothStateLog.length, 2);
  assert.equal(history.solves[0].bluetoothStateLog.at(-1).raw, '02');
});

test('state-log API route precedes the general solve patch and returns one solve', async () => {
  const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  const compactRoute = serverSource.indexOf("url.pathname.endsWith('/state-log')");
  const generalRoute = serverSource.indexOf("url.pathname.startsWith('/api/solves/'))", compactRoute + 1);
  assert.ok(compactRoute >= 0);
  assert.ok(generalRoute > compactRoute);
  assert.match(serverSource.slice(compactRoute, generalRoute), /sendJson\(response, 200, \{ solve: result\.solve \}\)/);
});

function statePacket(timestampMs, solved, raw) {
  return {
    step: 12,
    facelets: solved
      ? 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
      : 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBR',
    solved,
    timestampMs,
    elapsedMs: timestampMs - 1000,
    raw,
  };
}
