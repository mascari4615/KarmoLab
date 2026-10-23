import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const source = readFileSync(new URL('../src/lib/esc-menu.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('esc-menu.ts', source, ts.ScriptTarget.Latest, true);
  const registrations = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'addEventListener' && node.arguments[0]?.text === 'keydown') registrations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(registrations.length);
  const listeners = { root: [], document: [], window: [] };
  let opened = false;
  const state = {
    custom: null, soloSite: () => false, isOpen: () => opened,
    open: () => { opened = true; }, close: () => { opened = false; },
    typing: () => state.typingNow, otherLayerOpen: () => state.layerNow,
    typingNow: false, layerNow: false,
    el: { addEventListener: (name, fn) => listeners.root.push(fn) },
    document: { activeElement: null, addEventListener: (name, fn) => listeners.document.push(fn) },
    window: { addEventListener: (name, fn) => listeners.window.push(fn) }
  };
  vm.runInNewContext(ts.transpileModule(registrations.map(node => node.getText(ast)).join(';\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, state);
  const press = () => {
    const event = { key: 'Escape', defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    const path = [...(opened ? listeners.root : []), ...listeners.document, ...listeners.window];
    for (const handler of path) { if (event.stopped) break; handler(event); }
    return event;
  };
  return { state, listeners, press, isOpen: () => opened };
}

test('a later document widget handler can consume Escape before the shell opens', () => {
  const f = fixture();
  f.listeners.document.push(event => event.preventDefault());
  f.press();
  assert.equal(f.isOpen(), false);
});

test('unhandled Escape still opens and closes the shell menu', () => {
  const f = fixture();
  assert.equal(f.press().defaultPrevented, true);
  assert.equal(f.isOpen(), true);
  f.press();
  assert.equal(f.isOpen(), false);
});

test('typing and existing dialogs retain Escape ownership', () => {
  const f = fixture();
  f.state.typingNow = true;
  f.press();
  assert.equal(f.isOpen(), false);
  f.state.typingNow = false;
  f.state.layerNow = true;
  f.press();
  assert.equal(f.isOpen(), false);
});

test('Escape inside the open menu closes it without reaching background widgets', () => {
  const f = fixture();
  f.press();
  let backgroundEvents = 0;
  f.listeners.document.push(event => { backgroundEvents++; event.preventDefault(); });
  f.press();
  assert.equal(f.isOpen(), false);
  assert.equal(backgroundEvents, 0);
});
