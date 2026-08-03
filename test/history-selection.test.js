import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);

test('plain clicks toggle a selected compact history row off', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(appSource, /function handleCompactHistoryRowSelection\([\s\S]*?else \{\s*if \(selectedSolveIds\.has\(id\)\) \{\s*selectedSolveIds\.delete\(id\);\s*if \(historySelectionAnchorId === id\) historySelectionAnchorId = null;\s*\} else \{\s*selectedSolveIds = new Set\(\[id\]\);\s*historySelectionAnchorId = id;\s*\}/);
});
