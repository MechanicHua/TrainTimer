import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollingWindowSeries, rollingAverageAt, rollingMeanAt } from '../src/rolling-averages.js';
import { LatestWorker } from '../public/latest-worker.js';
import { liveTurnDuration, turnProgress } from '../public/cube3d-timing.js';
import { visibleRange } from '../public/windowed-list.js';
import { analyzeSolveInBackground, stopAnalysisWorker } from '../src/analysis-service.js';
import { solveCfopAnalysis, cfopStagesForSave } from '../src/cfop-analysis.js';
import { opEventsForSave } from '../src/op-analysis.js';
import { buildReplayFrames } from '../src/replay-state.js';
import { faceletsFromScramble, applyMoveToFacelets } from '../src/cube-state.js';
import { saveSolve, loadHistory, updateSolve, updateSolveAnalysis } from '../src/history.js';
import { analyzeSolve } from '../src/solve-analysis.js';
import { analysisInputKey } from '../src/analysis-input.js';

const solve = { id: 'analysis', scramble: 'R U F2', scramblePuzzle: 'three', durationMs: 3000,
  timerSource: 'bluetooth', bluetoothMoves: ['F2', "U'", "R'"],
  bluetoothMoveLog: [{ move: 'F2', elapsedMs: 1000 }, { move: "U'", elapsedMs: 2000 }, { move: "R'", elapsedMs: 3000 }] };

test('linear rolling windows match reference for penalties, ties, DNF and long sessions', () => {
  let seed = 42;
  const solves = Array.from({ length: 10000 }, (_, id) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return { id, durationMs: seed % 50 * 1000, penalty: ['ok', 'ok', 'ok', '+2', 'dnf'][seed % 5] };
  });
  for (const size of [3, 5, 12, 50, 100]) {
    assert.deepEqual(rollingWindowSeries(solves, size), solves.map((_, i) => rollingAverageAt(solves, i, size)));
    assert.deepEqual(rollingWindowSeries(solves, size, 'mean'), solves.map((_, i) => rollingMeanAt(solves, i, size)));
  }
});

test('correction worker keeps only latest queued input and cannot return aborted results', async () => {
  const sent = [];
  const fake = { postMessage: (job) => sent.push(job), terminate() {} };
  const queue = new LatestWorker(() => fake);
  const controller = new AbortController();
  const first = queue.request({ facelets: 'a' }, controller.signal);
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  controller.abort();
  const second = queue.request({ facelets: 'b' });
  const secondRejected = assert.rejects(second, { name: 'AbortError' });
  const third = queue.request({ facelets: 'c' });
  assert.equal(sent.length, 1);
  fake.onmessage({ data: { id: sent[0].id, result: 'stale' } });
  assert.deepEqual(sent.map((job) => job.facelets), ['a', 'c']);
  fake.onmessage({ data: { id: sent[1].id, result: 'current' } });
  assert.equal(await third, 'current');
  await Promise.all([firstRejected, secondRejected]);
  queue.destroy();
});

test('live animation catches up to a 20 TPS stream with clamped frame progress', () => {
  assert.ok(liveTurnDuration(120, 150, 150, 100) < 50);
  assert.equal(liveTurnDuration(120, 150, 400, 100), 16);
  assert.equal(turnProgress({ startedAt: 10, duration: 40 }, 100), 1);
  assert.equal(turnProgress({ startedAt: 10, duration: 40 }, 0), 0);
});

test('virtual history bounds nodes and preserves the complete scroll extent', () => {
  for (const top of [0, 370, 185000, 370000]) {
    const range = visibleRange(10000, top, 370);
    assert.ok(range.end - range.start <= 26);
    assert.equal(range.before + (range.end - range.start) * 37 + range.after, 370000);
  }
  assert.deepEqual(visibleRange(0, 500, 370), { start: 0, end: 0, before: 0, after: 0 });
});

test('background analysis matches synchronous outputs and shares identical jobs', async () => {
  try {
    const first = analyzeSolveInBackground(solve);
    assert.equal(analyzeSolveInBackground(solve), first);
    const result = await first;
    assert.deepEqual(result.cfopStages, cfopStagesForSave(solve));
    assert.deepEqual(result.opEvents, opEventsForSave(solve));
    assert.equal(result.analysisSummary.finalSolved, solveCfopAnalysis(solve).finalSolved);
  } finally { stopAnalysisWorker(); }
});

test('replay snapshots reproduce every logical move including double turns', () => {
  const frames = buildReplayFrames(solve);
  let facelets = faceletsFromScramble(solve.scramble);
  assert.equal(frames.facelets[0], facelets);
  assert.equal(frames.records.length, 3);
  solve.bluetoothMoves.forEach((move, index) => {
    facelets = applyMoveToFacelets(facelets, move);
    assert.equal(frames.facelets[index + 1], facelets);
  });
});

test('atomic history transactions preserve concurrent saves and reject stale derived data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'traintimer-transactions-'));
  const path = join(directory, 'history.json');
  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => saveSolve({ ...solve, id: `s${index}` }, path)));
    let history = await loadHistory(path);
    assert.equal(history.solves.length, 12);
    const saved = history.solves[0];
    const expected = analysisInputKey(saved);
    await updateSolve(saved.id, { comment: 'keep me' }, path);
    assert.ok(await updateSolveAnalysis(saved.id, expected, { analysisStatus: 'complete' }, path));
    await updateSolve(saved.id, { bluetoothMoves: ['R'] }, path);
    assert.equal(await updateSolveAnalysis(saved.id, expected, { analysisStatus: 'complete' }, path), null);
    history = await loadHistory(path);
    const changed = history.solves.find((item) => item.id === saved.id);
    assert.equal(changed.comment, 'keep me');
    assert.equal(changed.analysisStatus, 'pending');
    assert.equal(changed.rawRevision, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('derived outputs keep raw evidence identity stable including missing inspection time', () => {
  for (const inspectionEnabled of [undefined, false, true]) {
    const input = { ...solve, inspectionEnabled };
    assert.equal(analysisInputKey(input), analysisInputKey({ ...input, ...analyzeSolve(input) }));
  }
});

test('replay coalesces half turns and retains state corrections at physical steps', () => {
  const corrected = { scramble: 'U', bluetoothMoveLog: [
    { move: "U'", elapsedMs: 100 }, { move: 'R', elapsedMs: 200 }, { move: 'R', elapsedMs: 300 },
  ], bluetoothStateCorrections: [{ step: 1, facelets: faceletsFromScramble('R2') }] };
  const frames = buildReplayFrames(corrected);
  assert.deepEqual(frames.records.map((record) => record.move), ["U'", 'R2']);
  assert.equal(frames.facelets[1], faceletsFromScramble('R2'));
  assert.equal(frames.facelets[2], faceletsFromScramble(''));
});

test('a failed correction worker can be recreated on the next request', async () => {
  let attempt = 0;
  const fake = { postMessage() {}, terminate() {} };
  const queue = new LatestWorker(() => { if (++attempt === 1) throw new Error('unavailable'); return fake; });
  await assert.rejects(queue.request({}), /unavailable/);
  const result = queue.request({});
  fake.onmessage({ data: { id: queue.active.id, result: 'recovered' } });
  assert.equal(await result, 'recovered');
  queue.destroy();
});
