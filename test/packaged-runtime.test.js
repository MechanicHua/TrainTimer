import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appRuntimeRoot = join(projectRoot, 'TrainTimer.app', 'Contents', 'Resources', 'runtime');

const mirroredPublicFiles = [
  'app.js',
  'index.html',
  'styles.css',
  'vendor/three.module.js',
];

const mirroredSourceModules = [
  'bluetooth-moves.js',
  'bluetooth-state-log.js',
  'cfop-analysis.js',
  'cube-state.js',
  'history.js',
  'move-metrics.js',
  'op-analysis.js',
  'op-case-diagrams.js',
  'op-case-svg.js',
  'op-formula-library.js',
  'op-pdf-algorithms.js',
  'op-poster-diagram-shapes.js',
  'op-stats.js',
  'replay-timing.js',
  'scramble.js',
  'server.js',
  'solve-summary.js',
  'solves-export.js',
  'solves-import.js',
];

test('packaged runtime mirrors OP-capable source modules', async () => {
  for (const file of mirroredPublicFiles) {
    assert.equal(
      await readFile(join(appRuntimeRoot, 'public', file), 'utf8'),
      await readFile(join(projectRoot, 'public', file), 'utf8'),
      `public/${file} should match packaged runtime`,
    );
  }

  for (const file of mirroredSourceModules) {
    assert.equal(
      await readFile(join(appRuntimeRoot, 'src', file), 'utf8'),
      await readFile(join(projectRoot, 'src', file), 'utf8'),
      `src/${file} should match packaged runtime`,
    );
  }
});

test('packaged runtime exposes OP browser modules through the server allow-list', async () => {
  const serverSource = await readFile(join(appRuntimeRoot, 'src', 'server.js'), 'utf8');
  const appSource = await readFile(join(appRuntimeRoot, 'public', 'app.js'), 'utf8');
  const requiredModules = [
    'op-analysis.js',
    'bluetooth-state-log.js',
    'op-case-diagrams.js',
    'op-case-svg.js',
    'op-formula-library.js',
    'op-pdf-algorithms.js',
    'op-poster-diagram-shapes.js',
    'op-stats.js',
    'replay-timing.js',
  ];

  for (const file of requiredModules) {
    assert.match(serverSource, new RegExp(`['"]${file.replace('.', '\\.')}['"]`), `${file} should be served from src`);
  }
  assert.match(appSource, /from '\.\/op-analysis\.js\?/);
  assert.match(appSource, /from '\.\/op-case-svg\.js\?/);
  assert.match(appSource, /from '\.\/op-formula-library\.js\?/);
  assert.match(appSource, /from '\.\/op-stats\.js\?/);
  assert.match(appSource, /from '\.\/replay-timing\.js\?/);
});
