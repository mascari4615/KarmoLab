import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
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
test('explicit desktop handoff replaces matching rows, restores selected deletions and retains unrelated records', async t => {
  const a = device(t), repo = remote();
  a.journal.write('tasks', [task('local__kept', 'PC edit'), task('local__deleted'), task('local__unrelated')]);
  a.journal.write('tasks', [task('local__kept', 'PC edit'), task('local__unrelated')]);
  const incoming = {
    karmolab_planner_tasks: JSON.stringify([task('local__kept', 'stale browser copy'), task('local__deleted'), task('local__imported')]),
    karmolab_planner_events: JSON.stringify([{ id: 'local__event', title: 'Imported event', start: '2026-10-27', end: '2026-10-28', allDay: true }])
  };
  const native = await readFile(new URL('../../karmo-dash/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const handoff = native.match(/window\.eval\(&format!\("([^"\r\n]+)"\)\)/)[1];
  let reloads = 0;
  const cached = a.storage.getItem('karmolab_planner_tasks');
  runInNewContext(handoff.replace('{json}', JSON.stringify(incoming)).replaceAll('{{', '{').replaceAll('}}', '}'), {
    localStorage: a.storage, location: { reload() { reloads++; } }
  });
  assert.equal(reloads, 1);
  assert.equal(a.storage.getItem('karmolab_planner_tasks'), cached);
  const restarted = new a.window.Sync.PlannerJournal(a.storage, 'fixture');
  restarted.migrate(); restarted.importPending(); restarted.apply();
  assert.deepEqual(a.read('tasks').map(row => row.id), ['local__deleted', 'local__imported', 'local__kept', 'local__unrelated']);
  assert.equal(a.read('tasks').find(row => row.id === 'local__kept').title, 'stale browser copy');
  assert.equal(a.storage.getItem(a.window.Sync.PLANNER_IMPORT_KEY), null);
  await restarted.sync(repo);
  const b = device(t); await b.journal.sync(repo);
  assert.equal(JSON.stringify(b.read('tasks')), JSON.stringify(a.read('tasks')));
  assert.equal(b.read('events')[0].id, 'local__event');
});
test('switching scopes does not upload the previous cache and returning restores its journal', async t => {
  const a = device(t), repo = remote();
  a.journal.write('tasks', [task('local__private_a', 'Account A private task')]);
  await a.journal.sync(repo);
  const original = a.journal.batches().map(batch => JSON.stringify(batch));
  a.journal.stopped = true;
  const b = new a.window.Sync.PlannerJournal(a.storage, 'account-b/private/events');
  b.migrate(); b.apply();
  const remoteB = remote(); await b.sync(remoteB);
  assert.equal(remoteB.files.size, 0);
  assert.equal(a.read('tasks').length, 0);
  assert.equal(b.pending(), false);
  const peer = device(t); peer.journal.write('tasks', [task('local__private_b')]); await peer.journal.sync(remoteB);
  await b.sync(remoteB);
  assert.equal(a.read('tasks')[0].id, 'local__private_b');
  const returning = new a.window.Sync.PlannerJournal(a.storage, 'fixture');
  returning.migrate(); returning.apply();
  assert.equal(a.read('tasks')[0].id, 'local__private_a');
  assert.deepEqual(returning.batches().map(batch => JSON.stringify(batch)), original);
  const reloaded = new a.window.Sync.PlannerJournal(a.storage, 'fixture'); reloaded.migrate(); reloaded.apply();
  assert.equal(a.read('tasks')[0].id, 'local__private_a');
});
test('older scope migration markers prevent cache adoption while explicit imports remain allowed', t => {
  const a = device(t);
  a.storage.removeItem(a.journal.prefix + 'migrated');
  a.storage.setItem('planner.sync.older%2Fprivate.migrated', '1');
  a.storage.setItem('karmolab_planner_tasks', JSON.stringify([task('local__old_cache')]));
  const b = new a.window.Sync.PlannerJournal(a.storage, 'new-scope');
  b.migrate();
  assert.equal(b.batches().length, 0);
  a.storage.setItem(a.window.Sync.PLANNER_IMPORT_KEY, JSON.stringify({ karmolab_planner_tasks: JSON.stringify([task('local__selected')]) }));
  b.importPending();
  assert.equal(a.read('tasks')[0].id, 'local__selected');
  assert.equal(a.storage.getItem('planner.sync.older%2Fprivate.migrated'), '1');
});
test('scope switch preserves malformed cache without marking migration complete', t => {
  const a = device(t);
  a.storage.setItem('karmolab_planner_tasks', '{broken');
  const b = new a.window.Sync.PlannerJournal(a.storage, 'new-scope');
  assert.throws(() => b.migrate());
  assert.equal(a.storage.getItem('karmolab_planner_tasks'), '{broken');
  assert.equal(a.storage.getItem(b.prefix + 'migrated'), null);
  assert.equal(a.storage.getItem(a.journal.prefix + 'migrated'), '1');
});
test('invalid current migration marker preserves the marker and cached records', t => {
  const a = device(t);
  const raw = JSON.stringify([task('local__kept')]);
  a.storage.setItem('karmolab_planner_tasks', raw);
  a.storage.setItem(a.journal.prefix + 'migrated', '{broken');
  assert.throws(() => a.journal.migrate());
  assert.equal(a.storage.getItem('karmolab_planner_tasks'), raw);
  assert.equal(a.storage.getItem(a.journal.prefix + 'migrated'), '{broken');
});
test('live previous scope cannot replace or edit the active scope cache', async t => {
  const a = device(t);
  a.journal.write('tasks', [task('local__a')]);
  const original = JSON.stringify(a.journal.batches());
  const b = new a.window.Sync.PlannerJournal(a.storage, 'account-b');
  b.migrate(); b.apply(); b.write('tasks', [task('local__b')]);
  assert.throws(() => a.journal.apply());
  assert.throws(() => a.journal.write('tasks', [task('local__b', 'local__b', 'done')]));
  assert.throws(() => a.journal.importPending());
  const repo = remote(); await assert.rejects(a.journal.sync(repo));
  assert.equal(repo.files.size, 0);
  assert.equal(a.read('tasks')[0].id, 'local__b');
  assert.equal(JSON.stringify(a.journal.batches()), original);
  a.journal.migrate(); a.journal.apply();
  assert.equal(a.read('tasks')[0].id, 'local__a');
  assert.throws(() => b.apply());
});
for (const stage of ['tree', 'readJson', 'putNewJsonMany']) {
  test(`scope switch during ${stage} prevents stale cache writes and acknowledgments`, async t => {
    const a = device(t), repo = remote();
    a.journal.write('tasks', [task('local__a')]);
    if (stage === 'readJson') {
      const peer = device(t); peer.journal.write('tasks', [task('local__remote')]); await peer.journal.sync(repo);
    }
    const operation = repo[stage].bind(repo);
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    repo[stage] = async (...args) => { entered(); await gate; return operation(...args); };
    const syncing = a.journal.sync(repo);
    const rejected = assert.rejects(syncing);
    await ready;
    const b = new a.window.Sync.PlannerJournal(a.storage, 'account-b');
    b.migrate(); b.apply(); b.write('tasks', [task('local__b')]);
    const before = JSON.stringify(a.journal.batches());
    release(); await rejected;
    assert.equal(a.read('tasks')[0].id, 'local__b');
    assert.equal(JSON.stringify(a.journal.batches()), before);
    assert.equal(a.journal.pending(), true);
  });
}
test('desktop import validates the complete payload and retains it on failure', t => {
  const a = device(t);
  const raw = JSON.stringify({ karmolab_planner_tasks: JSON.stringify([task('local__imported')]), karmolab_planner_events: '{broken' });
  a.storage.setItem(a.window.Sync.PLANNER_IMPORT_KEY, raw);
  assert.throws(() => a.journal.importPending());
  assert.equal(a.journal.batches().length, 0);
  assert.equal(a.storage.getItem(a.window.Sync.PLANNER_IMPORT_KEY), raw);
  assert.equal(a.read('tasks').length, 0);
});
test('desktop import retries after a cache write failure without recording duplicate operations', t => {
  const a = device(t);
  a.storage.setItem(a.window.Sync.PLANNER_IMPORT_KEY, JSON.stringify({ karmolab_planner_tasks: JSON.stringify([task('local__imported')]) }));
  let fail = true;
  const storage = {
    getItem: key => a.storage.getItem(key),
    setItem(key, value) { if (fail && key === 'karmolab_planner_tasks') throw new Error('cache write failed'); a.storage.setItem(key, value); },
    key: index => a.storage.key(index), get length() { return a.storage.length; },
    removeItem: key => a.storage.removeItem(key)
  };
  const journal = new a.window.Sync.PlannerJournal(storage, 'fixture');
  assert.throws(() => journal.importPending(), /cache write failed/);
  assert.equal(journal.batches().length, 1);
  assert.notEqual(a.storage.getItem(a.window.Sync.PLANNER_IMPORT_KEY), null);
  assert.equal(a.read('tasks').length, 0);
  fail = false; journal.importPending();
  assert.equal(journal.batches().length, 1);
  assert.equal(a.read('tasks')[0].id, 'local__imported');
  assert.equal(a.storage.getItem(a.window.Sync.PLANNER_IMPORT_KEY), null);
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
