// scripts/build-extension.mjs
// Builds the FF Helper browser extension into extension/dist/ and zips it to
// public/ffhelper-extension.zip (what the app's Download button serves).
//   npm run build:extension

import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'extension/src');
const dist = join(root, 'extension/dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, minify: false, target: 'chrome111', logLevel: 'warning', legalComments: 'none' };
// Content scripts and the popup are classic scripts; the background worker is a module.
await build({ ...common, entryPoints: ['content-main', 'content-relay', 'popup'].map(n => join(src, `${n}.ts`)), outdir: dist, format: 'iife' });
await build({ ...common, entryPoints: [join(src, 'background.ts')], outdir: dist, format: 'esm' });

copyFileSync(join(root, 'extension/manifest.json'), join(dist, 'manifest.json'));
copyFileSync(join(src, 'popup.html'), join(dist, 'popup.html'));
copyFileSync(join(root, 'assets/icon.png'), join(dist, 'icon.png'));
copyFileSync(join(root, 'extension/PRIVACY.md'), join(dist, 'PRIVACY.md'));

const files = {};
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[`ffhelper-extension/${relative(dist, p)}`] = readFileSync(p);
  }
};
walk(dist);
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/ffhelper-extension.zip'), zipSync(files, { level: 9 }));
console.log(`Built extension/dist (${Object.keys(files).length} files) and public/ffhelper-extension.zip`);
