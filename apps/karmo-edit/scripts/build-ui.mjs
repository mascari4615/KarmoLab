// 옮길 도구를 KarmoLab 소스에서 묶어 dist 로 출력
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lab = resolve(app, '../karmolab');
const require = createRequire(join(lab, 'package.json'));
const esbuild = require('esbuild');

const dist = join(app, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'js'), { recursive: true });

const table = JSON.parse(readFileSync(join(app, 'tools.json'), 'utf8'));
const hubIds = Object.keys(table.hubs);
const ids = [...hubIds, ...Object.values(table.hubs).flat(), ...table.standalone];

// 도구별 스크립트 경로는 도구 표 정본에서 읽음
const metaPath = join(app, 'src/tool-meta.ts');
const metaSrc = readFileSync(metaPath, 'utf8');
const paths = {};
for (const part of metaSrc.split(/\n  \{\n/).slice(1)) {
  const id = part.match(/id: '([^']+)'/)?.[1];
  if (!ids.includes(id)) continue;
  const raw = part.match(/lazyScriptPaths: \[([^\]]*)\]/)?.[1] ?? '';
  const list = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  paths[id] = list.filter((p) => !/^(root|world|vendor)\//.test(p));
}
const missing = ids.filter((id) => !paths[id]?.length);
if (missing.length) throw new Error('도구 표에 없음: ' + missing.join(', '));

const define = {
  __KARMOLAB_BUILD__: '"karmo-edit"',
  __KARMOLAB_APP_BASE__: '"/"',
  __KARMOLAB_COMMIT__: '"local"',
  __KARMOLAB_GOOGLE_CLIENT_ID__: '""',
};
const common = { alias: { '@lab': join(lab, 'src') }, nodePaths: [join(lab, 'node_modules')], bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], loader: { '.css': 'text' }, define, logLevel: 'warning' };

// imageconvert 로더가 스크립트로 불러오는 세 파일 포함
const scripts = [...new Set([...Object.values(paths).flat(), 'imageconvert/core', 'imageconvert/batch-pipeline', 'imageconvert/widget'])];
for (const rel of scripts) {
  await esbuild.build({ ...common, entryPoints: [join(app, 'src/widgets', rel + '.ts')], outfile: join(dist, 'js/widgets', rel + '.js') });
}
await esbuild.build({ ...common, entryPoints: [metaPath], outfile: join(dist, 'js/meta.js') });
await esbuild.build({ ...common, entryPoints: [join(lab, 'src/gemini.ts')], outfile: join(dist, 'js/gemini.js') });

// 도구가 ensureScript 로 부르는 외부 라이브러리
for (const f of ['jszip.min.js', 'lame.min.js', 'wasm-media-encoder.min.js', 'ogg-vorbis.wasm', 'pdf-lib.min.js', 'pdfjs.min.js', 'pdfjs.worker.min.js']) {
  const from = join(lab, 'js/vendor', f);
  if (existsSync(from)) cpSync(from, join(dist, 'js/vendor', f));
}
cpSync(join(lab, 'img/stickers'), join(dist, 'img/stickers'), { recursive: true });
await esbuild.build({ ...common, entryPoints: [join(app, 'host/host.ts')], outfile: join(dist, 'js/host.js') });

// i18n 파일을 미리 포함, 네트워크 요청 없음
const i18nDirs = [join(app, 'i18n/ko'), join(lab, 'i18n/ko')];
const hasNs = (ns) => i18nDirs.some((d) => existsSync(join(d, ns + '.json')));
const namespaces = new Set(['widgets', 'widgets-desc']);
for (const rel of scripts) {
  const js = readFileSync(join(dist, 'js/widgets', rel + '.js'), 'utf8');
  for (const m of js.matchAll(/["']([a-z0-9-]+)\.[a-zA-Z0-9_.-]+["']/g)) {
    if (hasNs(m[1])) namespaces.add(m[1]);
  }
}
const store = {};
for (const ns of namespaces) {
  store[ns] = {};
  for (const d of [...i18nDirs].reverse()) {
    const p = join(d, ns + '.json');
    if (existsSync(p)) Object.assign(store[ns], JSON.parse(readFileSync(p, 'utf8')));
  }
  // 시험은 머리말 없이 묶음별 파일을 받음
  mkdirSync(join(dist, 'js/i18n/ko'), { recursive: true });
  writeFileSync(join(dist, 'js/i18n/ko', ns + '.js'), `(window.__KARMO_I18N=window.__KARMO_I18N||{}).ko=window.__KARMO_I18N.ko||{};window.__KARMO_I18N.ko[${JSON.stringify(ns)}]=${JSON.stringify(store[ns])};`);
}
writeFileSync(
  join(dist, 'js/i18n.js'),
  `window.__KARMO_LOCALE="ko";window.__KARMO_I18N={ko:${JSON.stringify(store)}};window.__KARMO_I18N_NS=${JSON.stringify([...namespaces])};`,
);

cpSync(join(lab, 'css'), join(dist, 'css'), { recursive: true });
cpSync(join(lab, 'fonts'), join(dist, 'fonts'), { recursive: true });
for (const f of ['fonts.css', 'shell-critical.css', 'toolbox.css', 'tools.css']) {
  const css = join(dist, 'css', f);
  writeFileSync(css, readFileSync(css, 'utf8').replaceAll('/apps/karmolab/fonts/', '../fonts/'));
}
writeFileSync(join(dist, 'js/tools.js'), `window.__KARMO_EDIT__=${JSON.stringify({ table, paths })};`);
writeFileSync(join(dist, 'js/boot.js'), 'window.__karmoEditBoot();');
cpSync(join(app, 'host/index.html'), join(dist, 'index.html'));
console.log(`[karmo-edit] 도구 ${ids.length}개, 스크립트 ${scripts.length}개, 말 묶음 ${namespaces.size}개`);
