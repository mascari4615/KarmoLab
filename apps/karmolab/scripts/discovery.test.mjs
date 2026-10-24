import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const base = fileURLToPath(new URL('../', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({ stdin: { contents: `import { renderDiscovery } from './src/widgets/mydash/discovery'; import { parseDiscovery, discoveryEvents } from './src/widgets/mydash/discovery-data'; import { buildCalendarView } from './src/widgets/planner/calendar-view'; window.test = { renderDiscovery, parseDiscovery, discoveryEvents, buildCalendarView };`, resolveDir: base }, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
const at = new Date().toISOString(), start = at.slice(0, 10), end = new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10);
const feed = { schema: 'discovery-feed/1', generatedAt: at, sources: [{ id: 'expo', name: 'Expo', status: 'ok', checkedAt: at, lastSuccessAt: at, count: 1 }, { id: 'code', name: 'Code', status: 'error', checkedAt: at, lastSuccessAt: at, count: 1, error: '<script>error</script>' }], items: [{ id: 'expo', kind: 'event', sourceId: 'expo', sourceName: 'Expo', title: 'Expo test event', url: 'https://example.com/expo', checkedAt: at, start, end }, { id: 'code:1', kind: 'news', sourceId: 'code', sourceName: 'Code', title: '<img src=x onerror=alert(1)> Code', url: 'https://example.com/code', checkedAt: at, publishedAt: at }] };
const until = async fn => { const end = Date.now() + 4000; while (!fn()) { if (Date.now() > end) throw Error('UI did not settle'); await new Promise(r => setTimeout(r, 0)); } };
function screen(t) {
  const dom = new JSDOM('<html lang="ko"><main id="root"></main></html>', { url: 'http://localhost/discovery-test', runScripts: 'outside-only', pretendToBeVisual: true });
  const dispose = [];
  t.after(() => { dispose.forEach(fn => fn()); dom.window.close(); });
  const w = dom.window;
  w.__KARMO_LOCALE = 'ko'; w.__KARMO_I18N = { ko: { planner: translations } };
  w.matchMedia = media => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
  w.eval(bundle.outputFiles[0].text);
  const root = w.document.getElementById('root');
  const ctx = { root, repo: { readJson: async () => structuredClone(feed) }, onDispose: fn => dispose.push(fn), isCurrent: () => true };
  return { w, root, ctx, dispose };
}
test('untrusted feed rejects unsafe links, impossible dates and unknown sources', t => {
  const { w } = screen(t);
  for (const change of [f => { f.items[0].url = 'javascript:alert(1)'; }, f => { f.items[0].start = '2026-02-30'; }, f => { f.items[0].sourceId = 'unknown'; }, f => { f.items.push(f.items[0]); }, f => { f.sources[1].error = { unexpected: 'object' }; }]) {
    const broken = structuredClone(feed); change(broken); assert.throws(() => w.test.parseDiscovery(broken));
  }
});
test('information list searches, filters and escapes data, with failure status visible', async t => {
  const { w, root, ctx } = screen(t); await w.test.renderDiscovery(ctx);
  assert.equal(root.querySelectorAll('.discovery-row').length, 2);
  assert.equal(root.querySelectorAll('img,script').length, 0);
  assert.match(root.querySelector('[role=status]').textContent, /확인 실패/);
  const filter = root.querySelector('select'); filter.value = 'event'; filter.dispatchEvent(new w.Event('change'));
  assert.equal(root.querySelectorAll('.discovery-row').length, 1);
  const query = root.querySelector('input'); query.value = 'not-found'; query.dispatchEvent(new w.Event('input'));
  assert.match(root.querySelector('.discovery-list').textContent, /일치하는 항목이 없습니다/);
});
test('a response after disposal cannot replace the newer screen', async t => {
  const { w, root, ctx, dispose } = screen(t); let resolve;
  ctx.repo.readJson = () => new Promise(r => { resolve = r; });
  const pending = w.test.renderDiscovery(ctx); dispose.forEach(fn => fn()); root.textContent = 'new screen'; resolve(feed); await pending;
  assert.equal(root.textContent, 'new screen');
});
test('searching after a failed refresh preserves the failure warning and old data', async t => {
  const { w, root, ctx } = screen(t);
  await w.test.renderDiscovery(ctx);
  ctx.repo.readJson = async () => { throw Error('network failure'); };
  const refresh = root.querySelector('[data-refresh]'); refresh.click();
  await until(() => !refresh.disabled);
  const query = root.querySelector('input'); query.value = 'Expo'; query.dispatchEvent(new w.Event('input'));
  assert.match(root.querySelector('[role=status]').textContent, /목록 다시 읽기 실패/);
  assert.match(root.querySelector('.discovery-list').textContent, /Expo test event/);
  ctx.repo.readJson = async () => structuredClone(feed); refresh.click();
  await until(() => !refresh.disabled);
  assert.doesNotMatch(root.querySelector('[role=status]').textContent, /목록 다시 읽기 실패/);
});
test('refresh reads a changed remote feed instead of the cached snapshot', async t => {
  const { w, root, ctx } = screen(t);
  const cached = structuredClone(feed), remote = structuredClone(feed);
  ctx.repo.readJson = async (_path, options) => structuredClone(options?.fresh ? remote : cached);
  await w.test.renderDiscovery(ctx);
  remote.items[0].title = 'Updated remote event';
  const refresh = root.querySelector('[data-refresh]'); refresh.click();
  await until(() => !refresh.disabled);
  assert.match(root.querySelector('.discovery-list').textContent, /Updated remote event/);
});

test('the real calendar displays the same source event and offers no write controls', async t => {
  const { w, root, dispose } = screen(t);
  const parsed = w.test.parseDiscovery(feed), events = w.test.discoveryEvents(parsed);
  assert.equal(events.length, 1); assert.equal(events[0].startEditable, false); assert.equal(events[0].durationEditable, false);
  const handle = w.test.buildCalendarView(root, null, undefined, async () => [], async () => parsed);
  dispose.push(() => handle.destroy());
  await until(() => root.querySelector('.fc-event')?.textContent.includes('Expo test event'));
  root.querySelector('.fc-event').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await until(() => root.querySelector('.pl-pop'));
  assert.equal(root.querySelector('.pl-pop-edit'), null); assert.equal(root.querySelector('.pl-pop-del'), null);
  assert.equal(root.querySelector('.pl-pop a').href, feed.items[0].url);
  root.querySelector('.pl-cal-create').click();
  assert.equal(root.querySelector('[name=event-calendar] option[value=karmo-discovery]'), null);
});

test('each event links to its own calendar date while news keeps its source link', async t => {
  const { w, root, ctx } = screen(t);
  await w.test.renderDiscovery(ctx);
  const rows = root.querySelectorAll('.discovery-row');
  assert.equal(rows[0].querySelector('a[href^="#planner/discovery/"]')?.getAttribute('href'), `#planner/discovery/${start}`);
  assert.equal(rows[1].querySelector('a[href^="#planner/discovery/"]'), null);
  assert.equal(rows[0].querySelector('a[target="_blank"]').href, feed.items[0].url);
});

test('calendar date links open the event month even when the event calendar was hidden', async t => {
  const { w, root, dispose } = screen(t);
  const future = structuredClone(feed);
  future.items[0].start = '2030-11-19'; future.items[0].end = '2030-11-21';
  const parsed = w.test.parseDiscovery(future);
  const hidden = JSON.stringify(['karmo-discovery']);
  w.localStorage.setItem('karmolab_planner_hidden_calendars', hidden);
  w.localStorage.setItem('karmolab.planner.view', 'timeGridDay');
  w.history.replaceState({}, '', '#planner/discovery/2030-11-19');
  const handle = w.test.buildCalendarView(root, null, undefined, async () => [], async () => parsed);
  dispose.push(() => handle.destroy());
  await until(() => root.querySelector('.fc-event')?.textContent.includes('Expo test event'));
  assert.match(root.querySelector('.fc-toolbar-title').textContent, /2030.*11/);
  assert.ok(root.querySelector('.fc-dayGridMonth-view'));
  assert.equal(root.querySelector('[data-cal="karmo-discovery"]').checked, true);
  assert.equal(w.localStorage.getItem('karmolab_planner_hidden_calendars'), hidden);
  w.history.replaceState({}, '', '#planner%2Fdiscovery%2F2030-12-04');
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await until(() => /2030.*12/.test(root.querySelector('.fc-toolbar-title').textContent));
  w.history.replaceState({}, '', '#planner/discovery/2030-02-30');
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  assert.match(root.querySelector('.fc-toolbar-title').textContent, /2030.*12/);
  handle.destroy(); dispose.pop();
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
});
