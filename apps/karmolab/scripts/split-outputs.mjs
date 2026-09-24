/**
 * 지어 놓은 사이트 하나 (`apps/blog/_site`) 를 배포 셋으로 가른다 (memo change.site-split)
 *
 * 왜: Pages 한 채는 뿌리가 하나. 주소마다 첫 화면이 다르려면 배포도 그만큼
 *
 * 무엇을 하나
 *   dist/lab   사이트 전부에서 글 (`posts/`, `about/`, `feed.xml`) 과 `dash/` 를 뺀 것. 뿌리는 KarmoLab 셸
 *   dist/blog  글 장과 그 장들이 부르는 자산만. 뿌리는 글 목록
 *   dist/dash  대시보드 장과 그 장이 부르는 자산만. 뿌리는 대시보드 front
 * 자산 고르기는 `lib/site-closure.mjs`. 남의 주소는 `_redirects` 로 주인에게 301
 * (2026-09-24 전: 셋 다 사이트 통째, 177MB 씩. blog 주소에서도 도구 장)
 * 사용: node scripts/split-outputs.mjs [--site ../blog/_site] [--out ../blog/dist]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectClosure } from './lib/site-closure.mjs';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const SITE = argOf('--site', path.join(APP_ROOT, '..', 'blog', '_site'));
const OUT = argOf('--out', path.join(APP_ROOT, '..', 'blog', 'dist'));

/** 주소 셋. 남의 장으로 가는 넘김은 절대 주소 */
const HOST = {
  lab: 'https://lab.mascari4615.com',
  blog: 'https://blog.mascari4615.com',
  dash: 'https://dash.mascari4615.com',
};

/** blog 가 제 것으로 갖는 자리 (뿌리 기준). 소개는 blog 소속 (2026-09-23) */
const BLOG_OWN = ['posts', 'about', 'feed.xml'];
/** 검색엔진 소유 확인 파일과 공용 머리 파일. blog 가 원래 받던 것 */
const BLOG_MISC = ['favicon.ico', 'robots.txt', 'sitemap.xml', 'sitemap-root.xml', 'BingSiteAuth.xml',
  'google60bc79db990fe5c1.html', 'naver168462012081b99da50f415e1c397edd.html', 'c5e898af83d2834954623defca543f69.txt'];
/** 소개 화면이 이름을 조립해 읽는 자료 (`widgets/about/`). 글자로 안 드러나 따라가기가 못 찾는다 */
const ABOUT_DATA = ['about', 'works', 'about-presentation'].map((n) => `apps/karmolab/data/${n}.json`);
/** 파일 여럿이 같이 쓰는 자산 자리. 사이트마다 부르는 파일만 담고, 넘김 규칙은 안 건다 */
const SHARED = new Set(['apps', 'assets']);

/**
 * 앱마다: 뿌리 장, 담는 방식, 넘김.
 *   lab  사이트 전부에서 blog, dash 자리만 제외 (도구, 오락실, 커뮤니티가 서로 참조)
 *   blog, dash  시작 파일이 부르는 자산만 (`collectClosure`). 나머지 주소는 주인에게 301
 */
const APPS = [
  { id: 'lab', root: 'index.html', drop: [...BLOG_OWN, 'dash'] },
  { id: 'blog', root: path.join('posts', 'index.html'), seeds: [...BLOG_OWN, ...BLOG_MISC, ...ABOUT_DATA, 'build.json'] },
  { id: 'dash', root: path.join('dash', 'index.html'), seeds: ['dash', 'favicon.ico', 'build.json'] },
];

/** 주인이 다른 자리로 가는 넘김 줄. `/x/*` 와 `/x` 둘 다 */
function movesFor(app, top) {
  const owner = (name) => (BLOG_OWN.includes(name) ? 'blog' : name === 'dash' ? 'dash' : 'lab');
  const lines = [];
  for (const name of top) {
    if (SHARED.has(name)) continue;
    const who = owner(name);
    if (who === app.id) continue;
    if (app.id !== 'lab' && who === 'lab' && app.seeds.includes(name)) continue;
    const isFile = fs.statSync(path.join(SITE, name)).isFile();
    if (isFile) {
      if (who === 'lab') continue; /* 뿌리의 lab 파일 (sw.js, llms.txt 등) 은 넘기지 않는다 */
      lines.push(`/${name} ${HOST[who]}/${name} 301`);
    } else if (who === 'dash') {
      /* dash 호스트에서는 뿌리가 대시보드 장이다 */
      lines.push(`/${name}/* ${HOST.dash}/ 301`, `/${name} ${HOST.dash}/ 301`);
    } else {
      lines.push(`/${name}/* ${HOST[who]}/${name}/:splat 301`, `/${name} ${HOST[who]}/${name}/ 301`);
    }
  }
  return lines;
}

