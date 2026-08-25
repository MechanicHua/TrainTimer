import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('leaving timer focus brightens the existing interface without replaying panel entry', async () => {
  const [appSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(appSource, /if \(focusActive\) setDatasetValue\(document\.body, 'focusVisited', 'true'\)/);
  assert.match(appSource, /transition === 'leave' \? timerFocusLeaveTransitionMs : timerFocusEnterTransitionMs/);
  assert.match(appSource, /const timerFocusLeaveTransitionMs = 720/);
  assert.match(
    stylesSource,
    /body:not\(\[data-focus-visited="true"\]\) \.app-shell > \*\s*\{[^}]*animation:\s*panel-in 360ms/s,
  );
  assert.match(
    stylesSource,
    /body\[data-focus-transition="leave"\] \.app-shell > :not\(\.timer-band\)[\s\S]*animation:\s*focus-background-light-on 680ms[^;]*both;/,
  );
  const lightOnKeyframes = stylesSource.match(/@keyframes focus-background-light-on\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(lightOnKeyframes, /opacity:\s*0\.045;[\s\S]*opacity:\s*1;/);
  assert.doesNotMatch(lightOnKeyframes, /transform:|filter:|translate|scale/);
});
