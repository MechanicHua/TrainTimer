import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { solveCfopAnalysis, solvePhysicalMoveRecords } from '../src/cfop-analysis.js';
import { analyzeSolve } from '../src/solve-analysis.js';
import { opEventsForSave } from '../src/op-analysis.js';
import { faceletsFromScramble } from '../src/cube-state.js';
import { analysisInputKey } from '../src/analysis-input.js';
import { saveSolve, loadHistory, updateSolve, updateSolveAnalysis, normalizeHistoryForBootstrap, normalizeHistory } from '../src/history.js';
import { solvesToCsv } from '../src/solves-export.js';
import { parseSolveImport } from '../src/solves-import.js';

const regression = JSON.parse(await readFile(new URL('./fixtures/cfop-pre-cross-pairs.json', import.meta.url), 'utf8'));

function assertTiming(stages, total) {
  assert.equal(stages.reduce((sum, stage) => sum + stage.durationMs, 0), total);
  for (const [index, stage] of stages.entries()) {
    assert.ok(stage.durationMs >= 0);
    if (index) assert.equal(stage.startedAtElapsedMs, stages[index - 1].completedAtElapsedMs);
  }
}

test('pre-Cross pairs produce xxxcross and retain both O/P timings and exact formulas', () => {
  const result = analyzeSolve(regression);
  assert.equal(result.analysisSummary.bottomFace, 'U');
  assert.equal(result.analysisSummary.bottomFaceStatus, 'automatic');
  assert.deepEqual(result.cfopStages.map((stage) => stage.durationMs), [15903, 0, 0, 0, 2668, 3689, 2610]);
  assert.equal(result.cfopStages[0].name, 'xxxcross');
  assert.deepEqual(result.cfopStages.slice(1, 5).map((stage) => stage.includedInCross), [true, true, true, false]);
  assert.deepEqual(result.cfopStages.map((stage) => stage.physicalCompletedAt), [54, 54, 54, 54, 66, 85, 98]);
  assert.deepEqual(result.opEvents.map((event) => [event.caseId, event.startStep, event.endStep, event.formulaAccepted]), [
    ['oll-56', 70, 85, true], ['pll-aa', 87, 98, true],
  ]);
  assert.ok(result.cfopStages.every((stage) => !stage.skipped && !stage.timingInterpolated));
  assert.doesNotMatch(JSON.stringify(result), /confidence|"score"/);
  assertTiming(result.cfopStages, 24870);
  const rawOnly = analyzeSolve({ ...regression, bluetoothStateLog: [] });
  assert.deepEqual(rawOnly.cfopStages, result.cfopStages);
  assert.deepEqual(rawOnly.opEvents, result.opEvents);
});

test('Cross names count 0 through 4 currently inserted pairs, including earlier insertions', () => {
  const states = [
    ["R U R' L' U' L B U B' B' U' B", 'Cross', 0],
    ["R U R' L' U' L B U B'", 'xcross', 1],
    ["R U R' L' U' L", 'xxcross', 2],
    ["R U R'", 'xxxcross', 3],
    ['U', 'xxxxcross', 4],
  ];
  for (const [state, name, count] of states) {
    const { stages } = solveCfopAnalysis({ scramble: `${state} D`, cfopBottomFace: 'D',
      bluetoothMoveLog: [{ move: "D'", elapsedMs: 1000 }] });
    assert.equal(stages[0].name, name);
    assert.equal(stages[0].durationMs, 1000);
    assert.equal(stages.filter((stage) => stage.includedInCross).length, count);
    assert.ok(stages.filter((stage) => stage.includedInCross).every((stage) => stage.durationMs === 0));
  }
});

