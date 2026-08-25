import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);

test('manual timing switches to the prefetched scramble as soon as timing stops', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(
    appSource,
    /async function finishTiming\(options = \{\}\) \{[\s\S]*?const shouldAutoPrepareNextSolve = finishSource !== 'bluetooth';/,
  );
  assert.match(
    appSource,
    /const nextScramblePromise = shouldAutoPrepareNextSolve[\s\S]*prepareNextScrambleAtFinish\(\)[\s\S]*await nextPaintOrTimeout\(\);[\s\S]*postJson\('\/api\/solves'/,
  );
  assert.match(appSource, /const prefetched = takePrefetchedScrambleData\(scramblePuzzle\);[\s\S]*applyLoadedScramble\(prefetched\);/);
  assert.match(appSource, /scramble: finishedScramble\.scramble,[\s\S]*scrambleSource: finishedScramble\.source/);
  assert.doesNotMatch(appSource, /return !bluetoothDevice\?\.gatt\?\.connected/);
});

test('finished result remains visible until the user explicitly requests a new scramble', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(appSource, /retainedTimerResultText = formatTime\(durationMs\);[\s\S]*setTimerDisplayText\(retainedTimerResultText\)/);
  assert.match(appSource, /appState === 'ready'[\s\S]*setTimerDisplayText\(retainedTimerResultText \|\| '0\.000'\)/);
  assert.match(appSource, /async function loadNewScrambleFromUserAction\(\) \{[\s\S]*retainedTimerResultText = '';[\s\S]*setTimerDisplayText\('0\.000'\);[\s\S]*await loadScramble\(\)/);
  assert.match(appSource, /elements\.scrambleButton\.addEventListener\('click', loadNewScrambleFromUserAction\)/);
});

test('browser entrypoint invalidates the immutable app bundle cache', async () => {
  const indexSource = await readFile(indexUrl, 'utf8');

  assert.match(indexSource, /app\.js\?v=20260825-comparison-saturation-motion-v66/);
});

test('latest-result keyboard actions remain available after auto-advancing to ready', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(
    appSource,
    /\(appState === 'done' \|\| appState === 'ready'\) && handleDoneQuickAction\(event\)/,
  );
});
