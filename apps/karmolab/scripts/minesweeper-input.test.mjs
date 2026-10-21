import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/arcade/games/minesweeper-view.ts', import.meta.url));
const translations = JSON.parse(await readFile(new URL('../i18n/ko/arcade.json', import.meta.url), 'utf8'));
const bundle = await build({ stdin: { contents: `import { minesweeperView } from ${JSON.stringify(entry)}; window.drawFixture = minesweeperView.mount(document.getElementById('board'), window.fixtureAct);`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
function screen(t) {
  const dom = new JSDOM('<html lang="ko"><main id="board"></main></html>', { url: 'http://localhost/mine-fixture', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { arcade: translations } };
  const actions = [], timers = new Map();
  let timerId = 0;
  window.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.fixtureAct = action => actions.push({ ...action });
  window.eval(bundle.outputFiles[0].text);
  window.drawFixture({ state: { w: 9, h: 9, nums: Array(81).fill(-1), seen: [Array(81).fill(0)], dead: [false], opened: [0], clicks: [0], over: false }, seats: [{ name: 'fixture player' }] }, 0, 0);
  const cells = [...window.document.querySelectorAll('.ac-mc')];
  const pointer = (cell, type, button = 0, pointerId = 1) => cell.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), { button, pointerId }));
  const context = cell => cell.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  const fire = () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); };
  return { window, cells, actions, pointer, context, fire };
}

test('a cancelled press cannot later place a flag', t => {
  const ui = screen(t);
  ui.pointer(ui.cells[0], 'pointerdown');
  ui.pointer(ui.cells[0], 'pointercancel');
  ui.fire();
  assert.deepEqual(ui.actions, []);
});

test('right click sends only the flag action', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown', 2);
  ui.context(cell);
  ui.pointer(cell, 'pointerup', 2);
  ui.fire();
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});

test('a native context menu after a long press does not toggle the flag twice', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown');
  ui.fire();
  ui.context(cell);
  ui.pointer(cell, 'pointerup');
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});

test('a context menu before the hold deadline cancels the delayed duplicate', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown');
  ui.context(cell);
  ui.fire();
  ui.pointer(cell, 'pointerup');
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});

test('a context menu after releasing a long press remains one flag action', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown');
  ui.fire();
  ui.pointer(cell, 'pointerup');
  ui.context(cell);
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});

test('a detached board cannot receive a delayed flag action', t => {
  const ui = screen(t);
  ui.pointer(ui.cells[0], 'pointerdown');
  ui.window.document.getElementById('board').remove();
  ui.fire();
  assert.deepEqual(ui.actions, []);
});

test('a superseded pointer cannot clear the newer cell press', t => {
  const ui = screen(t);
  ui.pointer(ui.cells[0], 'pointerdown', 0, 1);
  ui.pointer(ui.cells[1], 'pointerdown', 0, 2);
  ui.pointer(ui.cells[0], 'pointerup', 0, 1);
  ui.pointer(ui.cells[1], 'pointerup', 0, 2);
  ui.fire();
  assert.deepEqual(ui.actions, [{ cell: 1 }]);
});

test('a short primary press still opens its cell', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown');
  ui.pointer(cell, 'pointerup');
  ui.fire();
  assert.deepEqual(ui.actions, [{ cell: 0 }]);
});

test('a long primary press places one flag without opening', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown');
  ui.fire();
  ui.pointer(cell, 'pointerup');
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});

test('keyboard flag and open actions stay available', t => {
  const ui = screen(t), cell = ui.cells[0];
  cell.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  cell.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }, { cell: 0 }]);
});
