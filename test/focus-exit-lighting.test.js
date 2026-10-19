import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('leaving timer focus brightens the existing interface without replaying panel entry', async () => {
  const [appSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(appSource, /if \(focusActive\) setDatasetValue\(document\.body, 'focusVisited', 'true'\)/);
  assert.match(appSource, /transition === 'leave' \? timerFocusLeaveTransitionMs : timerFocusEnterTransitionMs/);
  assert.match(appSource, /const timerFocusLeaveTransitionMs = 360/);
  assert.match(
    stylesSource,
    /body:not\(\[data-focus-visited="true"\]\) \.app-shell\s*\{[^}]*animation:\s*interface-startup-light-on 2200ms/s,
  );
  assert.match(stylesSource, /@property --timer-interface-opacity\s*\{[^}]*inherits: true;[^}]*initial-value: 1;/s);
  assert.match(stylesSource, /body\s*\{\s*--timer-interface-opacity: 1;\s*transition: --timer-interface-opacity 320ms/);
  assert.match(stylesSource, /body\[data-focus="true"\]\s*\{\s*--timer-interface-opacity: 0\.045;/);
  assert.match(stylesSource, /\.timer-surface > :not\(\.timer-display\)\s*\{\s*opacity: var\(--timer-interface-opacity\);\s*transition: transform/);
  assert.match(stylesSource, /\.history-panel \.history-row,[\s\S]*?\{\s*animation: none;/);
  assert.doesNotMatch(stylesSource, /focus-background-light-on|animation: inspection-dim-in/);

});

test('focus exit cleanup and repeated renders do not restart the fade', async () => {
  const source = await readFile(appUrl, 'utf8');
  const timers = new Map();
  let nextTimer = 0;
  const body = { dataset: { focus: 'true', focusVisited: 'true' } };
  const context = {
    document: { body }, timerFocusTransitionTimer: 0,
    timerFocusEnterTransitionMs: 360, timerFocusLeaveTransitionMs: 360,
    window: {
      clearTimeout: (id) => timers.delete(id),
      setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    },
    setDatasetValue: (element, key, value) => { element.dataset[key] = value; },
    timerFocusActive: () => body.dataset.focus === 'true',
    bluetooth3dUiActive: () => false, syncBluetooth3dFocusHost() {}, finishScrambleTextTransition() {},
  };
  const start = source.indexOf('function setTimerFocusDataset(');
  const end = source.indexOf('\nfunction timerFocusActive()', start);
  runInNewContext(source.slice(start, end), context);
  assert.equal(context.setTimerFocusDataset(false), true);
  const exitTimer = context.timerFocusTransitionTimer;
  assert.equal(body.dataset.focusTransition, 'leave');
  assert.equal(timers.get(exitTimer).delay, 360);
  assert.equal(context.setTimerFocusDataset(false), false);
  assert.equal(context.timerFocusTransitionTimer, exitTimer);
  timers.get(exitTimer).callback();
  assert.equal(body.dataset.focus, 'false');
  assert.equal(body.dataset.focusVisited, 'true');
  assert.equal(body.dataset.focusTransition, undefined);
  assert.equal(context.setTimerFocusDataset(false), false);

  context.setTimerFocusDataset(true);
  context.setTimerFocusDataset(false);
  const interruptedExit = context.timerFocusTransitionTimer;
  context.setTimerFocusDataset(true);
  assert.equal(timers.has(interruptedExit), false);
  assert.equal(body.dataset.focusTransition, 'enter');
  assert.equal(body.dataset.focus, 'true');
});


test('saving and focus exit do not suppress formula transitions or restart shell lighting', async () => {
  const source = await readFile(appUrl, 'utf8');
  const capture = source.slice(source.indexOf('function captureScrambleTextTransition()'), source.indexOf('\nfunction animateScrambleTextTransition('));
  let captures = 0;
  const context = {
    appState: 'saving', document: { body: { dataset: { focusTransition: 'leave' } } },
    scrambleTextTransitionReducedMotion() { captures++; return true; },
    finishScrambleTextTransition() {},
  };
  runInNewContext(capture, context);
  for (const state of ['saving', 'done', 'ready']) {
    context.appState = state;
    context.captureScrambleTextTransition();
  }
  assert.equal(captures, 3);
  assert.doesNotMatch(capture, /setTimerFocusDataset|focusTransition\s*=/);
});
