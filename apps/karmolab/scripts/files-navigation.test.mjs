import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { memoryStore, createVault, putFile } from '../../files/src/vault.mjs';

const entry = fileURLToPath(new URL('../../files/app.mjs', import.meta.url));
const html = await readFile(new URL('../../files/index.html', import.meta.url), 'utf8');
const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife',
  define: { 'import.meta.url': JSON.stringify('http://localhost/apps/files/app.mjs') }, logLevel: 'silent' });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function screen(t, hash = '#laptop/slow', setup = () => {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/apps/files/index.html' + hash, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  const pending = [];
  window.sessionStorage.setItem('files.laptop.pass', 'fixture-only');
  window.fetch = (url, options) => new Promise((resolve, reject) => pending.push({ url: String(url), options, resolve, reject }));
  window.URL.revokeObjectURL = () => {};
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  setup(window, pending);
  window.eval(bundle.outputFiles[0].text);
  const go = async next => { window.location.hash = next; await tick(); };
  return { window, pending, go, box: () => window.document.getElementById('box').textContent };
}
const json = (data, status = 200) => ({ status, ok: status === 200, headers: new Headers(), json: async () => data });
const folder = name => json({ ok: true, path: name, entries: [{ name, rel: name, dir: true, at: 0 }] });

test('late PC list cannot replace the cloud password form', async t => {
  const ui = await screen(t);
  await ui.go('#vault/');
  ui.pending[0].resolve(folder('OLD-PC-LIST'));
  await tick();
  assert.match(ui.box(), /비밀번호를 입력하세요/);
  assert.doesNotMatch(ui.box(), /OLD-PC-LIST/);
});

test('returning to the same folder keeps the newer response', async t => {
  const ui = await screen(t);
  await ui.go('#laptop/other');
  await ui.go('#laptop/slow');
  ui.pending[2].resolve(folder('NEW-LIST'));
  await tick();
  ui.pending[0].resolve(folder('OLD-LIST'));
  await tick();
  assert.match(ui.box(), /NEW-LIST/);
  assert.doesNotMatch(ui.box(), /OLD-LIST/);
});

test('late authentication failure preserves the current tab and stored credential', async t => {
  const ui = await screen(t);
  await ui.go('#vault/');
  ui.window.sessionStorage.setItem('files.laptop.pass', 'new-fixture-only');
  ui.pending[0].resolve(json({}, 401));
  await tick();
  assert.equal(ui.window.sessionStorage.getItem('files.laptop.pass'), 'new-fixture-only');
  assert.doesNotMatch(ui.box(), /틀렸거나 만료/);
});

test('late PC network errors do not replace the new tab', async t => {
  const ui = await screen(t);
  await ui.go('#vault/');
  ui.pending[0].reject(new Error('old connection failed'));
  await tick();
  assert.match(ui.box(), /비밀번호를 입력하세요/);
  assert.doesNotMatch(ui.box(), /old connection/);
});

test('late build list cannot replace the cloud form', async t => {
  const ui = await screen(t, '#builds');
  await ui.go('#vault/');
  ui.pending[0].resolve(json({ ok: true, canStart: false, live: true, rows: [] }));
  await tick();
  assert.match(ui.box(), /비밀번호를 입력하세요/);
  assert.doesNotMatch(ui.box(), /빌드 진행 중/);
});

test('late build log cannot replace the selected newer log', async t => {
  const ui = await screen(t, '#builds/log/old');
  await ui.go('#builds/log/new');
  ui.pending[1].resolve(json({ ok: true, tail: 'NEW-LOG', state: 'done', live: false }));
  await tick();
  ui.pending[0].resolve(json({ ok: true, tail: 'OLD-LOG', state: 'done', live: false }));
  await tick();
  assert.match(ui.box(), /NEW-LOG/);
  assert.doesNotMatch(ui.box(), /OLD-LOG/);
});

test('the active PC request still renders its response', async t => {
  const ui = await screen(t);
  ui.pending[0].resolve(folder('ACTIVE-LIST'));
  await tick();
  assert.match(ui.box(), /ACTIVE-LIST/);
});

test('late JSON parsing cannot replace the current cloud form or its input', async t => {
  const ui = await screen(t);
  let finish;
  const response = json({});
  response.json = () => new Promise(resolve => { finish = resolve; });
  ui.pending[0].resolve(response);
  await tick();
  await ui.go('#vault/');
  const input = ui.window.document.getElementById('pass');
  input.value = 'unsent-fixture-input';
  finish({ ok: true, entries: [] });
  await tick();
  assert.equal(ui.window.document.getElementById('pass'), input);
  assert.equal(input.value, 'unsent-fixture-input');
});

test('active authentication failure still requests a new password', async t => {
  const ui = await screen(t);
  ui.pending[0].resolve(json({}, 401));
  await tick();
  assert.equal(ui.window.sessionStorage.getItem('files.laptop.pass'), null);
  assert.match(ui.box(), /틀렸거나 만료/);
});

test('late build-start response cannot schedule a return to the build tab', async t => {
  const delayed = [];
  const ui = await screen(t, '#builds', window => {
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => ms === 1200 ? delayed.push(fn) : timeout(fn, ms, ...args);
  });
  ui.pending[0].resolve(json({ ok: true, canStart: true, rows: [], live: false }));
  await tick();
  ui.window.document.querySelector('[data-build-start="windows"]').click();
  await ui.go('#vault/');
  ui.pending[1].resolve(json({ ok: true, message: 'fixture start accepted' }));
  await tick();
  assert.equal(delayed.length, 0);
  assert.match(ui.box(), /비밀번호를 입력하세요/);
});

test('completed PC upload cannot schedule an old folder refresh after switching tabs', async t => {
  const delayed = [];
  const ui = await screen(t, '#laptop/slow', window => {
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => ms === 800 ? delayed.push(fn) : timeout(fn, ms, ...args);
  });
  ui.pending[0].resolve(json({ ok: true, entries: [] }));
  await tick();
  const input = ui.window.document.getElementById('pc-up-file');
  Object.defineProperty(input, 'files', { value: [new ui.window.File(['fixture'], 'a.txt')] });
  ui.window.document.getElementById('pc-up').dispatchEvent(new ui.window.Event('submit', { cancelable: true }));
  await ui.go('#vault/');
  ui.pending[1].resolve(json({ name: 'a.txt' }));
  await tick();
  assert.equal(delayed.length, 0);
  assert.match(ui.box(), /비밀번호를 입력하세요/);
});

const store = memoryStore();
const vault = await createVault(store, 'fixture-only', { iterations: 8000 });
const vaultEntry = await putFile(vault, 'a.txt', new TextEncoder().encode('CLOUD-FILE-A'));
const snapshot = store.snapshot();
const binary = bytes => ({ status: bytes ? 200 : 404, ok: Boolean(bytes), arrayBuffer: async () => Uint8Array.from(bytes).buffer });
const until = async predicate => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Fixture did not reach its expected request');
    await tick();
  }
};
function cloudSetup(heldKey, held, counters) {
  return (window, pending) => {
    const subtle = new Proxy(webcrypto.subtle, {
      get(target, name) {
        if (typeof target[name] !== 'function') return target[name];
        return async (...args) => {
          const result = await target[name](...args);
          if (name === 'digest') counters.digests = (counters.digests || 0) + 1;
          return result;
        };
      },
    });
    Object.defineProperty(window, 'crypto', { value: { subtle }, configurable: true });
    window.sessionStorage.setItem('files.vault.pass', 'fixture-only');
    window.URL.createObjectURL = () => { counters.blobs += 1; return 'blob:fixture'; };
    window.fetch = (url, options) => {
      const key = String(url).split('/v/')[1];
      if (key === heldKey) return new Promise((resolve, reject) => held.push({ resolve, reject }));
      if (key) return Promise.resolve(binary(snapshot.get(key)));
      if (String(url).endsWith('/blob/hdr')) return Promise.resolve(binary(null));
      return new Promise((resolve, reject) => pending.push({ url: String(url), options, resolve, reject }));
    };
  };
}

