import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('dialogs use the browser native scroll pipeline instead of simulated elasticity', async () => {
  const [appSource, indexSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.doesNotMatch(appSource, /setupDialogElasticOverscroll|dialog-overscroll-physics|primeNativeScrollEnd/);
  assert.match(indexSource, /styles\.css\?v=20260728-native-dialog-scroll-v9/);
  assert.match(indexSource, /app\.js\?v=20260728-native-dialog-scroll-v9/);
  assert.match(stylesSource, /dialog:is\([^}]+\)\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*padding:\s*var\(--dialog-viewport-gutter\)\s+0;[^}]*clip-path:\s*inset\(var\(--dialog-viewport-gutter\)\s+0\s+round\s+var\(--dialog-radius\)\);/s);
  assert.match(stylesSource, /dialog\s*>\s*form\[class\]\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow:\s*clip;[^}]*border-radius:\s*var\(--dialog-radius\);[^}]*background:/s);
  assert.match(stylesSource, /dialog::-webkit-scrollbar\s*\{[^}]*width:\s*0;[^}]*height:\s*0;/s);
  assert.match(stylesSource, /\.dialog-scroll-indicator\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /dialog \.solve-dialog-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*background:\s*var\(--dialog-shell\);/s);
  assert.match(stylesSource, /dialog \.dialog-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*background:\s*var\(--dialog-shell\);/s);
  assert.match(appSource, /setupDialogScrollIndicators\(\);/);
  assert.match(appSource, /const trackTop = Math\.max\(surfaceTop \+ radius, headerBox\?\.bottom \|\| surfaceTop\) \+ clearance;/);
  assert.match(appSource, /const trackBottom = Math\.min\(surfaceBottom - radius, footerBox\?\.top \|\| surfaceBottom\) - clearance;/);
  assert.doesNotMatch(stylesSource, /dialog \.solve-dialog-header\s*\{[^}]*top:\s*-\d+px;/s);
  assert.doesNotMatch(stylesSource, /dialog \.dialog-actions\s*\{[^}]*bottom:\s*-\d+px;/s);
  assert.doesNotMatch(stylesSource, /--dialog-overscroll-y|dialog-scrollend-sentinel|dialog-overscroll-active/);
});
