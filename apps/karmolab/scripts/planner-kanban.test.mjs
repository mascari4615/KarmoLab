import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/planner/kanban-view.ts', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({
  stdin: { contents: `import { buildKanbanView } from ${JSON.stringify(entry)}; buildKanbanView(document.getElementById('kanban'), 'fixture-only');`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', logLevel: 'silent',
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
  await until(() => reads.length === 1);
  await tick();
  return { window, writes, reads, input: window.document.querySelector('input'), form: window.document.querySelector('form'), button: window.document.querySelector('button[type="submit"]') };
}
async function submit(ui, title) {
  ui.input.value = title;
  ui.form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => ui.writes.length === 1);
}

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
