import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/planner/kanban-view.ts', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({
  stdin: { contents: `export { buildKanbanView } from ${JSON.stringify(entry)}; export { PlannerJournal } from './src/widgets/planner/sync-store';`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', globalName: 'KanbanFixture', logLevel: 'silent',
  plugins: [{ name: 'test-auth', setup(context) {
    context.onLoad({ filter: /[\\/]planner[\\/]gauth\.ts$/ }, () => ({ contents: "export async function withToken(_, fn) { return fn('fixture-only'); }", loader: 'js' }));
  } }]
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Kanban fixture did not settle');
    await tick();
  }
}
async function screen(t, { tasks = [], holdReloads = false } = {}) {
  const dom = new JSDOM('<html lang="ko"><main id="kanban"></main></html>', { url: 'http://localhost/kanban-fixture', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { planner: translations } };
  const writes = [];
  const reads = [];
  window.fetch = (url, options = {}) => {
    if (options.method === 'POST' || options.method === 'PATCH') return new Promise((resolve, reject) => writes.push({ url: String(url), options, resolve, reject }));
    return new Promise((resolve, reject) => {
      reads.push({ resolve, reject });
      if (reads.length === 1 || !holdReloads) resolve({ ok: true, json: async () => ({ items: tasks }) });
    });
  };
  window.eval(bundle.outputFiles[0].text);
  window.KanbanFixture.buildKanbanView(window.document.getElementById('kanban'), 'fixture-only');
  await until(() => reads.length === 1);
  await tick();
  return { window, writes, reads, input: window.document.querySelector('input'), form: window.document.querySelector('form'), button: window.document.querySelector('button[type="submit"]') };
}
async function submit(ui, title) {
  ui.input.value = title;
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => ui.writes.length === 1);
}

function localScreen(t, { beforeAppend = false } = {}) {
  const dom = new JSDOM('<html lang="ko"><main id="kanban"></main></html>', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko'; window.__KARMO_I18N = { ko: { planner: translations } };
  window.fetch = () => { throw new Error('Local fixture forbids network'); };
  window.eval(bundle.outputFiles[0].text);
  const storage = window.localStorage, key = 'karmolab_planner_tasks';
  let fail = false;
  const wrapped = {
    getItem: name => storage.getItem(name), key: index => storage.key(index), get length() { return storage.length; },
    removeItem: name => storage.removeItem(name),
    setItem(name, value) {
      if (fail && (beforeAppend ? name.includes('.batch.') : name === key)) { fail = false; throw new window.DOMException('fixture quota', 'QuotaExceededError'); }
      storage.setItem(name, value);
    }
  };
  const journal = new window.KanbanFixture.PlannerJournal(wrapped, 'fixture'); journal.migrate(); journal.apply();
  window.KarmoPlannerSyncWriter = (_, rows) => journal.write('tasks', rows);
  const view = window.KanbanFixture.buildKanbanView(window.document.getElementById('kanban'), null);
  t.after(() => view.destroy());
  return { window, journal, input: window.document.querySelector('input'), form: window.document.querySelector('form'), button: window.document.querySelector('button[type="submit"]'),
    read: () => JSON.parse(storage.getItem(key) || '[]'), failNext() { fail = true; } };
}
function submitLocal(ui, title) {
  ui.input.value = title;
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
}

test('a committed local creation consumes its input across cache recovery without duplicate IDs', async t => {
  const ui = localScreen(t);
  ui.failNext(); submitLocal(ui, '같은 할 일');
  await until(() => !ui.button.disabled);
  assert.equal(ui.input.value, ''); assert.equal(ui.read().length, 0);
  assert.match(ui.window.document.querySelector('.pl-toast').textContent, /이 기기에.*기록했어요.*목록은 아직 갱신하지 못했어요/);
  const count = ui.journal.batches().length;
  ui.journal.apply(); ui.window.dispatchEvent(new ui.window.Event('planner-remote-change'));
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(ui.journal.batches().length, count);
  assert.equal(ui.read().length, 1); assert.equal(ui.read()[0].title, '같은 할 일');
  submitLocal(ui, '같은 할 일'); await until(() => !ui.button.disabled);
  assert.equal(ui.read().length, 2); assert.equal(new Set(ui.read().map(row => row.id)).size, 2);
});

test('a local pre-append failure restores its title for a single retry', async t => {
  const ui = localScreen(t, { beforeAppend: true });
  ui.failNext(); submitLocal(ui, '다시 저장'); await until(() => !ui.button.disabled);
  assert.equal(ui.input.value, '다시 저장'); assert.equal(ui.journal.batches().length, 0);
  assert.match(ui.window.document.querySelector('.pl-toast').textContent, /추가하지 못했습니다/);
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true })); await until(() => !ui.button.disabled);
  assert.equal(ui.read().length, 1); assert.equal(ui.read()[0].title, '다시 저장'); assert.equal(ui.input.value, '');
});

