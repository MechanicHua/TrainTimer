import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const threeVendorPath = join(projectRoot, 'public', 'vendor', 'three.module.js');

test('bundled Three.js module is self-contained for packaged runtime', async () => {
  const source = await readFile(threeVendorPath, 'utf8');
  assert.doesNotMatch(source, /\.\.\/\.\.\/node_modules|node_modules[\\/]three/);

  const three = await import(pathToFileURL(threeVendorPath).href);
  assert.equal(three.REVISION, '165');
  assert.equal(typeof three.Scene, 'function');
  assert.equal(typeof three.WebGLRenderer, 'function');
});
