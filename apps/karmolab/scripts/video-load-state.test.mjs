import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(name) {
  const source = readFileSync(new URL(`../src/widgets/tools/${name}.ts`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(name + '.ts', source, ts.ScriptTarget.Latest, true);
  let load;
  const find = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'load') load = node; ts.forEachChild(node, find); };
  find(ast); assert.ok(load);
  const code = ts.transpileModule(load.getText(ast) + '\nexports.load = load;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const requests = [], messages = [], elements = new Map();
  const state = {
    exports: {}, fileName: 'old.webm', sourceSize: 10000, duration: 10, made: {},
    sourceVersion: 0, cancelActive: null, stopBtn: { style: {} },
    editor: { style: { display: '' } }, runBtn: { disabled: false }, saveBtn: { disabled: false },
    video: { duration: 10, videoWidth: 320, videoHeight: 180, currentTime: 0 }, startEl: {}, endEl: {},
    $: selector => { if (!elements.has(selector)) elements.set(selector, { style: {} }); return elements.get(selector); },
    attachVideo: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    refresh: () => {}, say: message => messages.push(message), t: key => key, mmss: String, size: String,
  };
  vm.runInNewContext(code, state);
  return { state, requests, messages, load: () => state.exports.load({ name: 'next.webm', size: 1234 }) };
}

for (const name of ['videotrim', 'videocompress']) {
  test(name + ' replacing the source cancels active recording and advances ownership', () => {
    const f = fixture(name); let cancellations = 0;
    f.state.cancelActive = () => cancellations++;
    f.load();
    assert.equal(cancellations, 1);
    assert.equal(f.state.sourceVersion, 1);
  });
  test(name + ' hides the stale editor while current metadata is pending', async () => {
    const f = fixture(name); f.load();
    assert.equal(f.state.editor.style.display, 'none');
    assert.equal(f.state.runBtn.disabled, true);
    assert.equal(f.state.duration, 0);
    assert.equal(f.state.saveBtn.disabled, true);
    f.state.video.duration = 4;
    f.requests[0].resolve(); await settle();
    assert.equal(f.state.editor.style.display, '');
    assert.equal(f.state.runBtn.disabled, false);
    assert.equal(f.state.duration, 4);
  });

  test(name + ' decode failure stays unavailable and another valid file recovers', async () => {
    const f = fixture(name); f.load();
    f.requests[0].reject(new Error('Invalid fixture')); await settle();
    assert.equal(f.state.editor.style.display, 'none');
    assert.equal(f.state.runBtn.disabled, true);
    assert.equal(f.state.duration, 0);
    assert.ok(f.messages.includes(name + '.err.open'));
    f.load(); f.state.video.duration = 7;
    f.requests[1].resolve(); await settle();
    assert.equal(f.state.runBtn.disabled, false);
    assert.equal(f.state.editor.style.display, '');
    assert.equal(f.state.duration, 7);
  });
}
