import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const source = readFileSync(new URL('../src/widgets/tools/shared/material-shell.ts', import.meta.url), 'utf8');
const media = readFileSync(new URL('../src/widgets/tools/shared/media.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('media.ts', media, ts.ScriptTarget.Latest, true);
const attach = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'attachMedia');
assert.ok(attach);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(pending = false, tag = 'audio') {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://fixture.invalid/' });
  const disposers = [], active = new Set(), revoked = [], players = [];
  const urls = { createObjectURL: () => { const url = `blob:fixture-${++urls.count}`; active.add(url); return url; }, revokeObjectURL: url => { active.delete(url); revoked.push(url); }, count: 0 };
  const api = {};
  let release, alive;
  const wait = pending ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = {
    exports: api, require: () => ({ fileSize: () => '1KB' }), URL: urls,
    document: dom.window.document, window: dom.window, location: dom.window.location,
    HTMLMediaElement: dom.window.HTMLMediaElement,
    Toolbox: { onDispose: fn => disposers.push(fn) },
  };
  vm.runInNewContext(compile(attach.getText(ast)) + '\n' + compile(source), context);
  api.materialShell(dom.window.document.getElementById('app'), {
    id: 'preview-test', accept: 'audio/*', accepts: /^audio\//, groups: () => [],
    drop: { title: 'Open audio', hint: 'Local fixture' },
    labels: { change: 'Change', recent: 'Recent', back: 'Back', chain: 'Use result', more: 'More', fail: 'Preview failed' },
    preview: async (file, box, isAlive) => {
      alive = isAlive;
      const player = dom.window.document.createElement(tag);
      player.pauses = 0; player.loads = 0;
      player.pause = () => player.pauses++;
      player.load = () => player.loads++;
      api.attachMedia(player, file);
      box.appendChild(player); players.push(player);
      if (file.name === 'bad.wav') throw Error('Fixture decode failure');
      await wait;
      return 'decoded';
    },
  });
  return {
    dom, active, revoked, players, urls, release, alive: () => alive?.(),
    upload: async name => {
      const input = dom.window.document.getElementById('pfFile');
      Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['pcm'], name, { type: 'audio/wav' })] });
      input.dispatchEvent(new dom.window.Event('change'));
      await settle();
    },
    dispose: () => { for (const fn of disposers) fn(); },
  };
}

test('replacing a file releases the old URL and stops its detached player', async () => {
  const f = fixture();
  await f.upload('one.wav');
  await f.upload('two.wav');
  assert.equal(f.active.size, 1);
  assert.deepEqual(f.revoked, ['blob:fixture-1']);
  assert.equal(f.players[0].pauses, 1);
  assert.equal(f.players[0].loads, 1);
  assert.equal(f.players[0].getAttribute('src'), null);
  assert.equal(f.players[1].isConnected, true);
  f.dom.window.close();
});

test('a failed preview releases URLs before replacing its error surface', async () => {
  const f = fixture();
  await f.upload('bad.wav');
  assert.equal(f.active.size, 0);
  assert.equal(f.dom.window.document.querySelector('.pf-empty')?.textContent, 'Preview failed');
  f.dom.window.close();
});

test('disposal releases preview media and invalidates pending completion', async () => {
  const f = fixture(true);
  await f.upload('slow.wav');
  assert.equal(f.alive(), true);
  f.dispose();
  assert.equal(f.alive(), false);
  assert.equal(f.active.size, 0);
  f.release();
  await settle();
  assert.notEqual(f.dom.window.document.getElementById('pfMeta').textContent, 'decoded');
  f.dom.window.close();
});

test('preview cleanup preserves an unrelated operation URL', async () => {
  const f = fixture();
  const external = f.urls.createObjectURL();
  const other = f.dom.window.document.createElement('video');
  other.dataset.karmoObjectUrl = external; other.src = external;
  f.dom.window.document.getElementById('pfHost').appendChild(other);
  await f.upload('one.wav');
  await f.upload('two.wav');
  assert.equal(f.active.size, 2);
  assert.equal(f.active.has(external), true);
  assert.equal(other.getAttribute('src'), external);
  f.dom.window.close();
});

test('owned video and image previews also release URLs on replacement', async () => {
  for (const tag of ['video', 'img']) {
    const f = fixture(false, tag);
    await f.upload('one.wav');
    await f.upload('two.wav');
    assert.equal(f.active.size, 1, tag);
    assert.deepEqual(f.revoked, ['blob:fixture-1']);
    assert.equal(f.players[0].pauses, tag === 'video' ? 1 : 0);
    assert.equal(f.players[0].isConnected, false);
    f.dom.window.close();
  }
});
