import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const source = readFileSync(new URL('../src/widgets/tools/sound.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sound.ts', source, ts.ScriptTarget.Latest, true);
let fn;
const find = node => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'drawWaveform') fn = node;
  ts.forEachChild(node, find);
};
find(ast);
assert.ok(fn, 'actual sound preview function exists');
const code = ts.transpileModule(fn.getText(ast) + '\nexports.drawWaveform = drawWaveform;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function fixture() {
  const dom = new JSDOM('<div id="preview"></div>');
  const exports = {};
  const mmss = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  vm.runInNewContext(code, {
    exports, document: dom.window.document, attachMedia: () => {}, drawWave: () => {}, peaks: () => [],
    loadAudioInfo: async () => ({ buffer: { duration: 12.5, numberOfChannels: 2 }, rate: 48000 }),
    mmss, fileSize: () => '1KB', t: (_key, _args, fallback) => fallback,
  });
  await exports.drawWaveform({ size: 1024 }, dom.window.document.getElementById('preview'), () => true);
  const canvas = dom.window.document.getElementById('sdWave');
  return {
    dom, canvas, player: dom.window.document.getElementById('sdPlayer'),
    press: key => canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, cancelable: true })),
    now: () => Number(canvas.getAttribute('aria-valuenow')),
  };
}

test('waveform slider exposes its initial time and range', async () => {
  const f = await fixture();
  assert.equal(f.canvas.getAttribute('aria-valuemin'), '0');
  assert.equal(f.canvas.getAttribute('aria-valuemax'), '12.5');
  assert.equal(f.canvas.getAttribute('aria-valuenow'), '0');
  assert.equal(f.canvas.getAttribute('aria-valuetext'), '0:00 / 0:12');
  f.dom.window.close();
});

test('media time updates synchronize visual cursor and accessibility value', async () => {
  const f = await fixture();
  f.player.currentTime = 7.25;
  f.player.dispatchEvent(new f.dom.window.Event('timeupdate'));
  assert.equal(f.canvas.getAttribute('aria-valuenow'), '7.25');
  assert.equal(f.canvas.getAttribute('aria-valuetext'), '0:07 / 0:12');
  assert.ok(Math.abs(Number.parseFloat(f.dom.window.document.getElementById('sdCursor').style.left) - 58) < 1e-9);
  f.dom.window.close();
});

test('all arrow keys move within bounds and announce the immediate position', async () => {
  const f = await fixture();
  for (const [key, expected] of [['ArrowUp', 5], ['ArrowRight', 10], ['ArrowUp', 12.5], ['ArrowDown', 7.5], ['ArrowLeft', 2.5], ['ArrowDown', 0]]) {
    f.press(key);
    assert.equal(f.player.currentTime, expected, key);
    assert.equal(f.now(), expected, key);
  }
  f.dom.window.close();
});

test('Home and End reach and announce exact range boundaries', async () => {
  const f = await fixture();
  f.press('End');
  assert.equal(f.player.currentTime, 12.5);
  assert.equal(f.now(), 12.5);
  f.press('Home');
  assert.equal(f.player.currentTime, 0);
  assert.equal(f.canvas.getAttribute('aria-valuenow'), '0');
  f.dom.window.close();
});
