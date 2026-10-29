import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv.slice(2).find(arg => !arg.startsWith('--')) || await mkdtemp(join(tmpdir(), 'planner-sync-'));
await mkdir(output, { recursive: true });
const main = await build({ stdin: { resolveDir: process.cwd(), contents: `
import { startPlannerSync } from './src/widgets/planner/sync-store';
import { mountQuickCapture } from './src/widgets/planner/quick-capture';
const call = async (method, body) => { const r = await fetch('/sync', { method, ...(body ? { body: JSON.stringify(body) } : {}) }); if (!r.ok) throw Error('offline'); return r.json(); };
const repo = { eventsBranch: 'fixture-private', tree: () => call('GET'), readJson: path => call('POST', { read: path }), putNewJsonMany: files => call('POST', { files }) };
const stop = startPlannerSync(repo, 'browser-fixture');
mountQuickCapture({ root: document.querySelector('main'), isCurrent: () => true, onDispose() {}, openItem() {} });
window.addEventListener('pagehide', stop);
` }, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
const calendar = await build({ stdin: { resolveDir: process.cwd(), contents: `
import { createEvent, deleteEvent } from './src/widgets/planner/local-store';
document.querySelector('#calendar-add').onclick = () => createEvent({title: '달력 별도 번들 일정',start:'2026-10-27',end:'2026-10-28',allDay:true});
document.querySelector('#calendar-delete').onclick = () => { const rows=JSON.parse(localStorage.getItem('karmolab_planner_events')||'[]'); for(const row of rows) deleteEvent(row.id); };
` }, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
const files = new Map();
const server = createServer(async (req, res) => {
  if (req.url === '/sync') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify([...files.keys()].map(path => ({path,type:'file'})))); return; }
    let text = ''; for await (const data of req) text += data;
    const body = JSON.parse(text);
    if (body.read) res.end(JSON.stringify(files.get(body.read)));
    else { for (const file of body.files) files.set(file.path, file.value); res.end('{}'); }
    return;
  }
  if (req.url === '/main.js' || req.url === '/calendar.js') { res.setHeader('Content-Type', 'text/javascript'); res.end((req.url === '/main.js' ? main : calendar).outputFiles[0].text); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>오늘 기록 동기화 검토</title><style>body{font:16px sans-serif;max-width:800px;margin:24px auto;padding:16px}textarea{width:95%;min-height:100px}button{padding:10px;margin:4px}small{display:block}section{margin:20px 0}</style><h1>오늘 기록 동기화 검토</h1><main></main><button id="calendar-add">별도 달력 번들에서 일정 추가</button><button id="calendar-delete">별도 달력 번들에서 일정 삭제</button><script src="/main.js"></script><script src="/calendar.js"></script>');
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(18843, '127.0.0.1', resolve); });
const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: process.argv.includes('--headless') || process.env.CI === 'true' });
const errors = [];
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
try {
  const a = await desktop.newPage(), b = await mobile.newPage();
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  // Keep the dated fixture in the upcoming window while synchronization timers run normally.
  for (const page of [a, b]) await page.clock.setFixedTime(new Date('2026-10-27T03:00:00Z'));
  const url = 'http://127.0.0.1:18843/';
  await a.goto(url); await b.goto(url);
  await a.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await a.locator('[name="quick-date"]').fill('2026-10-27');
  await a.locator('textarea').fill('PC에서 적은 일기'); await a.locator('button[type="submit"]').click();
  await a.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await b.reload(); await b.locator('.mydq-diary').filter({ hasText: 'PC에서 적은 일기' }).waitFor();
  await b.locator('textarea').fill('아직 보내지 않은 폰 초안');
  await a.locator('#calendar-add').click(); await a.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await b.dispatchEvent('body', 'focus');
  // Returning focus triggers the same refresh used after switching apps on a phone.
  await b.evaluate(() => window.dispatchEvent(new Event('focus')));
  await b.locator('.mydq-recent').filter({ hasText: '달력 별도 번들 일정' }).waitFor();
  assert.equal(await b.locator('textarea').inputValue(), '아직 보내지 않은 폰 초안');
  await a.locator('#calendar-delete').click(); await a.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await b.evaluate(() => window.dispatchEvent(new Event('focus')));
  await b.waitForFunction(() => JSON.parse(localStorage.getItem('karmolab_planner_events') || '[]').length === 0);
  await mobile.setOffline(true);
  await b.locator('[data-kind="task"]').click(); await b.locator('textarea').fill('폰 오프라인 할 일'); await b.locator('button[type="submit"]').click();
  await b.locator('.mydq-hint').filter({ hasText: '다시 시도' }).waitFor();
  await mobile.setOffline(false); await b.evaluate(() => window.dispatchEvent(new Event('online')));
  await b.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await a.evaluate(() => window.dispatchEvent(new Event('focus')));
  await a.locator('[data-done]').filter({ visible: true }).first().waitFor();
  assert.match(await a.locator('.mydq-recent').innerText(), /폰 오프라인 할 일/);
  await a.locator('[data-done]').first().click(); await a.locator('.mydq-hint').filter({ hasText: '기기 간 자동 동기화됨' }).waitFor();
  await b.evaluate(() => window.dispatchEvent(new Event('focus')));
  await b.waitForFunction(() => JSON.parse(localStorage.getItem('karmolab_planner_tasks') || '[]')[0]?.column === 'done');
  assert.deepEqual(errors, []);
  await a.screenshot({ path: output + '/desktop.png', fullPage: true }); await b.screenshot({ path: output + '/mobile.png', fullPage: true });
  const result = { checks: ['desktop diary to independent mobile storage', 'separate calendar bundle upload and delete', 'remote refresh preserves draft', 'offline task retry', 'task completion reaches second device'], pageErrors: errors, remoteBatches: files.size, fixtureOnly: true };
  await writeFile(output + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
