// Development-only differential check. Reads the frozen original engine without
// changing or running any original build/synchronization script.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyMovesToFacelets, solvedFaceletString } from '../../../../src/cube-state.js';

const root = new URL('../', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('fixtures/cases.json', root), 'utf8'));
const rows = readFileSync(new URL('results/regression.tsv', root), 'utf8').trim().split('\n').slice(1);
const byId = new Map(cases.map(sample => [sample.id, sample]));
const seen = new Set();
const errors = [];
for (const row of rows) {
  const [id, group, ms, stepsText, statusText, movesText = ''] = row.split('\t');
  const sample = byId.get(id);
  const moves = movesText.trim().split(/\s+/).filter(Boolean);
  if (!sample || seen.has(id) || Number(statusText) !== 0 || moves.length !== Number(stepsText) || moves.length > 20
    || applyMovesToFacelets(sample.current, moves) !== sample.target
    || applyMovesToFacelets(sample.relative, moves) !== solvedFaceletString) errors.push(id);
  seen.add(id);
}
const report = {
  reference: 'Frozen original src/cube-state.js, imported read-only',
  checked: rows.length,
  missing: cases.filter(sample => !seen.has(sample.id)).map(sample => sample.id),
  errors,
  verifies: ['current + formula = target', 'relative + formula = solved', 'HTM <= 20', 'no duplicate or missing IDs'],
};
writeFileSync(new URL('results/reference-validation.json', root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (errors.length || report.missing.length || rows.length !== 1506) process.exitCode = 1;
