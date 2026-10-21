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

test('closed cells have unique coordinate names without revealing hidden numbers', t => {
  const ui = screen(t);
  const names = ui.cells.map(cell => cell.getAttribute('aria-label'));
  assert.equal(new Set(names).size, 81);
  assert.match(names[0], /1행 1열.*닫힘/);
  assert.match(names[80], /9행 9열.*닫힘/);
});

test('the board exposes one tab stop and arrow keys move without taking a turn', t => {
  const ui = screen(t);
  assert.equal(ui.cells.filter(cell => cell.tabIndex === 0).length, 1);
  ui.cells[0].focus();
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowDown', 10], ['ArrowLeft', 9], ['ArrowUp', 0], ['ArrowLeft', 0], ['ArrowUp', 0]]) {
    ui.window.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    assert.equal(ui.window.document.activeElement, ui.cells[expected]);
  }
  assert.deepEqual(ui.actions, []);
});

function redraw(ui, seen, nums = Array(81).fill(-1)) {
  ui.window.drawFixture({ state: { w: 9, h: 9, nums, seen: [seen], dead: [false], opened: [0], clicks: [0], over: false }, seats: [{ name: 'fixture player' }] }, 0, 0);
}

test('revealed and flagged cells describe only their visible state', t => {
  const ui = screen(t), seen = Array(81).fill(0), nums = Array(81).fill(7);
  seen[0] = 2; seen[1] = 1; seen[2] = 1; nums[2] = 0;
  redraw(ui, seen, nums);
  assert.match(ui.cells[0].getAttribute('aria-label'), /깃발/);
  assert.match(ui.cells[1].getAttribute('aria-label'), /주변 지뢰 7개/);
  assert.match(ui.cells[2].getAttribute('aria-label'), /빈칸/);
  assert.doesNotMatch(ui.cells[3].getAttribute('aria-label'), /7/);
});

test('opening the focused cell transfers focus and the tab stop to an available cell', t => {
  const ui = screen(t), seen = Array(81).fill(0);
  ui.cells[0].focus(); seen[0] = 1; seen[1] = 1;
  redraw(ui, seen);
  assert.equal(ui.window.document.activeElement, ui.cells[2]);
  assert.equal(ui.cells[2].tabIndex, 0);
  assert.equal(ui.cells.filter(cell => cell.tabIndex === 0).length, 1);
  ui.cells[2].dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  assert.equal(ui.window.document.activeElement, ui.cells[2]);
});

test('board refresh does not take focus from another control', t => {
  const ui = screen(t), outside = ui.window.document.createElement('button');
  ui.window.document.body.append(outside); outside.focus();
  const seen = Array(81).fill(0); seen[0] = 1;
  redraw(ui, seen);
  assert.equal(ui.window.document.activeElement, outside);
  assert.equal(ui.cells[1].tabIndex, 0);
});

test('Home and End stay in the current row and skip revealed cells', t => {
  const ui = screen(t), seen = Array(81).fill(0); seen[9] = 1; seen[17] = 1;
  redraw(ui, seen); ui.cells[12].focus();
  for (const [key, index] of [['Home', 10], ['End', 16]]) {
    ui.window.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    assert.equal(ui.window.document.activeElement, ui.cells[index]);
  }
  assert.deepEqual(ui.actions, []);
});

test('vertical navigation skips opened cells in the same column', t => {
  const ui = screen(t), seen = Array(81).fill(0); seen[9] = 1;
  redraw(ui, seen); ui.cells[0].focus();
  ui.cells[0].dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(ui.window.document.activeElement, ui.cells[18]);
  assert.deepEqual(ui.actions, []);
});

test('a finished board remains one keyboard stop without active cell controls', t => {
  const ui = screen(t); ui.cells[0].focus();
  ui.window.drawFixture({ state: { w: 9, h: 9, nums: Array(81).fill(-1), seen: [Array(81).fill(0)], dead: [true], opened: [0], clicks: [0], over: true }, seats: [{ name: 'fixture player' }] }, 0, 0);
  assert.equal(ui.cells.filter(cell => !cell.disabled).length, 0);
  assert.equal(ui.cells.filter(cell => cell.tabIndex === 0).length, 0);
  assert.equal(ui.window.document.activeElement, ui.window.document.getElementById('acMsGrid'));
  assert.equal(ui.window.document.activeElement.tabIndex, 0);
});

test('holding an action key cannot act again after focus advances', t => {
  const ui = screen(t), seen = Array(81).fill(0);
  ui.cells[0].focus();
  ui.cells[0].dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  seen[0] = 1; redraw(ui, seen);
  for (const key of ['Enter', ' ', 'f', 'F']) {
    ui.window.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key, repeat: true, bubbles: true, cancelable: true }));
  }
  assert.deepEqual(ui.actions, [{ cell: 0 }]);
  ui.window.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }));
  assert.equal(ui.window.document.activeElement, ui.cells[2]);
});

test('pointer-free native button activation opens a cell', t => {
  const ui = screen(t);
  ui.cells[0].click();
  assert.deepEqual(ui.actions, [{ cell: 0 }]);
});

test('the click following a physical press does not open twice', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown'); ui.pointer(cell, 'pointerup');
  cell.dispatchEvent(new ui.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.deepEqual(ui.actions, [{ cell: 0 }]);
});

test('a physical click following a held flag cannot open the cell', t => {
  const ui = screen(t), cell = ui.cells[0];
  ui.pointer(cell, 'pointerdown'); ui.fire(); ui.pointer(cell, 'pointerup');
  cell.dispatchEvent(new ui.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.deepEqual(ui.actions, [{ cell: 0, flag: true }]);
});
