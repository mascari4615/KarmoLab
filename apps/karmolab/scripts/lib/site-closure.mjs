/**
 * 지어 놓은 사이트에서 **시작 파일이 부르는 것만** 모은다 (memo change.site-split, 2026-09-24)
 *
 * 왜: 배포 셋이 사이트 한 채를 통째로 복사해 갔다 (177MB, 파일 6,500여 개). blog 주소에서
 * `/t/<도구>/` 가 뜨고, dash 배포에 도구 장 312개. 셋의 차이는 뿌리 한 장뿐
 *
 * 방식: 시작 파일에서 글자로 드러난 주소를 따라간다. HTML, CSS, JS, JSON, XML 안의
 *   절대 주소 (`/apps/karmolab/js/blog-app.1a2b.js`), CSS `url()`, JS 의 상대 주소 (`./chunk-x.js`)
 * 코드로 조립하는 주소 (`'/i18n/' + lang + '.js'`) 는 글자로 안 드러난다. 그래서 디렉터리 모양
 * 문자열 (`/apps/karmolab/i18n/ko/`) 이 나오면 그 디렉터리를 통째로 담는다. 너무 넓은 자리는 제외 (BROAD)
 * 놓친 파일은 배포 뒤 404. 확인은 `test-split-outputs.mjs` (실제 화면을 열어 측정)
 */
import fs from 'node:fs';
import path from 'node:path';

const TEXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.webmanifest', '.svg']);

/** 통째로 담으면 사이트 반이 따라오는 자리. 이 안은 파일 단위로만 */
const BROAD = new Set(['', 'apps', 'apps/karmolab', 'apps/karmolab/js', 'apps/karmolab/js/widgets', 'apps/karmolab/css',
  'apps/karmolab/img', 'apps/karmolab/data', 'assets', 'assets/img', 't', 'posts', 'en', 'ja', 'c', 'u', 'wm', 'bot', 'files', 'packages']);

/** 글자로 드러난 주소. 따옴표, 괄호, 등호, 공백, 쉼표 뒤의 `/` 로 시작하는 것 */
const ABS_RE = /(?:["'`(=\s,])(\/(?!\/)[A-Za-z0-9_\-./%~@+]+)/g;
const CSS_URL_RE = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
const REL_RE = /["'`](\.{1,2}\/[A-Za-z0-9_\-./%~@+]+)["'`]/g;

/**
 * @param {string} site 지어 놓은 사이트 뿌리
 * @param {string[]} seeds 뿌리 기준 시작 경로. 디렉터리면 그 안 전부
 * @param {{ noFollow?: string[], via?: Map<string, string> }} [opts] noFollow: 담기는 하되 안을 안 따라갈 파일. via: 파일마다 처음 부른 파일을 받아 갈 표
 * @returns {Set<string>} 뿌리 기준 경로 (빗금 `/`)
 */
export function collectClosure(site, seeds, opts = {}) {
  site = path.resolve(site);
  const noFollow = new Set(opts.noFollow || []);
  /** 파일마다 처음 부른 파일. 딸려 온 이유를 찾을 때 */
  const via = opts.via || new Map();
  let current = '';
  const out = new Set();
  const queue = [];
  const norm = (rel) => rel.split(path.sep).join('/').replace(/^\/+/, '');

  function addFile(rel) {
    rel = norm(rel);
    if (out.has(rel)) return;
    out.add(rel);
    via.set(rel, current);
    queue.push(rel);
  }
  function addDir(rel) {
    const abs = path.join(site, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) addDir(child);
      else addFile(child);
    }
  }
  /** 주소 하나를 파일로. 없으면 무시 (외부 주소, 해시 주소, 코드 조각) */
  function resolve(rel, fromDirectoryString) {
    rel = rel.split(/[?#]/)[0];
    try { rel = decodeURIComponent(rel); } catch { return; }
    rel = rel.replace(/^\/+/, '');
    const abs = path.join(site, rel);
    if (!abs.startsWith(site)) return;
    let st;
    try { st = fs.statSync(abs); } catch { return; }
    /* 다른 장 (HTML) 으로 가는 주소는 링크, 자산 아님. 제 장은 시작 파일로만
       (blog 장의 `/t/qr/` 링크, dash 의 `/posts/` 링크는 그 주인 배포가 받는다. `_redirects`) */
    if (st.isFile()) { if (!/\.html?$/i.test(rel)) addFile(rel); return; }
    const dir = rel.replace(/\/+$/, '');
    if (fs.existsSync(path.join(abs, 'index.html'))) return;
    if (fromDirectoryString && !BROAD.has(dir)) addDir(dir);
  }

  for (const s of seeds) {
    const abs = path.join(site, s);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) addDir(norm(s).replace(/\/+$/, ''));
    else addFile(s);
  }

  while (queue.length) {
    const rel = queue.shift();
    current = rel;
    if (noFollow.has(rel) || !TEXT.has(path.extname(rel).toLowerCase())) continue;
    let text;
    try { text = fs.readFileSync(path.join(site, rel), 'utf8'); } catch { continue; }
    const here = path.posix.dirname(rel);
    for (const m of text.matchAll(ABS_RE)) resolve(m[1], m[1].endsWith('/'));
    for (const m of text.matchAll(CSS_URL_RE)) {
      const u = m[1];
      if (/^(data:|https?:|#)/.test(u)) continue;
      resolve(u.startsWith('/') ? u : path.posix.join(here, u), false);
    }
    for (const m of text.matchAll(REL_RE)) resolve(path.posix.join(here, m[1]), m[1].endsWith('/'));
  }
  return out;
}
