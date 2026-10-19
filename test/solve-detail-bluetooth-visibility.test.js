import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('opening manual and Bluetooth details renders against the current page fields', async () => {
  const [appSource, html] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  ]);
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const elements = Object.fromEntries(
    [...appSource.matchAll(/(\w+): document\.querySelector\('#([^']+)'\)/g)]
      .map(([, key, id]) => [key, ids.has(id) ? {} : null]),
  );
  elements.solveDialog.showModal = () => { elements.solveDialog.open = true; };
  const solves = ['manual', 'bluetooth'].map((timerSource) => ({
    id: timerSource, sessionId: 'default', timerSource, durationMs: 12345,
    createdAt: '2026-09-07T10:00:00Z', scramble: "R U R'", comment: 'notes',
  }));
  const context = {
    elements, solves, currentDetailSolveId: null, solveDetailNavigationDirection: 0,
    stopSolveReplay() {}, solvesForSession: () => solves,
    displaySolveTime: () => '12.345', puzzleLabel: () => '3x3',
    sessionNameForSolve: () => 'Default', animateSolveDetailNavigation() {},
    renderSolveSolutionPanel: () => ({ displayedStages: [], hasData: false }),
    renderSolveAnalysis() {}, historyPartial: false, loadFullHistoryInBackground() {},
  };
  const source = appSource.slice(appSource.indexOf('function openSolveDialog(id)'), appSource.indexOf('function renderSolveSolutionPanel(solve)'));
  for (const id of ['manual', 'bluetooth', 'manual']) {
    elements.solveDialog.open = false;
    runInNewContext(`${source}\nopenSolveDialog('${id}');`, context);
    assert.equal(elements.solveDialog.open, true);
    assert.equal(elements.solveDetailScramble.value, "R U R'");
    assert.equal(elements.solveDetailComment.value, 'notes');
    assert.equal(elements.solveDetailPenaltyField.hidden, id === 'bluetooth');
    assert.equal(elements.solveDetailPenaltySelect.disabled, id === 'bluetooth');
  }
});

test('solve detail hides stage timing when the solve has no bluetooth data', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(
    appSource,
    /renderSolveAnalysis\(solve, solution\.displayedStages, \{ hasBluetoothData: solution\.hasData \}\);/,
  );
  assert.match(
    appSource,
    /function renderSolveAnalysis\(solve, displayedStages, options = \{\}\) \{\s*elements\.solveAnalysisPanel\.hidden = !options\.hasBluetoothData;\s*if \(!options\.hasBluetoothData\) \{[\s\S]*?return;/,
  );
});

test('solve comparison saturation changes continuously with marker movement', async () => {
  const [appSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(stylesSource, /@property --comparison-saturation \{[\s\S]*syntax: "<number>";/);
  assert.match(stylesSource, /var\(--comparison-tone\) calc\(var\(--comparison-saturation\) \* 100%\)/);
  assert.match(
    appSource,
    /const saturationAnimation = row\.animate\([\s\S]*\{ '--comparison-saturation': '0' \}[\s\S]*row\.dataset\.colorSaturation/,
  );
  assert.match(appSource, /saturationAnimation\.id = 'solve-comparison-saturation';/);
});


test('solve detail keeps chrome outside its only scroll region and notes after replay', async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(appUrl, 'utf8'), readFile(stylesUrl, 'utf8'),
  ]);
  const detail = html.slice(html.indexOf('<dialog id="solveDialog"'), html.indexOf('<dialog id="averageDialog"'));
  assert.ok(detail.indexOf('class="solve-dialog-header"') < detail.indexOf('class="solve-dialog-content"'));
  assert.ok(detail.indexOf('id="solveSolutionPanel"') < detail.indexOf('id="solveDetailComment"'));
  assert.ok(detail.indexOf('id="solveDetailComment"') < detail.indexOf('class="dialog-actions"'));
  assert.match(css, /dialog\.solve-dialog\s*\{\s*overflow: hidden;/);
  assert.match(css, /\.solve-dialog-inner > \.solve-dialog-content\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/s);
  assert.match(css, /dialog\.solve-dialog \.solve-dialog-header,\s*dialog\.solve-dialog \.dialog-actions\s*\{\s*position: static;/);
  for (const name of ['setupDialogEdgeAnchors', 'setupDialogScrollIndicators']) {
    const setup = app.slice(app.indexOf(`function ${name}()`));
    assert.match(setup.split('dialog.addEventListener')[0], /querySelectorAll\('dialog:not\(\.solve-dialog\)'\)/);
  }
});
