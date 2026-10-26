import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
const translations = JSON.parse(await readFile(new URL('../i18n/ko/planner.json', import.meta.url), 'utf8'));
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: "export * from './src/widgets/planner/sync-store'; export { buildDiaryView } from './src/widgets/planner/diary-view';" }, bundle: true, write: false, format: 'iife', globalName: 'Sync', logLevel: 'silent' });
function device(t, initial = {}) {
  const dom = new JSDOM('', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.__KARMO_I18N = { ko: { planner: translations } };
  dom.window.document.documentElement.lang = 'ko';
  dom.window.eval(bundle.outputFiles[0].text + '\nwindow.Sync = Sync;');
  const storage = dom.window.localStorage;
  for (const [key, value] of Object.entries(initial)) storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  const journal = new dom.window.Sync.PlannerJournal(storage, 'fixture');
  const read = collection => JSON.parse(storage.getItem(dom.window.Sync.PLANNER_KEYS[collection]) || '[]');
  journal.migrate();
  return { journal, storage, read, window: dom.window };
}
function remote() {
  const files = new Map();
  return {
    eventsBranch: 'private-fixture', files, offline: false, beforeWrite: null,
    async tree() { if (this.offline) throw new Error('offline'); return [...files.keys()].map(path => ({ path, type: 'file' })); },
    async readJson(path) { return structuredClone(files.get(path)); },
    async putNewJsonMany(batch) { if (this.beforeWrite) await this.beforeWrite(); if (this.offline) throw new Error('offline'); for (const file of batch) files.set(file.path, structuredClone(file.value)); }
  };
}
const task = (id, title = id, column = 'todo') => ({ id, title, column });
const diary = text => ({ date: '2026-10-27', text, updatedAt: 1 });

test('legacy diary, task and recurrence import, then a fresh device restores all three', async t => {
  const a = device(t, { karmolab_planner_diary: [diary('기존 일기')], karmolab_planner_tasks: [task('local__1')], karmolab_planner_events: [{ id: 'local__e', title: '반복 일정', start: '2026-10-27', end: '2026-10-28', allDay: true, repeat: { freq: 'weekly' }, exceptions: { '2026-11-03': { cancelled: true } } }] });
  const b = device(t), repo = remote();
  await a.journal.sync(repo); await b.journal.sync(repo);
  for (const key of ['diary', 'tasks', 'events']) assert.equal(JSON.stringify(a.read(key)), JSON.stringify(b.read(key)));
  assert.equal(b.read('events')[0].exceptions['2026-11-03'].cancelled, true);
});
test('concurrent additions, completion and deletion converge without erasing unrelated rows', async t => {
  const a = device(t), b = device(t), repo = remote();
  a.journal.write('tasks', [task('local__a')]); b.journal.write('tasks', [task('local__b')]);
  await a.journal.sync(repo); await b.journal.sync(repo); await a.journal.sync(repo);
  assert.equal(a.read('tasks').length, 2);
  a.journal.write('tasks', [task('local__a', 'local__a', 'done'), task('local__b')]);
  await a.journal.sync(repo); await b.journal.sync(repo);
  assert.equal(b.read('tasks')[0].column, 'done');
  b.journal.write('tasks', [task('local__b')]);
  await b.journal.sync(repo); await a.journal.sync(repo);
  assert.equal(a.read('tasks').length, 1);
  const fresh = device(t); await fresh.journal.sync(repo);
  assert.equal(fresh.read('tasks').length, 1);
});
test('offline edits survive reload, then retry idempotently', async t => {
  const a = device(t), repo = remote();
  a.journal.write('diary', [diary('오프라인 기록')]);
  repo.offline = true;
  await assert.rejects(a.journal.sync(repo));
  assert.equal(a.journal.pending(), true);
  const restarted = new a.window.Sync.PlannerJournal(a.storage, 'fixture');
  restarted.migrate(); repo.offline = false;
  await restarted.sync(repo); await restarted.sync(repo);
  assert.equal(repo.files.size, 1);
  const b = device(t); await b.journal.sync(repo);
  assert.equal(b.read('diary')[0].text, '오프라인 기록');
});
test('concurrent diary edits retain both texts and a subsequent edit resolves the conflict', async t => {
  const a = device(t), b = device(t), repo = remote();
  a.journal.write('diary', [diary('기존')]); await a.journal.sync(repo); await b.journal.sync(repo);
  a.journal.write('diary', [diary('기존\nPC 기록')]); b.journal.write('diary', [diary('기존\n폰 기록')]);
  await a.journal.sync(repo); await b.journal.sync(repo); await a.journal.sync(repo);
  const text = a.read('diary')[0].text;
  assert.match(text, /PC 기록/); assert.match(text, /폰 기록/);
  assert.equal(text, b.read('diary')[0].text);
  b.journal.write('diary', [diary('직접 정리한 일기')]);
  await b.journal.sync(repo); await a.journal.sync(repo);
  assert.equal(a.read('diary')[0].text, '직접 정리한 일기');
});
test('a stale legacy device cannot resurrect a deleted record', async t => {
  const a = device(t, { karmolab_planner_tasks: [task('local__a')] }), repo = remote();
  await a.journal.sync(repo); a.journal.write('tasks', []); await a.journal.sync(repo);
  const b = device(t, { karmolab_planner_tasks: [task('local__a')] });
  await b.journal.sync(repo); await a.journal.sync(repo);
  assert.equal(b.read('tasks').length, 0); assert.equal(a.read('tasks').length, 0);
});
test('an edit during upload stays pending for the next exchange', async t => {
  const a = device(t), repo = remote();
  a.journal.write('tasks', [task('local__a')]);
  repo.beforeWrite = () => { repo.beforeWrite = null; a.journal.write('tasks', [task('local__a'), task('local__b')]); };
  await a.journal.sync(repo); assert.equal(a.journal.pending(), true);
  await a.journal.sync(repo); assert.equal(a.journal.pending(), false);
  const b = device(t); await b.journal.sync(repo); assert.equal(b.read('tasks').length, 2);
});
test('storage failures do not pretend a write succeeded', t => {
  const a = device(t);
  const broken = { getItem: key => a.storage.getItem(key), key: i => a.storage.key(i), get length() { return a.storage.length; }, setItem() { throw new Error('quota'); } };
  const journal = new a.window.Sync.PlannerJournal(broken, 'fixture');
  assert.throws(() => journal.write('tasks', [task('local__a')]), /quota/);
  assert.equal(a.read('tasks').length, 0);
});
test('corrupt legacy records stop migration and preserve every original byte', t => {
  const dom = new JSDOM('', { url: 'https://fixture.invalid', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  dom.window.eval(bundle.outputFiles[0].text + '\nwindow.Sync = Sync;');
  const storage = dom.window.localStorage; storage.setItem('karmolab_planner_tasks', '{broken');
  const journal = new dom.window.Sync.PlannerJournal(storage, 'fixture');
  assert.throws(() => journal.migrate()); assert.equal(storage.getItem('karmolab_planner_tasks'), '{broken'); assert.equal(storage.length, 1);
});
test('stopping during a read prevents late remote cache writes', async t => {
  const a = device(t), b = device(t), repo = remote(); a.journal.write('tasks', [task('local__a')]); await a.journal.sync(repo);
  const read = repo.readJson.bind(repo); repo.readJson = async path => { b.journal.stopped = true; return read(path); };
  await b.journal.sync(repo); assert.equal(b.read('tasks').length, 0);
});

test('a clean diary editor refreshes and cannot resurrect a remotely deleted diary on blur', t => {
  const a = device(t, { karmolab_planner_diary: [diary('원래 본문')] });
  const root = a.window.document.createElement('main'); a.window.document.body.append(root);
  const view = a.window.Sync.buildDiaryView(root, '2026-10-27');
  const text = root.querySelector('textarea');
  a.storage.setItem('karmolab_planner_diary', JSON.stringify([diary('폰에서 수정')]));
  a.window.dispatchEvent(new a.window.Event('planner-remote-change'));
  assert.equal(text.value, '폰에서 수정');
  a.storage.setItem('karmolab_planner_diary', '[]');
  a.window.dispatchEvent(new a.window.Event('planner-remote-change'));
  text.dispatchEvent(new a.window.Event('blur'));
  assert.equal(a.read('diary').length, 0);
  view.destroy();
});
test('a dirty diary editor preserves its draft and merges the arriving remote text on save', t => {
  const a = device(t, { karmolab_planner_diary: [diary('원래 본문')] });
  const root = a.window.document.createElement('main'); a.window.document.body.append(root);
  const view = a.window.Sync.buildDiaryView(root, '2026-10-27');
  const text = root.querySelector('textarea'); text.value = '아직 쓰는 PC 본문';
  text.dispatchEvent(new a.window.Event('input'));
  a.storage.setItem('karmolab_planner_diary', JSON.stringify([diary('새 폰 본문')]));
  a.window.dispatchEvent(new a.window.Event('planner-remote-change'));
  assert.equal(text.value, '아직 쓰는 PC 본문');
  text.dispatchEvent(new a.window.Event('blur'));
  assert.match(a.read('diary')[0].text, /새 폰 본문/);
  assert.match(a.read('diary')[0].text, /아직 쓰는 PC 본문/);
  view.destroy();
});

test('a peer tab refreshes views even when the shared array was already materialized', t => {
  const a = device(t), repo = remote();
  const stop = a.window.Sync.startPlannerSync(repo, 'shared-tabs');
  const sender = new a.window.Sync.PlannerJournal(a.storage, 'shared-tabs');
  let refreshes = 0;
  a.window.addEventListener('planner-remote-change', () => refreshes++);
  sender.write('tasks', [task('local__peer')]);
  const key = sender.prefix + 'batch.' + sender.batches()[0].id;
  a.window.dispatchEvent(new a.window.StorageEvent('storage', { key }));
  assert.equal(refreshes, 1);
  assert.equal(a.read('tasks')[0].id, 'local__peer');
  stop();
  assert.equal(a.window.KarmoPlannerSyncWriter, undefined);
  a.window.dispatchEvent(new a.window.StorageEvent('storage', { key }));
  assert.equal(refreshes, 1);
});
