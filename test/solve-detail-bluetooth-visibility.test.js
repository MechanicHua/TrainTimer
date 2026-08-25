import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

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
