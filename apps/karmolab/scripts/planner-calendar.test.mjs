import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/planner/calendar-view.ts', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({
  stdin: { contents: `import { buildCalendarView } from ${JSON.stringify(entry)}; buildCalendarView(document.getElementById('calendar'), 'fixture-only', undefined, async()=>[]);`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', logLevel: 'silent',
  plugins: [{ name: 'test-auth', setup(context) {
    context.onLoad({ filter: /[\\/]planner[\\/]gauth\.ts$/ }, () => ({ contents: "export async function withToken(_, fn) { return fn('fixture-only'); }", loader: 'js' }));
  } }]
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Calendar fixture did not settle');
    await tick();
  }
}
async function screen(t, allDay = false) {
  const dom = new JSDOM('<html lang="ko"><main id="calendar"></main></html>', { url: 'http://localhost/calendar-fixture', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { planner: translations } };
  window.matchMedia = media => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const writes = [];
  window.fetch = (url, options = {}) => {
    if (options.method === 'POST') return new Promise((resolve, reject) => writes.push({ url: String(url), options, resolve, reject }));
    return Promise.resolve({ ok: true, json: async () => ({ items: String(url).endsWith('/calendarList') ? [{ id: 'fixture-calendar', summary: 'fixture calendar' }] : [] }) });
  };
  window.eval(bundle.outputFiles[0].text);
  await until(() => window.document.querySelector('.pl-cal-list')?.textContent.includes('fixture calendar'));
  window.document.querySelector('.pl-cal-create').click();
  const dialog = window.document.querySelector('dialog');
  const input = dialog.querySelector('[name="event-title"]');
  input.value = 'fixture original title';
  const calendar = dialog.querySelector('[name="event-calendar"]');
  calendar.value = 'fixture-calendar';
  calendar.dispatchEvent(new window.Event('change', { bubbles: true }));
  if (allDay) dialog.querySelector('[name="event-allday"]').click();
  const form = dialog.querySelector('form');
  const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  return { window, dialog, input, form, writes, submit };
}

test('pending calendar save makes editable fields unavailable without blocking cancellation', async t => {
  const ui = await screen(t);
  ui.submit();
  await until(() => ui.writes.length === 1);
  assert.equal(ui.input.disabled, true);
  assert.equal(ui.dialog.querySelector('[name="event-calendar"]').disabled, true);
  assert.equal(ui.dialog.querySelector('.pl-modal-cancel').disabled, false);
  ui.writes[0].resolve({ ok: false, status: 503 });
});

test('pending calendar save ignores repeat form submissions', async t => {
  const ui = await screen(t);
  ui.submit();
  await until(() => ui.writes.length === 1);
  ui.submit();
  await tick();
  assert.equal(ui.writes.length, 1);
  ui.writes[0].resolve({ ok: false, status: 503 });
});

test('calendar save failure restores editable fields while preserving conditional disabled states', async t => {
  const ui = await screen(t, true);
  assert.equal(ui.dialog.querySelector('[name="event-start"]').disabled, true);
  ui.submit();
  await until(() => ui.writes.length === 1);
  ui.writes[0].resolve({ ok: false, status: 503 });
  await until(() => !ui.form.hasAttribute('aria-busy'));
  assert.equal(ui.input.disabled, false);
  assert.equal(ui.input.value, 'fixture original title');
  assert.equal(ui.dialog.querySelector('[name="event-start"]').disabled, true);
  assert.equal(ui.dialog.querySelector('[name="event-start-date"]').disabled, false);
});

test('an old calendar save does not disable or close a newly opened editor', async t => {
  const ui = await screen(t);
  ui.submit();
  await until(() => ui.writes.length === 1);
  ui.dialog.querySelector('.pl-modal-cancel').click();
  ui.window.document.querySelector('.pl-cal-create').click();
  const current = ui.window.document.querySelector('dialog');
  current.querySelector('[name="event-title"]').value = 'new unsaved fixture draft';
  ui.writes[0].resolve({ ok: true });
  await tick(); await tick();
  assert.equal(ui.window.document.querySelector('dialog'), current);
  assert.equal(current.querySelector('[name="event-title"]').value, 'new unsaved fixture draft');
  assert.equal(current.querySelector('[name="event-title"]').disabled, false);
});
