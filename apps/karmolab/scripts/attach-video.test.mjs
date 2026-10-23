import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/widgets/tools/shared/video.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const timers = new Map(), active = new Set(), revoked = [], disposers = [];
  let timerId = 0, urlId = 0;
  const exports = {};
  vm.runInNewContext(code, {
    exports, DOMException,
    URL: { createObjectURL: () => { const url = `blob:video-${++urlId}`; active.add(url); return url; }, revokeObjectURL: url => { active.delete(url); revoked.push(url); } },
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) },
    Toolbox: { onDispose: fn => disposers.push(fn) },
  });
  const attrs = {};
  const video = {
    dataset: {}, duration: NaN, videoWidth: 0, videoHeight: 0, currentTime: 0,
    onerror: null, onloadedmetadata: null, ontimeupdate: null,
    get src() { return attrs.src || ''; },
    set src(value) { attrs.src = value; this.duration = NaN; },
    getAttribute: name => attrs[name] ?? null,
    removeAttribute: name => { delete attrs[name]; },
    pause: () => {}, load: () => {},
  };
  return {
    video, active, revoked, timers, disposers, attach: blob => exports.attachVideo(video, blob),
    metadata(duration = 2, width = 320, height = 180) { Object.assign(video, { duration, videoWidth: width, videoHeight: height }); video.onloadedmetadata?.(); },
    timeout() { for (const fn of [...timers.values()]) fn(); },
    dispose() { for (const fn of disposers) fn(); },
  };
}

test('replacing a loaded video releases its previous owned URL', async () => {
  const f = fixture();
  const first = f.attach({}); f.metadata(); await first;
  const second = f.attach({}); f.metadata(4, 640, 360);
  const meta = await second;
  assert.equal(meta.duration, 4);
  assert.equal(meta.width, 640);
  assert.deepEqual(f.revoked, ['blob:video-1']);
  assert.equal(f.active.size, 1);
});

test('replacement aborts the old pending request before new metadata arrives', async () => {
  const f = fixture();
  let firstState = 'pending';
  const first = f.attach({}).then(() => { firstState = 'resolved'; }, error => { firstState = error.name; });
  const second = f.attach({});
  await Promise.resolve();
  assert.equal(firstState, 'AbortError');
  assert.equal(f.timers.size, 1);
  f.metadata(9);
  assert.equal((await second).duration, 9);
  await first;
});

test('successful metadata clears temporary handlers and timeout', async () => {
  const f = fixture();
  const result = f.attach({}); f.metadata(); await result;
  assert.equal(f.video.onerror, null);
  assert.equal(f.video.onloadedmetadata, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.active.size, 1);
});

test('decode failure releases the URL and removes the failed source', async () => {
  const f = fixture();
  const result = f.attach({});
  const rejected = assert.rejects(result);
  f.video.onerror();
  await rejected;
  assert.equal(f.active.size, 0);
  assert.equal(f.video.getAttribute('src'), null);
  assert.equal(f.timers.size, 0);
});

test('unknown duration becomes finite after the existing seek fallback', async () => {
  const f = fixture();
  const result = f.attach({}); f.metadata(Infinity);
  assert.equal(f.video.currentTime, 1e101);
  f.video.duration = 3.5; f.video.ontimeupdate();
  assert.equal((await result).duration, 3.5);
  assert.equal(f.video.currentTime, 0);
  assert.equal(f.video.ontimeupdate, null);
});

test('a zero-length timeout is rejected instead of reporting loaded metadata', async () => {
  const f = fixture();
  const result = f.attach({});
  const rejected = assert.rejects(result);
  f.video.duration = 0; f.timeout();
  await rejected;
  assert.equal(f.active.size, 0);
});

test('disposal releases the current video and aborts pending work', async () => {
  const f = fixture();
  let outcome = 'pending';
  const result = f.attach({}).catch(error => { outcome = error.name; });
  f.dispose();
  await Promise.resolve();
  assert.equal(outcome, 'AbortError');
  assert.equal(f.active.size, 0);
  assert.equal(f.timers.size, 0);
  await result;
});

test('all five consumers suppress replacement aborts while retaining real decode errors', () => {
  for (const [name, key] of [
    ['videocompress', 'videocompress.err.open'], ['videotrim', 'videotrim.err.open'],
    ['video2img', 'video2img.err.open'], ['video2gif', 'video2gif.err.open'], ['videobg', 'videobg.status.badVideo'],
  ]) {
    const text = readFileSync(new URL(`../src/widgets/tools/${name}.ts`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(name + '.ts', text, ts.ScriptTarget.Latest, true);
    let handler;
    const find = node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch') {
        const fn = node.arguments[0];
        if (fn && fn.getText(ast).includes(key)) handler = fn;
      }
      ts.forEachChild(node, find);
    };
    find(ast);
    assert.ok(handler, name + ' decode handler exists');
    const calls = [], api = {};
    const compiled = ts.transpileModule('exports.handle = ' + handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports: api, t: key => key, say: value => calls.push(value), status: { set textContent(value) { calls.push(value); } } });
    api.handle({ name: 'AbortError' });
    assert.equal(calls.length, 0, name + ' replacement is quiet');
    api.handle({ name: 'DecodeError' });
    assert.deepEqual(calls, [key], name + ' genuine error remains visible');
  }
});
