import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const source = readFileSync(new URL('../src/widgets/tools/videorotate.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('videorotate.ts', source, ts.ScriptTarget.Latest, true);
  let load;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'load') load = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(load);
  const video = { seeking: false, readyState: 4 };
  let seeks = 0;
  Object.defineProperty(video, 'currentTime', {
    get: () => 0,
    set: () => { seeks++; video.seeking = true; video.readyState = 1; }
  });
  const paints = [], messages = [], elements = new Map();
  const state = {
    video, exports: {}, baseName: '', runBtn: { disabled: true },
    attachMedia() {}, showStats() {}, t: key => key,
    paint: () => paints.push(!video.seeking && video.readyState >= 2),
    say: text => messages.push({ text, hasFrame: paints.at(-1) }),
    $: selector => { if (!elements.has(selector)) elements.set(selector, { style: {} }); return elements.get(selector); }
  };
  const code = ts.transpileModule(load.getText(ast) + '\nexports.load = load;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, state);
  state.exports.load({ name: 'corner.webm' });
  return { state, video, paints, messages, seekCount: () => seeks };
}

test('ready preview waits for the first seek to supply a decoded frame', () => {
  const f = fixture();
  f.video.onloadeddata();
  assert.equal(f.seekCount(), 1);
  assert.equal(f.paints.length, 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.state.runBtn.disabled, true);
  f.video.seeking = false;
  f.video.readyState = 4;
  f.video.onseeked();
  assert.equal(f.paints[0], true);
  assert.equal(f.messages.at(-1).hasFrame, true);
});

test('later playback seeks still repaint the preview', () => {
  const f = fixture();
  f.video.onloadeddata();
  f.video.seeking = false;
  f.video.readyState = 4;
  f.video.onseeked();
  f.video.onseeked();
  assert.equal(f.paints.at(-1), true);
  assert.equal(f.paints.length, 2);
});
