import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);
const blurUrl = new URL('../public/scramble-blur.js', import.meta.url);
const packagedBlurUrl = new URL('../TrainTimer.app/Contents/Resources/runtime/public/scramble-blur.js', import.meta.url);
const blurWorkerUrl = new URL('../public/scramble-blur-worker.js', import.meta.url);
const packagedBlurWorkerUrl = new URL('../TrainTimer.app/Contents/Resources/runtime/public/scramble-blur-worker.js', import.meta.url);

test('scramble changes use a lyric-style directional transition', async () => {
  const [appSource, stylesSource, blurSource, packagedBlurSource, blurWorkerSource, packagedBlurWorkerSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
    readFile(blurUrl, 'utf8'),
    readFile(packagedBlurUrl, 'utf8'),
    readFile(blurWorkerUrl, 'utf8'),
    readFile(packagedBlurWorkerUrl, 'utf8'),
  ]);

  assert.match(appSource, /nextFormulaRenderKey !== scrambleFormulaRenderKey[\s\S]*captureScrambleTextTransition\(\)/);
  assert.match(appSource, /cloneNode\(false\);[\s\S]*ghost\.textContent = elements\.scrambleText\.textContent/);
  assert.match(appSource, /translate3d\(0, -8px, 0\)[\s\S]*translate3d\(0, 10px, 0\)/);
  assert.match(appSource, /duration: 420[\s\S]*duration: 560[\s\S]*duration: 760[\s\S]*delay: 72/);
  assert.match(appSource, /requestIdleCallback\(run, \{ timeout: scrambleTextBlurIdleTimeoutMs \}\)/);
  assert.match(appSource, /const scrambleTextBlurPrecomputeDelayMs = 980/);
  assert.match(appSource, /appState === 'timing' \|\| appState === 'hold'/);
  assert.match(appSource, /takeScrambleTextBlurGhost\(textWidth, textHeight\)/);
  assert.match(appSource, /scrambleTextTransitionReducedMotion\(\)[\s\S]*prefers-reduced-motion: reduce/);
  const animationSource = appSource.match(/function animateScrambleTextTransition[\s\S]*?function finishScrambleTextTransition/)?.[0] || '';
  assert.doesNotMatch(animationSource, /filter:|blur\(|scale\(/);
  assert.match(stylesSource, /\.scramble-text-transition-old\s*\{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;[^}]*will-change:\s*opacity, transform;/s);
  assert.match(stylesSource, /\.scramble-text-transition-blur\s*\{[^}]*image-rendering:\s*auto;/s);
  assert.match(blurSource, /createDualKawaseTextBlurPrecomputer/);
  assert.match(blurSource, /gl_FragColor = color \/ 8\.0;[\s\S]*gl_FragColor = color \/ 12\.0;/);
  assert.match(blurSource, /powerPreference:\s*'low-power'/);
  assert.match(blurSource, /framebufferTexture2D/);
  assert.match(blurSource, /new Worker\([\s\S]*scramble-blur-worker\.js/);
  assert.match(blurWorkerSource, /new OffscreenCanvas\(1, 1\)/);
  assert.match(blurWorkerSource, /transferToImageBitmap\(\)/);
  assert.equal(packagedBlurSource, blurSource);
  assert.equal(packagedBlurWorkerSource, blurWorkerSource);
});
