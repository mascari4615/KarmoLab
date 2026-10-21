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
async function screen(t) {
  const dom = new JSDOM('<html lang="ko"><main id="kanban"></main></html>', { url: 'http://localhost/kanban-fixture', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { planner: translations } };
  const writes = [];
  let reads = 0;
  window.fetch = (url, options = {}) => {
    if (options.method === 'POST') return new Promise((resolve, reject) => writes.push({ url: String(url), options, resolve, reject }));
    reads += 1;
    return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
  };
  window.eval(bundle.outputFiles[0].text);
  await until(() => reads === 1);
  await tick();
  return { window, writes, input: window.document.querySelector('input'), form: window.document.querySelector('form'), button: window.document.querySelector('button[type="submit"]') };
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
