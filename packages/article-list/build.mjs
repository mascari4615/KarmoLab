import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const { build } = createRequire(path.join(root, 'apps/karmolab/package.json'))('esbuild');
const memo = process.env.KARMO_MEMO_SRC || path.resolve(root, '../memo');
const destinations = [path.join(root, 'apps/karmo-dev-extension/vendor'), path.join(memo, 'projects/karmo-ai/cup/app/vendor')];
for (const [i, dir] of destinations.entries()) {
  const bundled = await build({ entryPoints: [path.join(here, 'index.js')], bundle: true, format: i === 0 ? 'iife' : 'esm', globalName: i === 0 ? 'KarmoArticleList' : undefined, target: 'es2022', write: false });
  const files = { 'article-list.js': '/* Generated from packages/article-list. Run node packages/article-list/build.mjs. Do not edit. */\n' + bundled.outputFiles[0].text, 'article-list.css': '/* Generated from packages/article-list/article-list.css. Do not edit. */\n' + fs.readFileSync(path.join(here, 'article-list.css'), 'utf8') };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (process.argv.includes('--check')) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) throw new Error(`Article list SSOT drift: ${file}`);
    } else { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, content); }
  }
}
console.log('PASS article-list SSOT: 2 consumers');
