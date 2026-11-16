// 옮길 도구 전부를 받침에서 열어 페이지 오류와 그려진 내용을 잰다. 실행: node scripts/e2e-mount.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(app, '../karmolab/package.json'));
const { chromium } = require('playwright');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
export function serve(dir) {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(dir, rel === '/' ? 'index.html' : rel);
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, url } = await serve(join(app, 'dist'));
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  let errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('requestfailed', (r) => errors.push('fail: ' + r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ': ' + r.url());
  });
  await page.goto(url);
  const table = JSON.parse(readFileSync(join(app, 'tools.json'), 'utf8'));
  const ids = [...Object.keys(table.hubs), ...Object.values(table.hubs).flat(), ...table.standalone];
  let bad = 0;
  for (const id of ids) {
    errors = [];
    await page.evaluate((x) => window.__karmoEditOpen(x), id);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const m = document.getElementById('ktMain');
      return { text: m.innerText.replace(/\s+/g, ' ').slice(0, 70), controls: m.querySelectorAll('input,button,select,textarea').length, err: m.querySelector('.tool-status.error')?.innerText || '' };
    });
    const ok = !errors.length && !r.err && r.controls > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} controls=${r.controls} | ${r.text}${errors.length ? ' | ' + errors.slice(0, 3).join(' ; ') : ''}${r.err ? ' | ' + r.err : ''}`);
  }
  await browser.close();
  server.close();
  console.log(`실패 ${bad} / ${ids.length}`);
  process.exit(bad ? 1 : 0);
}
