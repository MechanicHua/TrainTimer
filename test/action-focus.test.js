import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);

test('pointer-operated action and selection controls release focus', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(appSource, /document\.addEventListener\('click', releasePointerActionFocus\);/);
  assert.match(appSource, /document\.addEventListener\('pointerdown', rememberPointerSelectionFocus, true\);/);
  assert.match(appSource, /document\.addEventListener\('change', releasePointerSelectionFocus\);/);
  assert.match(appSource, /document\.addEventListener\('keydown', releaseFocusedActionForSpace, true\);/);
  assert.match(appSource, /event\.detail <= 0/);
  assert.match(appSource, /'button',[\s\S]*'input\[type="checkbox"\]'[\s\S]*'summary'[\s\S]*'\[role="tab"\]'/);
  assert.match(appSource, /'select',[\s\S]*'input\[type="date"\]'[\s\S]*'input\[type="file"\]'/);
  assert.match(appSource, /target\.closest\('label'\)\?\.control/);
  assert.match(appSource, /pointerReleasedFocusSelector/);
  assert.match(appSource, /function releaseControlFocus\(control\)[\s\S]*activeControl\.matches\(pointerReleasedFocusSelector\)[\s\S]*activeControl\.blur\(\)[\s\S]*requestAnimationFrame/);
  assert.match(appSource, /function releaseFocusedActionForSpace\(event\)[\s\S]*event\.code !== 'Space'[\s\S]*event\.preventDefault\(\)[\s\S]*releaseControlFocus\(control\)/);
  assert.match(appSource, /target\.closest\(pointerReleasedFocusSelector\)\) return dialogOpen;/);
  assert.doesNotMatch(appSource, /pointerActionFocusSelector[\s\S]*'textarea'/);
});