test('a post-creation render failure keeps a newer draft without restoring the completed title', async t => {
  const ui = localScreen(t), board = ui.window.document.querySelector('.pl-kanban-board');
  const html = Object.getOwnPropertyDescriptor(ui.window.Element.prototype, 'innerHTML');
  let fail = true;
  Object.defineProperty(board, 'innerHTML', { get() { return html.get.call(this); }, set(value) {
    if (fail) { fail = false; ui.input.value = '새로운 초안'; throw new Error('fixture render failed'); }
    html.set.call(this, value);
  } });
  submitLocal(ui, '완료된 할 일'); await until(() => !ui.button.disabled);
  assert.equal(ui.read().length, 1); assert.equal(ui.read()[0].title, '완료된 할 일');
  assert.equal(ui.input.value, '새로운 초안');
  assert.match(ui.window.document.querySelector('.pl-toast').textContent, /이 기기에.*기록했어요/);
});

test('a failed task creation preserves a newer draft typed while waiting', async t => {
  const ui = await screen(t);
  await submit(ui, 'first fixture task');
  ui.input.value = 'newer unsent draft';
  ui.writes[0].reject(new Error('fixture offline'));
  await until(() => ui.window.document.querySelector('[role="alert"]'));
  assert.equal(ui.input.value, 'newer unsent draft');
});

test('pending task creation blocks repeated submissions without blocking draft input', async t => {
  const ui = await screen(t);
  await submit(ui, 'first fixture task');
  assert.equal(ui.button.disabled, true);
  assert.equal(ui.input.disabled, false);
  ui.input.value = 'next fixture draft';
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.input.value, 'next fixture draft');
  ui.writes[0].resolve({ ok: true });
  await until(() => !ui.button.disabled);
});

test('a failed task creation restores its title when the input remains empty', async t => {
  const ui = await screen(t);
  await submit(ui, 'retry fixture title');
  ui.writes[0].resolve({ ok: false, status: 503 });
  await until(() => ui.window.document.querySelector('[role="alert"]'));
  assert.equal(ui.input.value, 'retry fixture title');
  assert.equal(ui.button.disabled, false);
});

test('successful task creation keeps the next draft and releases the submit button', async t => {
  const ui = await screen(t);
  await submit(ui, 'first fixture task');
  ui.input.value = 'next unsent draft';
  ui.writes[0].resolve({ ok: true });
  await tick(); await tick();
  assert.equal(ui.input.value, 'next unsent draft');
  assert.equal(ui.button.disabled, false);
});

const taskFixtures = ['a', 'b'].map(id => ({ id, title: `fixture task ${id}`, status: 'needsAction' }));
const card = (ui, id) => ui.window.document.querySelector(`.pl-card[data-task="${id}"]`);
const move = (ui, id, to) => card(ui, id).querySelector(`[data-to="${to}"]`).click();
const taskResponse = (items = taskFixtures) => ({ ok: true, json: async () => ({ items }) });

test('a pending card move blocks its own repeat action while other cards stay usable', async t => {
  const ui = await screen(t, { tasks: taskFixtures });
  move(ui, 'a', 'inProgress');
  await until(() => ui.writes.length === 1);
  assert.equal(card(ui, 'a').getAttribute('draggable'), 'false');
  assert.equal(card(ui, 'a').querySelector('[data-to="done"]').disabled, true);
  assert.equal(card(ui, 'b').querySelector('[data-to="done"]').disabled, false);
  move(ui, 'a', 'done');
  await tick();
  assert.equal(ui.writes.length, 1);
  ui.writes[0].resolve({ ok: true });
  await until(() => !card(ui, 'a').querySelector('[data-to="done"]').disabled);
});

