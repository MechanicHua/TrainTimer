import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('borderless actions lift and glow without a hover or focus frame', async () => {
  const [appSource, indexSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(stylesSource, /Borderless actions use the text itself as the interaction surface/);
  assert.match(
    stylesSource,
    /@property --borderless-glow-inner[\s\S]*?syntax:\s*"<percentage>";[\s\S]*?@property --borderless-glow-outer/s,
  );
  assert.match(
    stylesSource,
    /\.history-sort-button,[\s\S]*?\.algorithm-trainer-star-button\s*\)\s*\{[^}]*--borderless-glow-inner:\s*0%;[^}]*text-shadow:[^}]*var\(--borderless-glow-inner\)[^}]*transform\s+320ms cubic-bezier\(0\.37, 0, 0\.63, 1\)[^}]*filter\s+320ms[^}]*opacity\s+320ms[^}]*--borderless-glow-inner\s+320ms[^}]*\}/s,
  );
  assert.match(
    stylesSource,
    /\.history-sort-button,[\s\S]*?\.history-row button,[\s\S]*?\.stats-chart-modes button,[\s\S]*?\.algorithm-trainer-star-button[\s\S]*?:is\(:hover, :focus-visible\):not\(:disabled\)\s*\{[^}]*--borderless-glow-inner:\s*78%;[^}]*transform\s+260ms cubic-bezier\(0\.34, 0\.04, 0\.6, 1\)[^}]*filter\s+260ms[^}]*opacity\s+260ms[^}]*--borderless-glow-inner\s+0ms[^}]*background:\s*transparent !important;[^}]*box-shadow:\s*none !important;[^}]*filter:\s*brightness\(1\.22\);[^}]*transform:\s*translateY\(-2px\) !important;/s,
  );
  assert.match(
    stylesSource,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.history-sort-button,[\s\S]*?transform:\s*none !important;/s,
  );
  assert.match(
    stylesSource,
    /\.history-row :is\(\.icon-more-button, \.icon-delete-button\) > span\s*\{[^}]*text-shadow:[^}]*currentColor[^}]*var\(--borderless-glow-inner\)/s,
  );
  assert.match(
    stylesSource,
    /\.history-actions-menu > summary \.menu-glyph span\s*\{[^}]*--borderless-glow-inner:\s*0%;[^}]*box-shadow:[^}]*var\(--borderless-glow-inner\)[^}]*--borderless-glow-inner 320ms[^}]*\}[\s\S]*?summary:is\(:hover, :focus-visible\) \.menu-glyph span\s*\{[^}]*--borderless-glow-inner:\s*78%;[^}]*--borderless-glow-inner 0ms/s,
  );
  assert.match(
    stylesSource,
    /\.history-row :is\(\.icon-more-button, \.icon-delete-button\) > span\s*\{[^}]*--borderless-glow-inner:\s*0%;[^}]*text-shadow:[^}]*var\(--borderless-glow-inner\)[^}]*--borderless-glow-inner 320ms[^}]*\}[\s\S]*?\.history-row :is\(\.icon-more-button, \.icon-delete-button\):is\(:hover, :focus-visible\) > span\s*\{[^}]*--borderless-glow-inner:\s*78%;[^}]*--borderless-glow-inner 0ms/s,
  );
  assert.match(
    stylesSource,
    /\.history-table\s*\{[^}]*overflow:\s*hidden;[^}]*padding-top:\s*4px;/s,
  );
  assert.match(
    stylesSource,
    /\.history-rows\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*padding-top:\s*4px;[^}]*padding-right:\s*8px;/s,
  );
  assert.match(
    stylesSource,
    /Interactive text and its grid cell must not crop the Gaussian glow[\s\S]*?\.history-row > span:has\(> button\),\s*\.history-row button span\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/s,
  );
  assert.match(appSource, /function setBorderlessActionLabel\(element, label\) \{[^}]*setAttribute\('aria-label', label\);[^}]*removeAttribute\('title'\);/s);
  assert.match(appSource, /const accessibleLabel = active[\s\S]*setBorderlessActionLabel\(button, accessibleLabel\);/s);
  assert.doesNotMatch(appSource, /button\.title = active/);
  assert.doesNotMatch(indexSource, /<summary aria-label="打开成绩操作菜单" title=/);
  assert.doesNotMatch(appSource, /class="icon-more-button"[^>]*title="详情"/);
  assert.doesNotMatch(appSource, /class="icon-delete-button"[^>]*title=/);
});
