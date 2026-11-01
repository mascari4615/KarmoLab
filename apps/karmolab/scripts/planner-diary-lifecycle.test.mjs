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
  stdin: { resolveDir: root, contents: "import './src/widgets/planner/planner';export {dashRegistry} from './src/widgets/mydash/kit';export {PlannerJournal} from './src/widgets/planner/sync-store';export {materializePlanner} from './src/widgets/planner/sync-model';export {buildDiaryView} from './src/widgets/planner/diary-view';" },
  bundle: true, write: false, format: 'iife', globalName: 'Lifecycle', logLevel: 'silent',
  plugins: [{ name: 'offline-neighbors', setup(builder) {
    if (process.env.PLANNER_TEST_STRIP_DELETE_GUARD === '1') {
      builder.onLoad({ filter: /planner[\\/]diary-view\.ts$/ }, async ({ path }) => {
        const original = await readFile(path, 'utf8');
        const guarded = "container.querySelector('.pl-diary-del')!.addEventListener('click', () => {\n        if (destroyed || plannerWriterIdentity() !== writer) return;";
        const normalized = original.replace(/\r\n/g, '\n');
        assert.ok(normalized.includes(guarded), 'fixture must strip only the delete handler guard');
        return { loader: 'ts', contents: normalized.replace(guarded, "container.querySelector('.pl-diary-del')!.addEventListener('click', () => {") };
      });
    }
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
  const repo = { async readJson() { return { items: [] }; } };
  async function mount(nextRepo = repo) { const count = window.__calendarMounts; await window.Lifecycle.dashRegistry().panels.find(panel => panel.id === 'planner').render({ root: host, onDispose: fn => disposers.push(fn), repo: nextRepo }); await until(() => host.querySelector('textarea') && window.__calendarMounts > count); }
  function dispose() { for (const fn of disposers.splice(0)) fn(); }
  await mount();
  await until(() => host.querySelector('textarea') && window.__calendarMounts === 1);
  host.querySelector('[data-date="2026-10-29"]').click();
  t.after(() => { dispose(); dom.window.close(); });
  return { window, host, journal, storage, repo, mount, dispose, attempts: () => attempts, current: () => window.Lifecycle.materializePlanner(journal.batches().flatMap(batch => batch.ops)).diary.find(row => row.date === '2026-10-29').text,
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

const pendingDate = '2026-10-29';
function pendingDraft(ui, value = '  Secret draft B\nraw spacing  ') {
  const text = ui.host.querySelector('textarea');
  text.value = 'Committed A'; ui.failCache(); text.dispatchEvent(new ui.window.Event('blur'));
  assert.equal(ui.current(), 'Committed A');
  text.value = value; text.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  return value;
}
test('forced disposal restores raw pending draft and date for unchanged writer without auto-write', async t => {
  const ui = await screen(t), raw = pendingDraft(ui), writer = ui.window.KarmoPlannerSyncWriter;
  ui.dispose(); const attempts = ui.attempts(), batches = ui.journal.batches().length; await ui.mount();
  assert.equal(ui.window.KarmoPlannerSyncWriter, writer);
  assert.equal(ui.host.querySelector('textarea').value, raw, 'forced disposal lost raw B');
  assert.equal(ui.host.querySelector('.pl-diary-item--on')?.dataset.date, pendingDate);
  assert.equal(ui.attempts(), attempts); assert.equal(ui.journal.batches().length, batches); assert.equal(ui.current(), 'Committed A');
});
test('restored base A preserves B and merges newer remote C once', async t => {
  const ui = await screen(t); pendingDraft(ui, 'Draft B'); ui.dispose(); ui.recover();
  ui.journal.write('diary', [{ date: pendingDate, text: 'Remote C', updatedAt: 20 }]); await ui.mount();
  const text = ui.host.querySelector('textarea'); assert.equal(text.value, 'Draft B', 'remote refresh lost B');
  text.dispatchEvent(new ui.window.Event('blur'));
  assert.equal(ui.current(), 'Remote C\n\n[다른 기기 기록]\n\nDraft B');
  const count = ui.attempts(); text.dispatchEvent(new ui.window.Event('blur')); assert.equal(ui.attempts(), count);
});
test('empty deletion draft survives forced disposal and deletes A after recovery', async t => {
  const ui = await screen(t); pendingDraft(ui, ''); ui.dispose(); await ui.mount();
  assert.equal(ui.host.querySelector('textarea').value, ''); assert.equal(ui.host.querySelector('.pl-diary-item--on')?.dataset.date, pendingDate);
  ui.recover(); ui.host.querySelector('textarea').dispatchEvent(new ui.window.Event('blur'));
  assert.equal(ui.window.Lifecycle.materializePlanner(ui.journal.batches().flatMap(batch => batch.ops)).diary.some(row => row.date === pendingDate), false);
});
test('same writer retains draft in memory when every Storage.setItem throws', async t => {
  const ui = await screen(t), raw = pendingDraft(ui), proto = ui.window.Storage.prototype, original = proto.setItem;
  proto.setItem = function () { throw new ui.window.DOMException('fixture quota', 'QuotaExceededError'); };
  t.after(() => { proto.setItem = original; }); ui.dispose(); await ui.mount();
  assert.equal(ui.host.querySelector('textarea').value, raw, 'memory recovery must not depend on Storage writes');
});
for (const context of ['different callback', 'new same-repo auth session', 'different repo']) {
  test(`pending secret draft is not restored for ${context}`, async t => {
    const ui = await screen(t); pendingDraft(ui, 'Secret draft B'); ui.dispose(); let nextWrites = 0;
    ui.window.KarmoPlannerSyncWriter = () => { nextWrites++; };
    await ui.mount(context === 'different repo' ? { async readJson() { return { items: [] }; } } : ui.repo);
    assert.equal(ui.host.querySelector('textarea').value.includes('Secret draft B'), false); assert.equal(nextWrites, 0);
  });
}
test('old cleanup after writer change calls neither new writer nor fallback cache', async t => {
  const ui = await screen(t), text = ui.host.querySelector('textarea'); text.value = 'Secret draft B'; text.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  let nextWrites = 0, cacheWrites = 0; ui.window.KarmoPlannerSyncWriter = () => { nextWrites++; };
  const proto = ui.window.Storage.prototype, original = proto.setItem;
  proto.setItem = function (key, value) { if (key === 'karmolab_planner_diary') cacheWrites++; return original.call(this, key, value); };
  t.after(() => { proto.setItem = original; }); ui.dispose();
  assert.equal(nextWrites, 0, 'old secret draft reached replacement writer'); assert.equal(cacheWrites, 0);
});

test('forced Google auth rerender restores pending date and raw B while replacing calendar token', async t => {
  const ui = await screen(t), raw = pendingDraft(ui), batches = ui.journal.batches().length, attempts = ui.attempts();
  ui.host.querySelector('.pl-login').click(); await until(() => ui.window.__calendarMounts === 2);
  assert.equal(ui.window.__calendarDestroys, 1);
  assert.deepEqual(Array.from(ui.window.__calendarTokens), [null, 'fixture-only']);
  assert.equal(ui.host.querySelector('textarea').value, raw);
  assert.equal(ui.host.querySelector('.pl-diary-item--on')?.dataset.date, pendingDate);
  assert.equal(ui.journal.batches().length, batches); assert.equal(ui.attempts(), attempts);
});

test('removing writer before old cleanup never falls back to diary cache writes', async t => {
  const ui = await screen(t), text = ui.host.querySelector('textarea');
  text.value = 'Secret draft B'; text.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  delete ui.window.KarmoPlannerSyncWriter;
  let cacheWrites = 0; const proto = ui.window.Storage.prototype, original = proto.setItem;
  proto.setItem = function (key, value) { if (key === 'karmolab_planner_diary') cacheWrites++; return original.call(this, key, value); };
  t.after(() => { proto.setItem = original; }); ui.dispose();
  assert.equal(cacheWrites, 0); assert.equal(ui.attempts(), 0); assert.equal(ui.current(), 'Original');
});

test('remote event after writer replacement cannot inject new session cache into old clean view', async t => {
  const ui = await screen(t), text = ui.host.querySelector('textarea'); assert.equal(text.value, 'Original');
  let nextWrites = 0; ui.window.KarmoPlannerSyncWriter = () => { nextWrites++; };
  ui.storage.setItem('karmolab_planner_diary', JSON.stringify([{ date: pendingDate, text: 'Other session secret C', updatedAt: 50 }]));
  ui.window.dispatchEvent(new ui.window.Event('planner-remote-change'));
  assert.equal(text.value, 'Original'); assert.equal(nextWrites, 0);
});

test('explicit diary date wins over remembered pending date without consuming its draft', async t => {
  const ui = await screen(t), raw = pendingDraft(ui); ui.dispose();
  const pane = ui.window.document.createElement('section'); ui.host.append(pane);
  const explicit = ui.window.Lifecycle.buildDiaryView(pane, '2026-10-28');
  assert.equal(pane.querySelector('textarea').value, '');
  assert.match(pane.querySelector('.pl-diary-date').textContent, /2026.*10.*28/);
  const count = ui.attempts(); explicit.destroy(); pane.remove(); await ui.mount();
  assert.equal(ui.host.querySelector('textarea').value, raw);
  assert.equal(ui.host.querySelector('.pl-diary-item--on')?.dataset.date, pendingDate);
  assert.equal(ui.attempts(), count);
});

for (const boundary of ['writer replacement', 'destroyed view']) {
  test(`old delete button after ${boundary} cannot confirm or write`, async t => {
    const ui = await screen(t), button = ui.host.querySelector('.pl-diary-del');
    let confirms = 0, nextWrites = 0, cacheWrites = 0;
    ui.window.confirm = () => { confirms++; return true; };
    if (boundary === 'writer replacement') ui.window.KarmoPlannerSyncWriter = () => { nextWrites++; };
    else ui.dispose();
    const proto = ui.window.Storage.prototype, original = proto.setItem;
    proto.setItem = function (key, value) { if (key === 'karmolab_planner_diary') cacheWrites++; return original.call(this, key, value); };
    t.after(() => { proto.setItem = original; });
    const attempts = ui.attempts(), batches = ui.journal.batches().length;
    button.click();
    assert.equal(confirms, 0, 'stale delete must stop before asking confirmation');
    assert.equal(nextWrites, 0); assert.equal(cacheWrites, 0);
    assert.equal(ui.attempts(), attempts); assert.equal(ui.journal.batches().length, batches);
    assert.equal(ui.current(), 'Original');
  });
}