test('automatic bottom selection leaves exact ties unresolved and accepts an explicit face', () => {
  const solve = { scramble: 'M', durationMs: 600, bluetoothMoveLog: [{ move: "M'", elapsedMs: 600 }] };
  const automatic = solveCfopAnalysis(solve);
  assert.equal(automatic.bottomFace, '');
  assert.equal(automatic.bottomFaceStatus, 'ambiguous');
  assert.equal(automatic.bottomFaceCandidates.length, 6);
  assert.equal(automatic.finalSolved, true);
  assert.ok(automatic.stages.every((stage) => !stage.completed));
  assert.deepEqual(opEventsForSave(solve), []);
  const selected = solveCfopAnalysis({ ...solve, cfopBottomFace: 'D' });
  assert.equal(selected.bottomFace, 'D');
  assert.equal(selected.bottomFaceStatus, 'selected');
  assert.ok(selected.stages.every((stage) => stage.completed));
  assertTiming(selected.stages, 600);
});

test('four historically completed pairs cannot end F2L until all four are currently solved', () => {
  const solve = { scramble: 'R U F', cfopBottomFace: 'D', timerSource: 'bluetooth', bluetoothStateLog: [
    { step: 0, facelets: faceletsFromScramble("R U R'"), elapsedMs: 1000 },
    { step: 0, facelets: faceletsFromScramble("L' U' L"), elapsedMs: 2000 },
  ] };
  const incomplete = solveCfopAnalysis(solve);
  assert.equal(incomplete.stages.find((stage) => stage.label === 'F4').completed, false);
  assert.equal(incomplete.stages.find((stage) => stage.label === 'O').completed, false);
  assert.equal(incomplete.stages.find((stage) => stage.label === 'P').completed, false);
  const complete = solveCfopAnalysis({ ...solve, bluetoothStateLog: [...solve.bluetoothStateLog,
    { step: 0, facelets: faceletsFromScramble("R U2 R' U' R U' R'"), elapsedMs: 3000 },
  ] });
  assert.equal(complete.stages.find((stage) => stage.label === 'F4').completedAtElapsedMs, 2500);
  assert.equal(complete.stages.find((stage) => stage.label === 'O').completed, false);
});

test('missing move times use linear interpolation between known timings and stopwatch endpoints', () => {
  const solve = { scramble: 'R U F', durationMs: 6000, timerStartedAtMs: 100000,
    bluetoothMoveLog: [
      { move: 'R', elapsedMs: null }, { move: 'U', elapsedMs: 2000 },
      { move: 'F', elapsedMs: null }, { move: 'U', elapsedMs: null },
      { move: 'R', elapsedMs: 5000 }, { move: 'D', elapsedMs: null },
    ] };
  const records = solvePhysicalMoveRecords(solve);
  assert.deepEqual(records.map((record) => record.elapsedMs), [1000, 2000, 3000, 4000, 5000, 6000]);
  assert.equal(records[2].timestampMs, 103000);
  assert.equal(solve.bluetoothMoveLog[2].elapsedMs, null);
  assert.equal(records[1].timingInterpolated, undefined);
  assert.equal(records[2].timingInterpolated, true);
});

test('state gaps interpolate newly crossed boundaries without reporting false O/P skips', () => {
  const initial = faceletsFromScramble('R U F');
  const solve = { scramble: 'R U F', durationMs: 8000, timerSource: 'bluetooth', cfopBottomFace: 'D',
    timerStartedAtMs: 100000, bluetoothStateLog: [
      { step: 0, facelets: initial, elapsedMs: 1000 },
      { step: 0, facelets: faceletsFromScramble(''), elapsedMs: 8000 },
    ] };
  const { stages } = solveCfopAnalysis(solve);
  assert.ok(stages.every((stage) => stage.completed));
  for (const key of ['oll', 'pll']) {
    const stage = stages.find((stage) => stage.key === key);
    assert.equal(stage.skipped, false);
    assert.ok(stage.durationMs > 0);
    assert.equal(stage.completedAtTimestampMs, 100000 + stage.completedAtElapsedMs);
  }
  assertTiming(stages, 8000);
  assert.ok(stages.every((stage) => stage.timingInterpolated));
});

