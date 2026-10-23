import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const source = readFileSync(new URL('../src/lib/esc-menu.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('esc-menu.ts', source, ts.ScriptTarget.Latest, true);
  let registration;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'addEventListener' && node.arguments[0]?.text === 'keydown') registration = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(registration);
  const listeners = { document: [], window: [] };
  let opened = false;
  const state = {
    custom: null, soloSite: () => false, isOpen: () => opened,
    open: () => { opened = true; }, close: () => { opened = false; },
    typing: () => state.typingNow, otherLayerOpen: () => state.layerNow,
    typingNow: false, layerNow: false,
    document: { activeElement: null, addEventListener: (name, fn) => listeners.document.push(fn) },
    window: { addEventListener: (name, fn) => listeners.window.push(fn) }
  };
  vm.runInNewContext(ts.transpileModule(registration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, state);
  const press = () => {
    const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const handler of [...listeners.document, ...listeners.window]) handler(event);
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
