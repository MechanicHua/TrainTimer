import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const stylesUrl = new URL('../public/styles.css', import.meta.url);

test('inspection hold shows warning immediately and success after confirmation', async () => {
  const [appSource, stylesSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(
    appSource,
    /setDatasetValue\(document\.body, 'holdReady', appState === 'hold' && holdConfirmed \? 'true' : 'false'\)/,
  );
  assert.match(
    appSource,
    /appState === 'hold' && holdReturnState === 'inspection'/,
  );
  assert.match(
    stylesSource,
    /body\[data-focus="true"\]\[data-state="hold"\]\[data-hold-ready="false"\] \.timer-display\s*\{[^}]*color:\s*var\(--warning\);/s,
  );
  assert.match(
    stylesSource,
    /body\[data-focus="true"\]\[data-state="hold"\]\[data-hold-ready="true"\] \.timer-display\s*\{[^}]*color:\s*var\(--success\);/s,
  );
  assert.match(stylesSource, /body\[data-state="hold"\] \.timer-display\s*\{[^}]*transition-duration:\s*100ms;/s);
});