async function overlappingMoves(t) {
  const ui = await screen(t, { tasks: taskFixtures, holdReloads: true });
  move(ui, 'a', 'inProgress');
  await until(() => ui.writes.length === 1);
  move(ui, 'b', 'done');
  await until(() => ui.writes.length === 2);
  ui.writes[0].reject(new Error('fixture first move failed'));
  await until(() => ui.reads.length === 2);
  return ui;
}

test('one failed move reload cannot erase another pending card move', async t => {
  const ui = await overlappingMoves(t);
  ui.reads[1].resolve(taskResponse());
  await tick(); await tick();
  assert.equal(card(ui, 'a').dataset.col, 'todo');
  assert.equal(card(ui, 'b').dataset.col, 'done');
  ui.writes[1].resolve({ ok: true });
});

test('a reload started before a successful move cannot undo that completed move', async t => {
  const ui = await overlappingMoves(t);
  ui.writes[1].resolve({ ok: true });
  await tick(); await tick();
  ui.reads[1].resolve(taskResponse());
  await tick(); await tick();
  assert.equal(card(ui, 'b').dataset.col, 'done');
});

test('a stale reload cannot replace a newer task list', async t => {
  const ui = await overlappingMoves(t);
  ui.writes[1].reject(new Error('fixture second move failed'));
  await until(() => ui.reads.length === 3);
  ui.reads[2].resolve(taskResponse(taskFixtures.map(task => ({ ...task, title: 'NEW-' + task.id }))));
  await tick(); await tick();
  assert.match(card(ui, 'b').textContent, /NEW-b/);
  ui.reads[1].resolve(taskResponse(taskFixtures.map(task => ({ ...task, title: 'OLD-' + task.id }))));
  await tick(); await tick();
  assert.match(card(ui, 'b').textContent, /NEW-b/);
  assert.doesNotMatch(card(ui, 'b').textContent, /OLD-b/);
});

test('a failed refresh retains the last known remote task list', async t => {
  const ui = await screen(t, { tasks: taskFixtures, holdReloads: true });
  move(ui, 'a', 'inProgress');
  await until(() => ui.writes.length === 1);
  ui.writes[0].resolve({ ok: false, status: 503 });
  await until(() => ui.reads.length === 2);
  ui.reads[1].resolve({ ok: false, status: 503 });
  await tick(); await tick();
  assert.ok(card(ui, 'a'));
  assert.equal(card(ui, 'a').dataset.col, 'todo');
  assert.ok(card(ui, 'b'));
});

test('a later fresh list can replace a completed optimistic move with authoritative data', async t => {
  const ui = await screen(t, { tasks: taskFixtures, holdReloads: true });
  move(ui, 'a', 'inProgress');
  await until(() => ui.writes.length === 1);
  ui.writes[0].resolve({ ok: true });
  await until(() => !card(ui, 'a').querySelector('[data-to="done"]').disabled);
  ui.input.value = 'refresh fixture trigger';
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => ui.writes.length === 2);
  ui.writes[1].resolve({ ok: true });
  await until(() => ui.reads.length === 2);
  ui.reads[1].resolve(taskResponse([{ ...taskFixtures[0], title: 'authoritative completed title', status: 'completed' }, taskFixtures[1]]));
  await until(() => card(ui, 'a').textContent.includes('authoritative completed title'));
  assert.equal(card(ui, 'a').dataset.col, 'done');
});

test('a completed move preserves keyboard focus on another card action', async t => {
  const ui = await screen(t, { tasks: taskFixtures });
  move(ui, 'a', 'inProgress');
  await until(() => ui.writes.length === 1);
  card(ui, 'b').querySelector('[data-to="done"]').focus();
  ui.writes[0].resolve({ ok: true });
  await tick(); await tick();
  assert.equal(ui.window.document.activeElement, card(ui, 'b').querySelector('[data-to="done"]'));
});
