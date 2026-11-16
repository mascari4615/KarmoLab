// 옮길 도구와 남는 위젯이 함께 쓰는 소스 측정. 실행: node scripts/dep-scan.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lab = resolve(app, '../karmolab');
const esbuild = createRequire(join(lab, 'package.json'))('esbuild');
const dist = JSON.parse(readFileSync(join(app, 'dist/js/tools.js'), 'utf8').replace(/^window\.__KARMO_EDIT__=/, '').replace(/;$/, ''));
const moved = new Set(Object.values(dist.paths).flat().map((p) => 'src/widgets/' + p + '.ts'));

async function inputs(entry) {
  const r = await esbuild.build({ entryPoints: [join(lab, entry)], bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', loader: { '.css': 'text' }, logLevel: 'silent', define: { __KARMOLAB_BUILD__: '""', __KARMOLAB_APP_BASE__: '""', __KARMOLAB_COMMIT__: '""', __KARMOLAB_GOOGLE_CLIENT_ID__: '""' } });
  return Object.keys(r.metafile.inputs).map((p) => relative(lab, resolve(lab, p)).replaceAll('\\', '/'));
}

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});
const usedByMoved = new Map();
for (const e of moved) for (const i of await inputs(e)) if (!moved.has(i)) usedByMoved.set(i, (usedByMoved.get(i) || 0) + 1);

const others = walk(join(lab, 'src')).map((p) => relative(lab, p).replaceAll('\\', '/')).filter((p) => !moved.has(p) && !p.endsWith('.d.ts'));
const text = new Map(others.map((p) => [p, readFileSync(join(lab, p), 'utf8')]));
for (const [dep, n] of [...usedByMoved].sort()) {
  const stem = dep.replace(/\.ts$/, '').split('/').pop();
  const users = others.filter((p) => p !== dep && !usedByMoved.has(p) && new RegExp(`from '[^']*/${stem}'|import\\('[^']*/${stem}'`).test(text.get(p)));
  console.log(`${dep} moved=${n} rest=${users.length}${users.length ? ' ' + users.slice(0, 4).join(',') : ''}`);
}
console.log('옮기는 진입 파일', moved.size);
