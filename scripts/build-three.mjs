import { copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['public/app.js', 'public/cube3d-material.js'];
const exports = new Set(['REVISION']);
for (const file of files) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const match of source.matchAll(/\bTHREE\.([A-Za-z][A-Za-z0-9]*)/g)) exports.add(match[1]);
}

await build({
  stdin: {
    contents: `export { ${[...exports].sort().join(', ')} } from 'three';`,
    resolveDir: root,
    sourcefile: 'three-entry.js',
  },
  outfile: `${root}public/vendor/three.module.js`,
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  // Keep embedded GLSL escaped; raw template strings retain upstream whitespace.
  supported: { 'template-literal': false },
  legalComments: 'inline',
  banner: { js: '/*! Three.js r165 | MIT License | Copyright 2010-2024 Three.js Authors */' },
});

await copyFile(`${root}node_modules/three/LICENSE`, `${root}public/vendor/three.LICENSE.txt`);
for (const file of ['three.module.js', 'three.LICENSE.txt']) {
  await copyFile(`${root}public/vendor/${file}`, `${root}TrainTimer.app/Contents/Resources/runtime/public/vendor/${file}`);
}
