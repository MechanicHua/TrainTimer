import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);
const blurUrl = new URL('../public/scramble-blur.js', import.meta.url);
const packagedBlurUrl = new URL('../TrainTimer.app/Contents/Resources/runtime/public/scramble-blur.js', import.meta.url);
const blurWorkerUrl = new URL('../public/scramble-blur-worker.js', import.meta.url);
const packagedBlurWorkerUrl = new URL('../TrainTimer.app/Contents/Resources/runtime/public/scramble-blur-worker.js', import.meta.url);

test('Bluetooth synchronization captures the old text before the full render follows', async () => {
  const source = await readFile(appUrl, 'utf8');
  const start = source.indexOf('function renderScrambleGuideDisplay(');
  const end = source.indexOf('\nfunction renderScrambleText(', start);
  const text = { textContent: 'R U2 F', dataset: {} };
  const outgoing = [];
  const context = {
    scramble: { puzzle: 'three', scramble: 'L D2 B' }, scramblePuzzle: 'three',
    scrambleFormulaRenderKey: 'three\nR U2 F', scrambleGuideErrorIndex: null,
    elements: { scrambleText: text },
    captureScrambleTextTransition: () => ({ text: text.textContent }),
    renderScrambleText() { text.textContent = context.scramble.scramble; },
    renderScrambleGuideMeta() {},
    animateScrambleTextTransition: (snapshot) => outgoing.push(snapshot.text),
  };
  runInNewContext(source.slice(start, end), context);
  // applyLoadedScramble synchronizes Bluetooth first, then calls render().
  context.renderScrambleGuideDisplay();
  context.renderScrambleGuideDisplay();
  assert.deepEqual(outgoing, ['R U2 F']);
  assert.equal(text.textContent, 'L D2 B');
  context.scramble.scramble = 'F2 R2';
  context.renderScrambleGuideDisplay();
  assert.deepEqual(outgoing, ['R U2 F', 'L D2 B']);
});

test('scramble changes animate concurrently without blur and respect reduced motion', async () => {
  const appSource = await readFile(appUrl, 'utf8');
  const animation = appSource.slice(appSource.indexOf('function animateScrambleTextTransition('), appSource.indexOf('function finishScrambleTextTransition('));
  assert.match(animation, /duration: 180/);
  assert.match(animation, /duration: 200/);
  assert.doesNotMatch(animation, /filter:|delay:|blur\(/);
  assert.match(appSource, /prefers-reduced-motion: reduce/);
  assert.match(appSource, /cloneNode\(true\)/);
  assert.doesNotMatch(appSource, /createDualKawaseTextBlurPrecomputer/);
});
