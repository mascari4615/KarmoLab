import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const stubs = {
  'gauth.ts': `export const GOOGLE_CLIENT_ID='fixture'; export function storedToken(){return null} export async function ensureToken(){return null}
    export function forgetToken(){} export async function requestToken(){window.__authRequests++;return 'fixture-only'} export async function withToken(){throw Error('fixture forbids Google')}`,
  'calendar-loader.ts': `export async function loadCalendarView(){return (pane,token)=>{window.__calendarMounts++;window.__calendarTokens.push(token);pane.innerHTML='<div class="fixture-calendar"></div>';return {destroy(){window.__calendarDestroys++}}}}`,
  'notifications.ts': `export function mountNotifications(){return {subscribe(){return ()=>{}}}}`,
};
const bundle = await build({
  stdin: { resolveDir: root, contents: "import './src/widgets/planner/planner';export {dashRegistry} from './src/widgets/mydash/kit';export {PlannerJournal} from './src/widgets/planner/sync-store';export {materializePlanner} from './src/widgets/planner/sync-model';" },
  bundle: true, write: false, format: 'iife', globalName: 'Lifecycle', logLevel: 'silent',
  plugins: [{ name: 'offline-neighbors', setup(builder) {
    builder.onLoad({ filter: /planner[\\/](gauth|calendar-loader|notifications)\.ts$/ }, ({ path }) => ({ loader: 'js', contents: stubs[path.split(/[\\/]/).pop()] }));
  } }],
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) {
  const end = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > end) throw Error('lifecycle fixture did not settle'); await tick(); }
}
async function screen(t) {
  const dom = new JSDOM('<html lang="ko"><main></main></html>', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko'; window.__KARMO_I18N = { ko: { planner: translations } };
  window.__calendarMounts = 0; window.__calendarDestroys = 0; window.__authRequests = 0;
  window.__calendarTokens = [];
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.fetch = () => { throw Error('fixture forbids network'); };
  window.eval(bundle.outputFiles[0].text);
  const storage = window.localStorage, key = 'karmolab_planner_diary';
  storage.setItem(key, JSON.stringify([{ date: '2026-10-29', text: 'Original', updatedAt: 1 }]));
  storage.setItem('karmolab.planner.side', 'diary');
  let broken = false, attempts = 0;
  const wrapped = {
    get length() { return storage.length; }, getItem: key => storage.getItem(key), key: index => storage.key(index), removeItem: key => storage.removeItem(key),
    setItem(name, value) { if (broken && name === key) throw new window.DOMException('fixture cache quota', 'QuotaExceededError'); storage.setItem(name, value); },
  };
  const journal = new window.Lifecycle.PlannerJournal(wrapped, 'fixture'); journal.migrate(); journal.apply();
  window.KarmoPlannerSyncWriter = (_, rows) => { attempts++; journal.write('diary', rows); };
  const host = window.document.querySelector('main'), disposers = [];
  await window.Lifecycle.dashRegistry().panels.find(panel => panel.id === 'planner').render({ root: host, onDispose: fn => disposers.push(fn), repo: { async readJson() { return { items: [] }; } } });
  await until(() => host.querySelector('textarea') && window.__calendarMounts === 1);
  host.querySelector('[data-date="2026-10-29"]').click();
  t.after(() => { disposers.forEach(fn => fn()); dom.window.close(); });
  return { window, host, journal, storage, attempts: () => attempts, current: () => window.Lifecycle.materializePlanner(journal.batches().flatMap(batch => batch.ops)).diary.find(row => row.date === '2026-10-29').text,
    failCache() { broken = true; }, recover() { broken = false; journal.apply(); window.dispatchEvent(new window.Event('planner-remote-change')); } };
}

for (const action of ['close', 'kanban']) {
  test(`diary pending cache and dirty draft survive ${action} until a re-read can save it`, async t => {
    const ui = await screen(t), text = ui.host.querySelector('textarea'), calendar = ui.host.querySelector('.fixture-calendar');
    text.value = 'Committed A'; ui.failCache(); text.dispatchEvent(new ui.window.Event('blur'));
    assert.equal(ui.current(), 'Committed A'); assert.equal(ui.attempts(), 1);
    text.value = 'Unsaved B'; text.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.match(ui.host.querySelector('.pl-diary-saved').textContent, /지금 입력은 아직 저장하지 않았어요/);
    const leave = () => ui.host.querySelector(action === 'close' ? '.pl-drawer-x' : '[data-side="kanban"]').click();
    leave(); await tick();
    assert.equal(ui.host.querySelector('textarea'), text); assert.equal(text.value, 'Unsaved B');
    assert.equal(ui.host.querySelector('.pl-root').dataset.side, 'diary');
    assert.equal(ui.storage.getItem('karmolab.planner.side'), 'diary');
    assert.equal(ui.host.querySelector('.fixture-calendar'), calendar); assert.equal(ui.window.__calendarDestroys, 0);
    assert.equal(ui.current(), 'Committed A'); assert.equal(ui.attempts(), 1);
    assert.match(ui.host.querySelector('.pl-diary-saved').textContent, /지금 입력은 아직 저장하지 않았어요/);
    ui.recover(); leave(); await tick();
    assert.equal(ui.current(), 'Unsaved B'); assert.equal(ui.attempts(), 2);
    assert.equal(ui.host.querySelector('.pl-diary-text'), null);
    assert.equal(ui.storage.getItem('karmolab.planner.side'), action === 'kanban' ? 'kanban' : null);
    assert.equal(ui.window.__calendarDestroys, 0);
  });
}

test('authentication rerender preserves its existing forced calendar teardown contract', async t => {
  const ui = await screen(t), text = ui.host.querySelector('textarea');
  text.value = 'Committed A'; ui.failCache(); text.dispatchEvent(new ui.window.Event('blur'));
  text.value = 'Unsaved B'; text.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  ui.host.querySelector('.pl-login').click();
  await until(() => ui.window.__calendarMounts === 2);
  assert.equal(ui.window.__calendarDestroys, 1);
  assert.deepEqual(Array.from(ui.window.__calendarTokens), [null, 'fixture-only']);
});

test('ordinary non-diary navigation keeps its calendar and remains available', async t => {
  const ui = await screen(t), calendar = ui.host.querySelector('.fixture-calendar');
  ui.host.querySelector('[data-side="kanban"]').click();
  ui.host.querySelector('[data-side="streaks"]').click();
  assert.equal(ui.host.querySelector('.pl-root').dataset.side, 'streaks');
  ui.host.querySelector('.pl-drawer-x').click();
  assert.equal(ui.host.querySelector('.pl-drawer').hidden, true);
  assert.equal(ui.host.querySelector('.fixture-calendar'), calendar);
  assert.equal(ui.window.__calendarDestroys, 0); assert.equal(ui.attempts(), 0);
});
