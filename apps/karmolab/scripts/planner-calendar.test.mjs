import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/planner/calendar-view.ts', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({
  stdin: { contents: `import { buildCalendarView } from ${JSON.stringify(entry)}; import { PlannerJournal, PlannerWriteCommittedError } from './src/widgets/planner/sync-store'; import { Calendar } from '@fullcalendar/core'; window.CalendarFixture={PlannerJournal,PlannerWriteCommittedError}; const render=Calendar.prototype.render; Calendar.prototype.render=function(){window.CalendarFixture.calendar=this; return render.call(this);}; buildCalendarView(document.getElementById('calendar'), 'fixture-only', undefined, async()=>[]);`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
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
async function screen(t, allDay = false, initialEvents = []) {
  const dom = new JSDOM('<html lang="ko"><main id="calendar"></main></html>', { url: 'http://localhost/calendar-fixture', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { planner: translations } };
  window.matchMedia = media => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (initialEvents.length) window.localStorage.setItem('karmolab_planner_events', JSON.stringify(initialEvents));
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

function useJournal(ui) {
  const journal = new ui.window.CalendarFixture.PlannerJournal(ui.window.localStorage, 'fixture');
  journal.migrate(); journal.apply();
  ui.window.KarmoPlannerSyncWriter = (_key, rows) => journal.write('events', rows);
  const calendar = ui.dialog.querySelector('[name="event-calendar"]');
  calendar.value = 'local'; calendar.dispatchEvent(new ui.window.Event('change', { bubbles: true }));
  return journal;
}

test('new local calendar create completes after a committed cache failure without retry duplication', async t => {
  const ui = await screen(t), journal = useJournal(ui);
  const setItem = ui.window.Storage.prototype.setItem;
  let broken = true;
  ui.window.Storage.prototype.setItem = function (key, value) {
    if (broken && key === 'karmolab_planner_events') throw new Error('fixture cache quota');
    return setItem.call(this, key, value);
  };
  ui.submit(); await until(() => !ui.dialog.open);
  assert.equal(journal.batches().flatMap(batch => batch.ops).length, 1);
  assert.match(ui.window.document.querySelector('.pl-toast--info').textContent, /이 기기에 기록/);
  broken = false; journal.apply();
  let rows = JSON.parse(ui.window.localStorage.getItem('karmolab_planner_events'));
  assert.equal(rows.length, 1);
  const originalId = rows[0].id;
  ui.window.document.querySelector('.pl-cal-create').click();
  const next = ui.window.document.querySelector('dialog');
  next.querySelector('[name="event-title"]').value = 'fixture original title';
  next.querySelector('[name="event-calendar"]').value = 'local';
  next.querySelector('form').dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !next.open);
  rows = JSON.parse(ui.window.localStorage.getItem('karmolab_planner_events'));
  assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.ok(rows.some(row => row.id === originalId)); assert.equal(ui.writes.length, 0);
});

test('new local calendar precommit failure retains its form and draft', async t => {
  const ui = await screen(t), journal = useJournal(ui);
  ui.window.KarmoPlannerSyncWriter = () => { throw new Error('fixture precommit failure'); };
  ui.submit(); await until(() => !ui.form.hasAttribute('aria-busy'));
  assert.equal(ui.dialog.open, true); assert.equal(ui.input.value, 'fixture original title'); assert.equal(ui.input.disabled, false);
  assert.equal(journal.batches().length, 0); assert.equal(ui.writes.length, 0);
});

test('new local calendar create stays complete when only its following reload fails', async t => {
  const ui = await screen(t); useJournal(ui);
  ui.window.CalendarFixture.calendar.batchRendering = () => { throw new Error('fixture reload render failure'); };
  ui.submit(); await until(() => !ui.dialog.open);
  assert.equal(JSON.parse(ui.window.localStorage.getItem('karmolab_planner_events')).length, 1);
  assert.match(ui.window.document.querySelector('.pl-toast--info').textContent, /이 기기에 기록/);
  assert.equal(ui.writes.length, 0);
});

test('a committed failure during the first recurring edit mutation cannot mark the whole edit successful', async t => {
  const start = new Date(); start.setHours(9, 0, 0, 0);
  const end = new Date(+start + 3600000);
  const row = { id: 'local__recurring_fixture', title: 'Existing recurring fixture', start: start.toISOString(), end: end.toISOString(), allDay: false,
    repeat: { frequency: 'daily', interval: 1, days: [] } };
  const ui = await screen(t, false, [row]);
  const journal = useJournal(ui);
  ui.dialog.querySelector('.pl-modal-cancel').click();
  const calendar = ui.window.CalendarFixture.calendar;
  await until(() => calendar.getEvents().some(event => event.extendedProps.localSeriesId === row.id));
  const event = calendar.getEvents().find(event => event.extendedProps.localSeriesId === row.id);
  calendar.getOption('eventClick')({ event, jsEvent: new ui.window.MouseEvent('click'), el: ui.window.document.querySelector('.fc-event') });
  ui.window.document.querySelector('.pl-pop-edit').click();
  const dialog = ui.window.document.querySelector('dialog'), form = dialog.querySelector('form'), input = dialog.querySelector('[name="event-title"]');
  input.value = 'Edited recurring fixture';
  assert.equal(dialog.querySelector('[name="event-scope"]').value, 'day');
  const setItem = ui.window.Storage.prototype.setItem;
  ui.window.Storage.prototype.setItem = function (key, value) {
    if (key === 'karmolab_planner_events') throw new Error('fixture edit cache failure');
    return setItem.call(this, key, value);
  };
  let mutations = 0;
  ui.window.KarmoPlannerSyncWriter = (_key, rows) => { mutations++; journal.write('events', rows); };
  form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !form.hasAttribute('aria-busy'));
  assert.equal(dialog.open, true); assert.equal(input.disabled, false); assert.equal(input.value, 'Edited recurring fixture');
  assert.equal(mutations, 1); assert.equal(journal.batches().length, 2);
  assert.equal(ui.window.document.querySelector('.pl-toast--info'), null); assert.equal(ui.writes.length, 0);
});

test('calendar master checkbox selects and clears every loaded calendar and shows partial selection', async t => {
  const ui = await screen(t);
  ui.dialog.close();
  const doc = ui.window.document;
  const master = () => doc.querySelector('[data-cal-all]');
  const boxes = () => [...doc.querySelectorAll('[data-cal]')];
  assert.ok(master(), 'master checkbox must be present');
  assert.ok(boxes().length >= 5, 'includes local, AI, anime, discovery and remote calendars');
  assert.equal(master().checked, true);
  boxes()[0].click();
  assert.equal(master().indeterminate, true);
  master().click();
  assert.ok(boxes().every(box => box.checked));
  assert.equal(master().indeterminate, false);
  master().click();
  assert.ok(boxes().every(box => !box.checked));
  assert.equal(master().checked, false);
  assert.deepEqual(JSON.parse(ui.window.localStorage.getItem('karmolab_planner_hidden_calendars')).sort(), boxes().map(box => box.dataset.cal).sort());
  doc.querySelector('[data-mode="all"]').click();
  assert.equal(master().checked, true);
  assert.ok(boxes().every(box => box.checked));
});

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
