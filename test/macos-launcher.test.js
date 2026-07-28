import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('macOS launcher does not depend on experimental Chrome wheel features', async () => {
  const source = await readFile(join(projectRoot, 'scripts', 'macos-launcher.m'), 'utf8');
  assert.doesNotMatch(source, /WheelEventMomentum/);
  assert.doesNotMatch(source, /TrainTimerChromeArguments/);
});
