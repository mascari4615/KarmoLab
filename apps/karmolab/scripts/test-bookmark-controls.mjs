import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bookmark-controls-'));
const date = new Date().toISOString().slice(0, 10);
const item = (id, label, recordedAt, src = 'x', priority = null) => ({
  id, label, recordedAt, addedAt: date, src, url: `https://example.com/${id}`,
  axes: { intent: ['learn'], status: 'tagged', ...(priority ? { priority } : {}) },
});
const fixture = { schema: 'bookmarks/1', generatedAt: new Date().toISOString(), data: { items: [
  { ...item('a', 'Alpha', '2026-01-01', 'x', 'soon'), media: { kind: 'page', photos: [{ url: 'https://example.com/image-a.svg', w: 220, h: 160 }] } },
  item('b', 'Beta', '2026-03-01', 'edge', 'now'),
  item('c', 'Charlie', '2026-02-01', 'kakao'),
  item('d', 'Delta', null),
  item('group', 'Automatically collected news', '2026-04-01', 'kakao-group'),
  { ...item('pending', 'Echo', '2026-01-15'), pending: 'visual', axes: { intent: [], status: 'unsorted' } },
] } };
const axes = { axes: [
  { key: 'intent', label: '의도', values: [{ key: 'learn', label: '배우기' }, { key: 'plan', label: '참고' }] },
  { key: 'priority', label: '우선순위', values: [{ key: 'now', label: '지금' }, { key: 'soon', label: '곧' }] },
  { key: 'status', label: '상태', values: [{ key: 'tagged', label: '분류함' }, { key: 'unsorted', label: '미분류' }] },
] };
const bundle = path.join(temp, 'bookmarks.js');
await build({ stdin: { contents: `import './src/widgets/mydash/bookmarks.ts';`, resolveDir: root }, bundle: true, outfile: bundle, format: 'iife', logLevel: 'silent', loader: { '.css': 'text' },
  plugins: process.env.BOOKMARK_BASELINE ? [{ name: 'baseline', setup(b) {
    b.onLoad({ filter: /[\\/]mydash[\\/]bookmarks\.ts$/ }, args => ({
      contents: execFileSync('git', ['show', 'HEAD:apps/karmolab/src/widgets/mydash/bookmarks.ts'], { cwd: root, encoding: 'utf8' }),
      loader: 'ts', resolveDir: path.dirname(args.path),
    }));
  } }] : [],
});
const html = `<!doctype html><html lang="ko" data-site="dash"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>북마크 격자 검토본</title>
<link rel="stylesheet" href="/src/widgets/mydash/mydash.css"><link rel="stylesheet" href="/src/widgets/mydash/dash.css"><style>
html,body{height:100%;margin:0;font-family:Dotum,sans-serif;color:var(--text-primary);background:var(--dash-page)}
#root{height:calc(100% - 32px);padding:16px}
</style><div id="root" class="myd-main"></div><script src="/bookmarks.js"></script></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(html); }
    if (url.pathname === '/bookmarks.js') { res.setHeader('content-type', 'text/javascript'); return res.end(await fs.readFile(bundle)); }
    const file = path.resolve(root, '.' + url.pathname.replace(/^\/apps\/karmolab/, ''));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('https://**', route => route.abort());
await page.route('https://example.com/image-a.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160"><rect width="220" height="160" fill="#85b3db"/><circle cx="150" cy="50" r="25" fill="#f5e0b5"/></svg>' }));
async function render(summary = fixture, definitions = axes) {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(mount, { summary, definitions, writable: summary === fixture });
}
async function mount({ summary, definitions, writable = false }) {
    window.bookmarkWrites = [];
    const write = async value => {
      if (!writable) { const error = new Error('검토본에서는 저장할 수 없습니다'); error.kind = 'denied'; throw error; }
      if (window.bookmarkWritesPaused) await new Promise(resolve => { window.resumeBookmarkWrites = () => { window.bookmarkWritesPaused = false; resolve(); }; });
      window.bookmarkWrites.push(value);
    };
    const repo = { eventsBranch: 'events', deviceId: 'test', nonce: 'test',
      readJson: async p => p.endsWith('/summary.json') ? summary : p.endsWith('/axes.json') ? definitions : {},
      list: async () => [], tree: async () => [], flushOutbox: async () => ({ sent: 0 }),
      putNewJson: async (p, value) => write(value),
      putNewJsonMany: async values => { for (const value of values) await write(value.value); },
    };
    await window.KarmoDash.panels.find(p => p.id === 'bookmarks').render({ root: document.querySelector('#root'), repo,
      status() {}, onDispose() {}, isCurrent: () => true, setCount() {}, openItem() {}, repoInfo: {} });
}
const ids = () => page.locator('[data-list] [data-row]').evaluateAll(rows => rows.map(r => r.getAttribute('data-row')));
try {
  const openFilters = async () => {
    if (!await page.locator('[data-filters]').evaluate(el => el.matches(':popover-open'))) await page.locator('[data-act="filters"]').click();
  };
  const closeFilters = async () => { await page.locator('[data-act="close-filters"]').click(); };
  const chooseScope = async value => { await openFilters(); await page.locator('[data-scope]').selectOption(value); await closeFilters(); };
  const check = async id => { await page.locator(`[data-row="${id}"]`).hover(); await page.locator(`[data-pick="${id}"]`).check(); };
  const selected = () => page.locator('[data-pick]:checked').count();
  const top = () => page.locator('[data-list]').evaluate(el => el.getBoundingClientRect().top);
  const closeViewer = () => page.locator('.kmb-viewer[open]').getByRole('button', { name: '닫기', exact: true }).click();
  await render();
  assert.equal(await page.locator('[data-view]').count(), 0);
  assert.equal(await page.locator('[data-act="select"]').count(), 0);
  assert.equal(await page.locator('.bm-views,.bm-revisit,.bm-judge').count(), 0);
  assert.deepEqual(await ids(), ['b', 'c', 'pending', 'a', 'd']);
  const startTop = await top();
  assert.ok(await page.locator('.bm-toolbar').evaluate(el => el.getBoundingClientRect().height) <= 48);
  await openFilters();
  assert.equal(await top(), startTop);
  await page.locator('[data-act="filters"]').click();
  assert.equal(await page.locator('[data-filters]').evaluate(el => el.matches(':popover-open')), false);
  await openFilters();
  await page.locator('[data-filter-axis="src"]').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('[data-filter-axis="intent"]').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowUp');
  await page.locator('[data-axis="src"][data-value="x"]').check();
  assert.equal((await ids()).length, 3);
  await closeFilters();
  await page.locator('[data-act="remove-filter"]').click();
  assert.equal((await ids()).length, 5);
  await page.locator('[data-sort]').selectOption('oldest');
  assert.deepEqual(await ids(), ['a', 'pending', 'c', 'b', 'd']);
  await page.locator('[data-sort]').selectOption('title');
  assert.deepEqual(await ids(), ['a', 'b', 'c', 'd', 'pending']);
  await page.locator('[data-sort]').selectOption('priority');
  assert.deepEqual(await ids(), ['b', 'a', 'c', 'pending', 'd']);
  await chooseScope('collected');
  assert.deepEqual(await ids(), ['group']);
  await chooseScope('all');
  assert.equal((await ids()).length, 6);
  await page.locator('[data-active] [data-act="clear-filters"]').click();
  assert.equal((await ids()).includes('group'), false);
  await page.locator('#bm-q').fill('Beta');
  assert.deepEqual(await ids(), ['b']);
  await page.locator('[data-act="clear-query"]').click();
  await openFilters();
  await page.locator('[data-filter-axis="quick"]').click();
  await page.locator('[data-filters] [data-act="pending"]').click();
  await page.locator('[data-filters] [data-act="fresh"]').click();
  assert.deepEqual(await ids(), ['pending']);
  await page.locator('[data-filters] [data-act="clear-filters"]').click();
  await closeFilters();
  await page.locator('[data-row="a"] [data-act="tile"]').click();
  assert.equal(await page.locator('.kmb-viewer[open]').count(), 1);
  assert.equal(await page.locator('.kmb-details').isVisible(), false);
  await closeViewer();
  const beforeSelect = await top();
  await check('a');
  assert.equal(await selected(), 1);
  assert.equal(await page.locator('[data-bar]').isVisible(), true);
  assert.equal(await top(), beforeSelect);
  await check('b');
  await page.locator('[data-row="c"] [data-act="tile"]').click();
  assert.equal(await selected(), 3);
  await page.locator('[data-row="c"] [data-act="tile"]').click();
  assert.equal(await selected(), 2);
  await page.locator('[data-row="a"] [data-act="tile"]').dblclick();
  assert.equal(await page.locator('.kmb-viewer[open]').count(), 1);
  assert.equal(await selected(), 2);
  await closeViewer();
  await page.locator('[data-pick="a"]').uncheck();
  await page.locator('[data-pick="b"]').uncheck();
  assert.equal(await page.locator('[data-bar]').isVisible(), false);
  assert.equal(await top(), beforeSelect);
  await page.locator('[data-sort]').selectOption('recent');
  await check('b');
  await page.locator('[data-row="d"] [data-act="tile"]').click({ modifiers: ['Shift'] });
  assert.equal(await selected(), 5);
  await page.keyboard.press('Escape');
  assert.equal(await selected(), 0);
  await check('a');
  assert.equal(await page.locator('[data-act="select-all"]').evaluate(el => el.indeterminate), true);
  await page.locator('[data-act="select-all"]').check();
  assert.equal(await selected(), 5);
  await page.locator('[data-act="select-all"]').uncheck();
  assert.equal(await selected(), 0);
  await check('a'); await check('b');
  const beforeBulk = await top();
  await page.locator('[data-act="bulk-menu"]').click();
  assert.equal(await top(), beforeBulk);
  assert.equal(await page.locator('[data-act="b-apply"]').isDisabled(), true);
  assert.ok(await page.locator('[data-act="b-apply"]').evaluate(el => Number(getComputedStyle(el).opacity)) < 1);
  await page.locator('[data-act="b-intent"][data-value="plan"]').check();
  const contrast = await page.locator('[data-act="b-apply"]').evaluate(el => {
    const style = getComputedStyle(el);
    const luminance = value => {
      const rgb = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  assert.ok(contrast >= 4.5, 'Enabled bulk CTA contrast: ' + contrast);
  await page.evaluate(() => { window.bookmarkWritesPaused = true; });
  await page.locator('[data-act="b-apply"]').click();
  await page.waitForFunction(() => typeof window.resumeBookmarkWrites === 'function');
  assert.equal(await page.locator('[data-act="b-apply"]').isDisabled(), true);
  await page.locator('[data-act="close-bulk"]').click();
  await check('d');
  await page.evaluate(() => window.resumeBookmarkWrites());
  await page.waitForFunction(() => window.bookmarkWrites.length === 2);
  assert.equal(await page.evaluate(() => window.bookmarkWrites.every(event => event.intent.includes('plan'))), true);
  await page.waitForFunction(() => document.querySelector('[data-pick="a"]').checked === false);
  assert.equal(await page.locator('[data-pick="d"]').isChecked(), true);
  await page.locator('[data-act="b-cancel"]').click();
  await page.locator('[data-sort]').selectOption('oldest');
  await render();
  assert.equal(await page.locator('[data-sort]').inputValue(), 'oldest');
  assert.equal(await page.locator('[data-scope]').inputValue(), 'personal');
  await page.locator('[data-sort]').selectOption('recent');
  if (process.env.BOOKMARK_DATA) {
    const summary = JSON.parse(await fs.readFile(process.env.BOOKMARK_DATA, 'utf8'));
    const definitions = JSON.parse(await fs.readFile(path.join(path.dirname(process.env.BOOKMARK_DATA), 'axes.json'), 'utf8'));
    await render(summary, definitions);
    assert.equal((await ids()).some(id => summary.data.items.find(it => it.id === id)?.src === 'kakao-group'), false);
  }
  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((el, value) => el.dataset.theme = value, theme);
    for (const [width, height] of [[1920, 1080], [2560, 1440], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => {
        const grid = document.querySelector('[data-list]');
        const expected = innerWidth <= 559 ? 2 : Math.max(1, Math.floor((grid.clientWidth + 12) / 236));
        return Number(grid.style.getPropertyValue('--bm-ncol')) === expected;
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await page.locator('.bm-toolbar').evaluate(el => el.getBoundingClientRect().height) <= 48);
      assert.ok(await page.locator('.bm-scroll').evaluate(el => el.clientHeight) > height * .7);
      await page.evaluate(async () => {
        for (let pass = 0; pass < 4; pass++) {
          const visible = [...document.images].filter(image => { const r = image.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
          visible.forEach(image => { image.loading = 'eager'; });
          await Promise.allSettled(visible.map(image => image.decode()));
          await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        }
      });
      if (process.env.BOOKMARK_SHOTS) await page.screenshot({ path: `${process.env.BOOKMARK_SHOTS}-${theme}-${width}.png` });
      const baseTop = await top();
      await openFilters();
      assert.equal(await top(), baseTop);
      if (process.env.BOOKMARK_SHOTS) await page.screenshot({ path: `${process.env.BOOKMARK_SHOTS}-${theme}-${width}-filter.png` });
      await closeFilters();
      const first = await page.locator('[data-pick]').first().getAttribute('data-pick');
      await check(first);
      assert.equal(await top(), baseTop);
      assert.ok(await page.locator('.bm-toolbar').evaluate(el => el.getBoundingClientRect().height) <= 48);
      if (process.env.BOOKMARK_SHOTS) await page.screenshot({ path: `${process.env.BOOKMARK_SHOTS}-${theme}-${width}-selected.png` });
      await page.locator('[data-act="b-cancel"]').click();
    }
  }
  assert.deepEqual(errors, []);
  if (process.env.BOOKMARK_PREVIEW) {
    const summary = process.env.BOOKMARK_DATA ? JSON.parse(await fs.readFile(process.env.BOOKMARK_DATA, 'utf8')) : fixture;
    const definitions = process.env.BOOKMARK_DATA ? JSON.parse(await fs.readFile(path.join(path.dirname(process.env.BOOKMARK_DATA), 'axes.json'), 'utf8')) : axes;
    const css = (await Promise.all(['mydash.css', 'dash.css'].map(name => fs.readFile(path.join(root, 'src/widgets/mydash', name), 'utf8')))).join('\n');
    const catalogs = (await Promise.all(['mydash', 'media'].map(name => fs.readFile(path.join(root, 'js/i18n/ko', name + '.js'), 'utf8')))).join('\n');
    const data = JSON.stringify({ summary, definitions }).replaceAll('<', '\\u003c');
    const js = (await fs.readFile(bundle, 'utf8')).replaceAll('</script', '<\\/script');
    const preview = html.replace(/<link[^>]+>/g, '').replace('</style>', css + '</style>')
      .replace('<script src="/bookmarks.js"></script>', `<script>${catalogs}\n${js}\n(${mount.toString()})(${data})</script>`);
    await fs.writeFile(process.env.BOOKMARK_PREVIEW, preview);
    await page.goto(pathToFileURL(process.env.BOOKMARK_PREVIEW).href);
    await page.locator('[data-sort]').waitFor();
    await page.locator('[data-act="filters"]').click();
    await page.locator('[data-scope]').selectOption('collected');
    assert.ok((await ids()).length > 0);
    await page.locator('[data-scope]').selectOption('personal');
    await page.locator('[data-act="close-filters"]').click();
    assert.deepEqual(errors, []);
  }
  console.log('PASS bookmark grid: scope isolation, four sorts, overlay geometry, automatic selection, click/double-click, range/all, bulk writes, persistence, light/dark FHD/QHD/phone');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