/**
 * 빌드는 모든 절대 주소를 blog 호스트로 굽는다 (대표 주소, og:url, hreflang, 사이트맵, robots).
 * 배포마다 주소의 주인 호스트로 고친다. lab 장을 blog 주소로 가리키면 그 주소가 다시 lab 으로 301 이라
 * 검색엔진이 받는 신호가 서로 엇갈린다 (2026-09-24 실측: lab 도구 장의 canonical 이 blog)
 *   blog 자리 (`posts/`, `about/`, `feed.xml`) 는 blog, `dash/` 는 dash, lab 자리는 lab
 *   공용 자산 (`apps/`, `assets/`) 과 뿌리 파일 (사이트맵, robots) 은 지금 배포의 호스트
 */
const BLOG_ORIGIN_RE = /https:\/\/blog\.mascari4615\.com\/([^"'\s<>)\]]*)/g;
function hostFor(app, rest) {
  const seg = rest.split(/[/?#]/)[0];
  if (BLOG_OWN.includes(seg)) return HOST.blog;
  if (seg === 'dash') return HOST.dash;
  const shared = SHARED.has(seg) || seg === '' || fs.existsSync(path.join(SITE, seg)) && fs.statSync(path.join(SITE, seg)).isFile();
  if (shared) return HOST[app.id];
  return HOST.lab;
}

/** 사이트맵에서 이 배포 호스트가 아닌 주소 줄을 뺀다. blog 는 뿌리 (`/`, 글 목록과 같은 장) 도 뺀다 */
function ownSitemap(app, xml) {
  return xml.replace(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>\s*/g, (block, loc) => {
    if (!loc.startsWith(HOST[app.id] + '/')) return '';
    if (app.id === 'blog' && loc === HOST.blog + '/') return '';
    return block;
  });
}

function rehost(app, dest) {
  let files = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(html|xml|txt)$/.test(e.name)) continue;
      const before = fs.readFileSync(p, 'utf8');
      let after = before.replace(BLOG_ORIGIN_RE, (all, rest) => hostFor(app, rest) + '/' + rest);
      if (/^sitemap.*\.xml$/.test(e.name) && path.dirname(p) === dest) after = ownSitemap(app, after);
      if (after !== before) { fs.writeFileSync(p, after); files += 1; }
    }
  };
  walk(dest);
  return files;
}

/** blog, dash 는 lab 의 404 장 (셸 전체를 부른다) 대신 한 장짜리 */
function notFound(app) {
  const home = app.id === 'blog' ? '/posts/' : '/';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>404</title>` +
    `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px/1.6 system-ui,sans-serif;background:#0f141c;color:#f2f4f7}a{color:#f0a04b}</style>` +
    `</head><body><p>없는 주소입니다. <a href="${home}">처음으로</a></p></body></html>\n`;
}

if (!fs.existsSync(SITE)) {
  console.error(`[split-outputs] 지어 놓은 사이트가 없다: ${SITE}. 먼저 assemble-site.mjs`);
  process.exit(2);
}

fs.rmSync(OUT, { recursive: true, force: true });
const top = fs.readdirSync(SITE);
const made = [];
for (const app of APPS) {
  const rootFile = path.join(SITE, app.root);
  if (!fs.existsSync(rootFile)) {
    console.error(`[split-outputs] ${app.id}: 뿌리로 쓸 장이 없다 (${app.root})`);
    process.exit(1);
  }
  const dest = path.join(OUT, app.id);
  if (app.drop) {
    fs.cpSync(SITE, dest, { recursive: true, filter: (src) => !app.drop.includes(path.relative(SITE, src).split(path.sep)[0]) });
  } else {
    const keep = collectClosure(SITE, app.seeds, { noFollow: ['robots.txt', 'sitemap.xml', 'sitemap-root.xml', 'feed.xml'] });
    for (const rel of keep) {
      const to = path.join(dest, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(SITE, rel), to);
    }
    fs.writeFileSync(path.join(dest, '404.html'), notFound(app));
  }
  fs.copyFileSync(rootFile, path.join(dest, 'index.html'));
  const moves = movesFor(app, top);
  if (moves.length) fs.writeFileSync(path.join(dest, '_redirects'), moves.join('\n') + '\n');
  const rehosted = app.id === 'dash' ? 0 : rehost(app, dest);
  let count = 0;
  let bytes = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { count += 1; bytes += fs.statSync(p).size; } } };
  walk(dest);
  made.push(`${app.id} (뿌리 ${app.root}, 파일 ${count}개, ${(bytes / 1e6).toFixed(1)}MB, 넘김 ${moves.length}줄, 호스트 고친 파일 ${rehosted}개)`);
}
console.log(`[split-outputs] 배포 ${made.length}벌 → ${OUT}\n  - ${made.join('\n  - ')}`);
