import { build } from 'esbuild';
import { access, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['public/app.js', 'public/correction-worker.js'],
  outdir: 'public', entryNames: '[name].bundle',
  bundle: true, format: 'esm', target: 'es2022', minify: true, metafile: true,
  plugins: [{ name: 'canonical-browser-modules', setup(build) {
    build.onResolve({ filter: /^\.\// }, async (args) => {
      if (args.path.startsWith('./vendor/')) return { path: args.path, external: true };
      const clean = args.path.split('?')[0];
      const local = resolve(args.resolveDir, clean);
      try { await access(local); return { path: local }; } catch {}
      const source = resolve(root, 'src', clean);
      try { await access(source); return { path: source }; } catch {}
    });
  } }],
});
const inputs = {};
for (const file of Object.keys(result.metafile.inputs).sort()) {
  inputs[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
}
const outputs = {};
for (const file of ['public/app.bundle.js', 'public/correction-worker.bundle.js', 'public/styles.css']) {
  outputs[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
}
const indexPath = resolve(root, 'public/index.html');
const index = (await readFile(indexPath, 'utf8'))
  .replace(/app\.bundle\.js\?v=[^"\s]+/g, `app.bundle.js?v=${outputs['public/app.bundle.js'].slice(0, 12)}`)
  .replace(/styles\.css\?v=[^"\s]+/g, `styles.css?v=${outputs['public/styles.css'].slice(0, 12)}`);
await writeFile(indexPath, index);
await writeFile(resolve(root, 'public/build-manifest.json'), JSON.stringify({ inputs, outputs }, null, 2) + '\n');
// The desktop launcher must run exactly the same implementation as npm run web.
for (const directory of ['public', 'src', 'vendor']) {
  await cp(resolve(root, directory), resolve(root, 'TrainTimer.app/Contents/Resources/runtime', directory), { recursive: true });
}
console.log('Built browser entrypoints and synchronized desktop runtime.');
