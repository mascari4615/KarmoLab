import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/tick.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(hidden = false) {
  const listeners = new Set();
  const timers = new Map();
  let sequence = 0;
  const document = {
    hidden,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const window = {
    setInterval: (fn) => { const id = ++sequence; timers.set(id, fn); return id; },
    clearInterval: (id) => timers.delete(id),
  };
  const exports = {};
  vm.runInNewContext(code, { exports, document, window });
  return {
    run: exports.intervalWhileVisible, timers, listeners,
    visible(value) {
      document.hidden = !value;
      for (const fn of [...listeners]) fn();
    },
    tick() { for (const fn of [...timers.values()]) fn(); },
  };
}

test('visible interval starts once and disposal removes timer and listener', () => {
  const f = fixture();
  let calls = 0;
  const stop = f.run(() => calls++, 6000);
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(calls, 1);
  stop(); stop();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});

test('hidden interval stays stopped and refreshes when visible by default', () => {
  const f = fixture(true);
  let calls = 0;
  const stop = f.run(() => calls++, 6000);
  assert.equal(f.timers.size, 0);
  f.visible(true);
  assert.equal(calls, 1);
  assert.equal(f.timers.size, 1);
  f.visible(false);
  assert.equal(f.timers.size, 0);
  f.tick();
  assert.equal(calls, 1);
  stop();
});

test('presentation waits for its next interval after returning', () => {
  const f = fixture(true);
  let calls = 0;
  const stop = f.run(() => calls++, 6000, { refreshOnResume: false });
  f.visible(true);
  assert.equal(calls, 0);
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(calls, 1);
  stop();
});

test('disposing during resume refresh cannot resurrect an interval', () => {
  const f = fixture(true);
  let calls = 0;
  let stop;
  stop = f.run(() => { calls++; stop(); }, 6000);
  f.visible(true);
  assert.equal(calls, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
});

test('disposing inside a scheduled tick leaves no interval', () => {
  const f = fixture();
  let stop;
  stop = f.run(() => stop(), 6000);
  f.tick();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});
