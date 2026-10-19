// Read-only CPU baseline. Synthetic data only; no user history is loaded/written.
// Run: node scripts/performance-audit.mjs > output/performance-audit/node-baseline.json
import os from 'node:os';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyMovesToFacelets, faceletsFromScramble, solvedFaceletString, warmShortCorrectionSearch, shortCorrectionMovesForRelativeFacelets } from '../src/cube-state.js';
import { cfopStagesForSave } from '../src/cfop-analysis.js';
import { opEventsForSave } from '../src/op-analysis.js';
import { analyzeSolve } from '../src/solve-analysis.js';
import { stopTnoodle } from '../src/tnoodle-service.js';
import { normalizeHistory } from '../src/history.js';
import { rollingAverageAt, rollingMeanAt, rollingWindowSeries } from '../src/rolling-averages.js';
import { solveCorrectionToScrambleTarget, stopCubeCorrectionSolver } from '../src/cube-solver.js';
import { generateScramble, drawScrambleSvg } from '../src/scramble.js';

let seed = 20260928;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
function sequence(length) {
  const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
  const suffixes = ['', '2', "'"];
  const moves = [];
  while (moves.length < length) {
    const face = faces[Math.floor(random() * 6)];
    if (face === moves.at(-1)?.[0]) continue;
    moves.push(face + suffixes[Math.floor(random() * 3)]);
  }
  return moves;
}
function inverse(moves) { return moves.slice().reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`); }
function fixture(count, id = 'synthetic') {
  const moves = sequence(count);
  const scramble = inverse(moves).join(' ');
  assert.equal(applyMovesToFacelets(faceletsFromScramble(scramble), moves), solvedFaceletString);
  return { id, sessionId: 'default', durationMs: count * 150, penalty: 'ok', createdAt: '2026-09-28T00:00:00.000Z', scramble, scramblePuzzle: 'three', timerSource: 'bluetooth', bluetoothMoves: moves, bluetoothMoveLog: moves.map((move, index) => ({ move, elapsedMs: (index + 1) * 150 })) };
}
function summary(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return { n: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
}
async function timed(fn) { const start = performance.now(); const value = await fn(); return { ms: performance.now() - start, value }; }
const report = { capturedAt: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, synthetic: true, sourceSha256: {}, results: {} };
for (const path of ['public/app.js', 'src/cube-state.js', 'src/cfop-analysis.js', 'src/op-analysis.js', 'src/history.js']) report.sourceSha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
for (let i = 0; i < 3; i++) {
  const result = await timed(() => warmShortCorrectionSearch({ maxDepth: 8, maxMs: 90, maxNodes: 1000000 }));
  report.results[`localWarmup${i + 1}`] = { ms: result.ms, ready: result.value };
}
for (const depth of [1, 4, 8, 20]) {
  const times = []; let hits = 0;
  for (let i = 0; i < 30; i++) {
    const facelets = faceletsFromScramble(sequence(depth).join(' '));
    const result = await timed(() => shortCorrectionMovesForRelativeFacelets(facelets, { maxDepth: 8, maxMs: 14, maxNodes: 1000000 }));
    if (result.value) { hits++; assert.equal(applyMovesToFacelets(facelets, result.value), solvedFaceletString); }
    times.push(result.ms);
  }
  report.results[`localSearchInput${depth}`] = { ...summary(times), hits };
}
for (const count of [20, 60, 120]) {
  const fixtures = Array.from({ length: 30 }, (_, i) => fixture(count, `${count}-${i}`));
  const cfop = [], op = [], combined = [], shared = [];
  for (const solve of fixtures) {
    const a = await timed(() => cfopStagesForSave({ ...solve }));
    const b = await timed(() => opEventsForSave({ ...solve }));
    shared.push((await timed(() => analyzeSolve({ ...solve }))).ms);
    cfop.push(a.ms); op.push(b.ms); combined.push(a.ms + b.ms);
  }
  report.results[`analysis${count}`] = { cfop: summary(cfop), opIncludesCfop: summary(op), combined: summary(combined), sharedContext: summary(shared), firstCombinedMs: combined[0] };
}
for (const count of [1000, 10000]) {
  const solves = Array.from({ length: count }, (_, i) => ({ id: `history-${i}`, sessionId: 'default', durationMs: 8000 + Math.floor(random() * 20000), penalty: i % 53 === 0 ? 'dnf' : 'ok', createdAt: new Date(1700000000000 + i * 30000).toISOString(), scramble: 'R U', scramblePuzzle: 'three' }));
  const normalizations = [], metrics = [], linear = [];
  for (let run = 0; run < 5; run++) {
    normalizations.push((await timed(() => normalizeHistory({ solves }))).ms);
    linear.push((await timed(() => { rollingWindowSeries(solves, 3, 'mean'); for (const size of [5,12,50,100]) rollingWindowSeries(solves, size); })).ms);
    metrics.push((await timed(() => solves.forEach((_, index) => {
      rollingMeanAt(solves, index, 3);
      for (const size of [5, 12, 50, 100]) rollingAverageAt(solves, index, size);
    }))).ms);
  }
  report.results[`history${count}`] = { normalization: summary(normalizations), rollingWindowsOnly: summary(metrics), linearWindows: summary(linear), rawJsonBytes: Buffer.byteLength(JSON.stringify({ solves })) };
}
try {
  const times = [], sources = [];
  for (let i = 0; i < 21; i++) {
    const facelets = faceletsFromScramble(sequence(20).join(' '));
    const result = await timed(() => solveCorrectionToScrambleTarget('', facelets, { relativeFacelets: facelets, timeoutMs: 10000 }));
    assert.equal(applyMovesToFacelets(facelets, result.value.moves), solvedFaceletString);
    times.push(result.ms); sources.push(result.value.source);
  }
  report.results.min2phase = { coldMs: times[0], warm: summary(times.slice(1)), sources };
} catch (error) { report.results.min2phase = { error: error.message }; }
finally { stopCubeCorrectionSolver(); }
const generations = [], previews = [], sources = [];
for (let i = 0; i < 3; i++) {
  const generated = await timed(() => generateScramble('three', { timeoutMs: 7000 }));
  const preview = await timed(() => drawScrambleSvg(generated.value.scramble, 'three', { timeoutMs: 5000 }));
  generations.push(generated.ms); previews.push(preview.ms); sources.push({ scramble: generated.value.source, preview: preview.value?.source || null });
}
report.results.tnoodle = { generation: summary(generations), preview: summary(previews), sources };
stopTnoodle();
report.memoryAtEnd = process.memoryUsage();
console.log(JSON.stringify(report, null, 2));
