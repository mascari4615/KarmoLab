/**
 * 가른 배포 (blog, dash) 가 제 화면에 필요한 파일을 다 들고 있나 (memo change.site-split, 2026-09-24)
 *
 * `split-outputs.mjs` 는 글자로 드러난 주소만 따라 담는다. 코드로 조립하는 주소를 놓치면
 * 배포 뒤 404 로만 드러난다. 그래서 배포 폴더를 그대로 띄워 실제 화면을 열고
 * **같은 origin 의 404** 를 센다. 남의 주소 (`_redirects` 대상) 로 가는 요청은 넘김 줄로 판정
 *
 * 사용: node scripts/test-split-outputs.mjs [--out ../blog/dist]
 * exit 0 통과, 1 빠진 파일, 2 못 돌림 (배포 폴더 없음)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripFrontMatter } from './lib/serve-html.mjs';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const i = process.argv.indexOf('--out');
const OUT = i > 0 ? path.resolve(process.argv[i + 1]) : path.join(APP_ROOT, '..', 'blog', 'dist');
if (!fs.existsSync(path.join(OUT, 'blog')) || !fs.existsSync(path.join(OUT, 'dash'))) {
  console.error(`[split-test] 못 돌림. 가른 배포가 없다: ${OUT}. 먼저 split-outputs.mjs`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml' };

/** Cloudflare Pages 흉내. 파일, 폴더의 index.html, 넘김 줄, 없으면 404.html */
function serve(root) {
  const rules = fs.existsSync(path.join(root, '_redirects'))
    ? fs.readFileSync(path.join(root, '_redirects'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')[0])
    : [];
  const redirected = (p) => rules.some((r) => (r.endsWith('/*') ? p.startsWith(r.slice(0, -1)) : p === r));
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (redirected(p)) { res.writeHead(301, { location: 'https://elsewhere.invalid' + p }); res.end(); return; }
    let f = path.join(root, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(root, '404.html'))); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(path.extname(f) === '.html' ? stripFrontMatter(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

const firstPost = fs.readdirSync(path.join(OUT, 'blog', 'posts'), { withFileTypes: true }).find((e) => e.isDirectory());
const PLAN = {
  blog: ['/', '/posts/', firstPost ? `/posts/${firstPost.name}/` : null, '/about/'].filter(Boolean),
  dash: ['/'],
};

const browser = await chromium.launch(process.env.CI ? { headless: true } : { channel: 'msedge', headless: true });
let missing = 0;
for (const [app, pages] of Object.entries(PLAN)) {
  const srv = await serve(path.join(OUT, app));
  for (const pg of pages) {
    const page = await browser.newPage();
    const bad = [];
    const errors = [];
    page.on('response', (r) => { if (r.url().startsWith(srv.base) && r.status() === 404) bad.push(r.url().slice(srv.base.length)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(srv.base + pg, { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e).slice(0, 160)));
    await page.waitForTimeout(800);
    const ok = bad.length === 0 && errors.length === 0;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${app}${pg}` + (bad.length ? `  404: ${bad.join(', ')}` : '') + (errors.length ? `  오류: ${errors.join(' | ')}` : ''));
    missing += bad.length + errors.length;
    await page.close();
  }
  srv.close();
}
await browser.close();
console.log(missing ? `[split-test] FAIL ${missing}` : '[split-test] OK');
process.exit(missing ? 1 : 0);
