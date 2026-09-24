#!/usr/bin/env node
/**
 * lab, blog, dash 코드 경계 (memo change.site-split, 2026-09-24)
 *
 * 셋은 한 폴더 (`apps/karmolab/src/`), 빌드도 하나. 폴더 분리 대신 경계 측정
 *   dash  진입 `dash-app.ts` 에서 import 로 닿는 파일은 dash 자리 또는 공용 `lib/` 만
 *   blog  진입 `blog-app.ts`, `about-page.ts` 에서 닿는 파일은 blog 자리 또는 `lib/` 만
 *   lab   나머지 파일의 dash, blog 자리 import 금지
 * 닿은 파일에 lab 셸 전역 (`Toolbox`, `Mdd`) 이 나오면 그것도 넘은 것
 *
 * 지금 넘는 줄은 KNOWN. **늘 때만** 빨강, 갚으면 KNOWN 삭제 안내
 * exit 0 통과, 1 새로 넘음
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(APP, 'src');

const SITES = {
  dash: { entries: ['dash-app.ts'], own: ['dash-app.ts', 'widgets/mydash/', 'widgets/planner/'] },
  blog: { entries: ['blog-app.ts', 'about-page.ts'], own: ['blog-app.ts', 'blog-comments.ts', 'about-page.ts', 'widgets/about/'] },
};
const SHARED = ['lib/'];

/** 알고 있는 넘는 줄. `사이트: 파일` 또는 `lab -> 파일`. 갚으면 지운다 */
const KNOWN = new Set([
  /* dash 의 메뉴 버튼이 lab 과 같은 ESC 메뉴를 쓴다. 칸만 대시보드 방 (shell.ts setMenuCells) */
  'dash: esc-menu.ts',
  /* blog 댓글의 마크다운 렌더가 lab 커뮤니티 위젯 것 */
  'blog: widgets/community-markdown.ts',
]);

const rel = (abs) => path.relative(SRC, abs).split(path.sep).join('/');
const inZone = (r, zone) => zone.some((z) => (z.endsWith('/') ? r.startsWith(z) : r === z));

function resolveImport(fromAbs, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromAbs), spec.replace(/\.js$/, ''));
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
function importsOf(abs) {
  const text = fs.readFileSync(abs, 'utf8');
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || /\.(css|svg|png|json)$/.test(spec)) continue;
    const r = resolveImport(abs, spec);
    if (r) out.push(r);
  }
  return out;
}

const GLOBAL_RE = /\b(?:window\.)?(Toolbox|Mdd)\s*[.(?]/;
const found = new Set();

for (const [site, cfg] of Object.entries(SITES)) {
  const seen = new Set();
  const queue = cfg.entries.map((e) => path.join(SRC, e));
  while (queue.length) {
    const abs = queue.shift();
    if (seen.has(abs)) continue;
    seen.add(abs);
    const r = rel(abs);
    if (inZone(r, SHARED)) continue; /* 공용 안쪽은 안 따라간다 */
    if (!inZone(r, cfg.own)) { found.add(`${site}: ${r}`); continue; }
    const g = GLOBAL_RE.exec(fs.readFileSync(abs, 'utf8'));
    if (g) found.add(`${site}: ${r} (lab 전역 ${g[1]})`);
    queue.push(...importsOf(abs));
  }
}

/* lab 쪽: dash, blog 자리를 import 하는 lab 파일 */
const zones = Object.values(SITES).flatMap((c) => c.own);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
for (const abs of walk(SRC)) {
  const r = rel(abs);
  if (inZone(r, zones) || inZone(r, SHARED)) continue;
  for (const dep of importsOf(abs)) {
    const d = rel(dep);
    if (inZone(d, zones)) found.add(`lab -> ${d} (${r})`);
  }
}

const grown = [...found].filter((f) => !KNOWN.has(f));
const repaid = [...KNOWN].filter((k) => !found.has(k));
console.log(`[site-boundary] 넘는 줄 ${found.size}개 (알던 것 ${found.size - grown.length})`);
for (const f of found) console.log(`  ${KNOWN.has(f) ? '·' : '✗'} ${f}`);
if (repaid.length) console.log(`[site-boundary] 갚은 줄 ${repaid.length}개. KNOWN 에서 지워라: ${repaid.join(', ')}`);
if (grown.length) {
  console.error(`[site-boundary] 새로 넘은 줄 ${grown.length}개. dash, blog 는 제 자리와 src/lib/ 만 쓴다. 공용이면 src/lib/ 로 옮겨라`);
  process.exit(1);
}
process.exit(0);
