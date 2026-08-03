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
  assert.match(indexSource, /styles\.css\?v=20260803-native-edge-anchor-v33/);
  assert.match(indexSource, /app\.js\?v=20260803-native-edge-anchor-v33/);
  assert.match(stylesSource, /dialog:is\([^}]+\)\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*padding:\s*var\(--dialog-viewport-gutter\)\s+0;[^}]*clip-path:\s*inset\(var\(--dialog-viewport-gutter\)\s+0\s+round\s+var\(--dialog-radius\)\);/s);
  assert.match(stylesSource, /dialog\s*>\s*form\[class\]\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow:\s*clip;[^}]*border:\s*1px solid var\(--dialog-border\);[^}]*border-radius:\s*var\(--dialog-radius\);[^}]*background:/s);
  assert.match(stylesSource, /dialog > form\[class\]:has\(> \.solve-dialog-header\)\s*\{[^}]*border-top-width:\s*0;/s);
  assert.match(stylesSource, /dialog > form\[class\]:has\(> \.dialog-actions\)\s*\{[^}]*border-bottom-width:\s*0;/s);
  assert.match(stylesSource, /dialog::-webkit-scrollbar\s*\{[^}]*width:\s*0;[^}]*height:\s*0;/s);
  assert.match(stylesSource, /\.dialog-scroll-indicator\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /dialog \.solve-dialog-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*margin:\s*-20px -21px 18px;[^}]*border:\s*1px solid var\(--dialog-border\);[^}]*border-bottom-color:\s*var\(--dialog-border-soft\);[^}]*border-radius:\s*var\(--dialog-radius\) var\(--dialog-radius\) 0 0;[^}]*background:\s*var\(--dialog-shell\);[^}]*box-shadow:\s*none;/s);
  assert.match(stylesSource, /dialog \.dialog-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*margin:\s*18px -21px -20px;[^}]*border:\s*1px solid var\(--dialog-border\);[^}]*border-top-color:\s*var\(--dialog-border-soft\);[^}]*border-radius:\s*0 0 var\(--dialog-radius\) var\(--dialog-radius\);[^}]*background:\s*var\(--dialog-shell\);[^}]*box-shadow:\s*none;/s);
  assert.match(stylesSource, /@keyframes dialog-shell-in\s*\{[\s\S]*to\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/s);
  assert.match(stylesSource, /dialog\[class\]\[open\]\[data-dialog-edge-anchor\]\s*\{[^}]*transform:\s*none;/s);
  assert.doesNotMatch(stylesSource, /dialog\[class\]\[open\]\[data-dialog-edge-anchor\]\s*\{[^}]*animation:/s);
  assert.doesNotMatch(stylesSource, /animation:\s*dialog-shell-in[^;]*\bboth\b/);
  assert.match(stylesSource, /dialog\[data-dialog-scrollable\] > form\[class\]\s*\{[^}]*overflow:\s*visible;[^}]*backdrop-filter:\s*none;/s);
  assert.match(stylesSource, /dialog\[data-dialog-edge-anchor="top"\] > form\[class\]::before,[\s\S]*dialog\[data-dialog-edge-anchor="bottom"\] > form\[class\]::after\s*\{[^}]*content:\s*"";[^}]*display:\s*block;[^}]*flex:\s*none;/s);
  assert.match(stylesSource, /height:\s*var\(--dialog-header-flow-space,\s*0px\)/);
  assert.match(stylesSource, /height:\s*var\(--dialog-footer-flow-space,\s*0px\)/);
  assert.match(stylesSource, /dialog\[data-dialog-edge-anchor="bottom"\] > form\[class\] > \.dialog-actions,[\s\S]*dialog\[data-dialog-edge-anchor="top"\] > form\[class\] > \.solve-dialog-header\s*\{[^}]*position:\s*fixed;[^}]*left:\s*50%;[^}]*width:\s*min\([\s\S]*transform:\s*translateX\(-50%\);/s);
  assert.match(appSource, /setupDialogScrollIndicators\(\);/);
  assert.match(appSource, /setupDialogEdgeAnchors\(\);/);
  assert.match(appSource, /event\.deltaY < 0 && dialog\.scrollTop <= 0\.5[\s\S]*dialog\.dataset\.dialogEdgeAnchor = 'bottom';/s);
  assert.match(appSource, /event\.deltaY > 0 && dialog\.scrollTop >= scrollRange - 0\.5[\s\S]*dialog\.dataset\.dialogEdgeAnchor = 'top';/s);
  assert.match(appSource, /currentAnchor === 'bottom' && dialog\.scrollTop <= 0\.5[\s\S]*currentAnchor === 'top' && dialog\.scrollTop >= scrollRange - 0\.5/s);
  assert.match(appSource, /box\.height \+ marginStart \+ marginEnd/);
  assert.match(appSource, /--dialog-header-flow-space/);
  assert.match(appSource, /--dialog-footer-flow-space/);
  assert.match(appSource, /function setupDialogEdgeAnchors\(\) \{(?:(?!setTimeout)[\s\S])*?\n\}\n\nfunction setupDialogScrollIndicators/);
  assert.match(appSource, /delete dialog\.dataset\.dialogEdgeAnchor;[\s\S]*\}, \{ capture: true, passive: true \}\);[\s\S]*dialog\.addEventListener\('close'/s);
  assert.match(appSource, /const surfaceTop = dialogBox\.top \+ viewportGutter;/);
  assert.match(appSource, /const surfaceBottom = dialogBox\.bottom - viewportGutter;/);
  assert.match(appSource, /const trackTop = Math\.max\(surfaceTop \+ radius, headerBox\?\.bottom \|\| surfaceTop\) \+ clearance;/);
  assert.match(appSource, /const trackBottom = Math\.min\(surfaceBottom - radius, footerBox\?\.top \|\| surfaceBottom\) - clearance;/);
  assert.match(appSource, /const thumbLeft = dialogBox\.right - 7;/);
  assert.match(appSource, /translate3d\(\$\{thumbLeft\}px, \$\{thumbTop\}px, 0\)/);
  assert.doesNotMatch(appSource, /dialog-viewport-frame|viewportFrame/);
  assert.doesNotMatch(stylesSource, /\.dialog-viewport-frame/);
  assert.doesNotMatch(stylesSource, /dialog \.solve-dialog-header\s*\{[^}]*top:\s*-\d+px;/s);
  assert.doesNotMatch(stylesSource, /dialog \.dialog-actions\s*\{[^}]*bottom:\s*-\d+px;/s);
  assert.doesNotMatch(stylesSource, /--dialog-overscroll-y|dialog-scrollend-sentinel|dialog-overscroll-active/);
});