test('changing the selected bottom invalidates cached analysis and rejects obsolete worker results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'traintimer-bottom-'));
  const path = join(dir, 'history.json');
  try {
    await saveSolve({ ...regression, id: 'bottom' }, path);
    const saved = (await loadHistory(path)).solves[0];
    const before = analysisInputKey(saved);
    await updateSolveAnalysis(saved.id, before, analyzeSolve(saved), path);
    await updateSolve(saved.id, { cfopBottomFace: 'D' }, path);
    const changed = (await loadHistory(path)).solves[0];
    assert.equal(changed.analysisStatus, 'pending');
    assert.notEqual(analysisInputKey(changed), before);
    assert.equal(await updateSolveAnalysis(saved.id, before, analyzeSolve(saved), path), null);
    const result = analyzeSolve(changed);
    assert.equal(result.analysisSummary.bottomFace, 'D');
    assert.equal(result.analysisSummary.bottomFaceStatus, 'selected');
    assert.equal(result.cfopStages.find((stage) => stage.label === 'O').durationMs, 0);
    assert.ok(await updateSolveAnalysis(saved.id, analysisInputKey(changed), result, path));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('history keeps absent timestamps for interpolation and strips old confidence fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'traintimer-timing-'));
  const path = join(dir, 'history.json');
  try {
    await saveSolve({ id: 'missing', durationMs: 3000, cfopBottomFace: 'U',
      bluetoothMoveLog: [{ move: 'R', elapsedMs: 1000 }, { move: 'U', elapsedMs: null }, { move: 'R', elapsedMs: 3000 }],
      analysisSummary: { bottomFace: 'U', confidence: '高', finalSolved: true },
      opEvents: [{ kind: 'oll', caseId: 'oll-27', matchCount: 1, confidence: 'unique' }],
    }, path);
    const saved = (await loadHistory(path)).solves[0];
    assert.equal(saved.bluetoothMoveLog[1].elapsedMs, null);
    assert.deepEqual(solvePhysicalMoveRecords(saved).map((record) => record.elapsedMs), [1000, 2000, 3000]);
    assert.doesNotMatch(JSON.stringify(saved.analysisSummary), /confidence/);
    assert.doesNotMatch(JSON.stringify(saved.opEvents), /confidence/);
    const imported = parseSolveImport('solves.csv', solvesToCsv([saved])).solves[0];
    assert.equal(imported.cfopBottomFace, 'U');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// Even short histories must hydrate their stripped move logs before recomputation.
test('bootstrap marks stripped raw evidence as partial even when every solve fits the first page', () => {
  const history = normalizeHistoryForBootstrap({ solves: [regression] }, { limit: 24 });
  assert.equal(history.solves.length, 1);
  assert.equal(history.historyPartial, true);
  assert.deepEqual(history.solves[0].bluetoothMoveLog, []);
  assert.equal(normalizeHistoryForBootstrap({ solves: [{ durationMs: 1000 }] }, { limit: 24 }).historyPartial, false);
});

test('normalization and derived saves preserve the raw input identity with absent timing and packet fields', () => {
  const raw = { solves: [{ ...regression, timerStartedAtMs: null, timerFinishedAtMs: null,
    bluetoothStateCorrections: [{ step: 54, facelets: regression.bluetoothStateLog.find((entry) => entry.step === 54)?.facelets || faceletsFromScramble('R U'), elapsedMs: null }],
  }] };
  const once = normalizeHistory(raw).solves[0];
  const twice = normalizeHistory({ solves: [once] }).solves[0];
  assert.equal(once.timerStartedAtMs, null);
  assert.equal(twice.timerStartedAtMs, null);
  assert.equal(analysisInputKey(once), analysisInputKey(twice));
  const saved = normalizeHistory({ solves: [{ ...once, ...analyzeSolve(once) }] }).solves[0];
  assert.equal(analysisInputKey(once), analysisInputKey(saved));
});