test('late cloud unlock errors cannot replace the current PC folder or clear newer password', async t => {
  const held = [];
  const ui = await screen(t, '#vault/', cloudSetup('idx', held, { blobs: 0 }));
  await until(() => held.length === 1);
  await ui.go('#laptop/current');
  ui.pending[0].resolve(folder('CURRENT-PC'));
  await tick();
  ui.window.sessionStorage.setItem('files.vault.pass', 'new-fixture-only');
  held[0].reject(new Error('old cloud request failed'));
  await tick();
  assert.match(ui.box(), /CURRENT-PC/);
  assert.equal(ui.window.sessionStorage.getItem('files.vault.pass'), 'new-fixture-only');
});

test('late decrypted cloud file cannot replace a new tab or create an obsolete blob', async t => {
  const held = [], counters = { blobs: 0 };
  const key = `c/${vaultEntry.id}/0`;
  const ui = await screen(t, '#vault/a.txt', cloudSetup(key, held, counters));
  await until(() => held.length === 1);
  await ui.go('#laptop/current');
  ui.pending[0].resolve(folder('CURRENT-PC'));
  await tick();
  const priorDigests = counters.digests || 0;
  held[0].resolve(binary(snapshot.get(key)));
  await until(() => counters.digests > priorDigests);
  await tick();
  assert.match(ui.box(), /CURRENT-PC/);
  assert.equal(counters.blobs, 0);
});

test('the active cloud file still decrypts and renders', async t => {
  const counters = { blobs: 0 };
  const ui = await screen(t, '#vault/a.txt', cloudSetup(null, [], counters));
  await until(() => ui.box().includes('CLOUD-FILE-A'));
  assert.equal(counters.blobs, 1);
});
