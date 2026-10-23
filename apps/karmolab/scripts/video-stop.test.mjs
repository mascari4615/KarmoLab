import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function fixture(name) {
  const source = readFileSync(new URL(`../src/widgets/tools/${name}.ts`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(name + '.ts', source, ts.ScriptTarget.Latest, true);
  let run;
  const find = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') run = node; ts.forEachChild(node, find); };
  find(ast); assert.ok(run);
  const code = ts.transpileModule(run.getText(ast) + '\nexports.run = run;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const tracks = [], intervals = new Map(), messages = [], displayed = [];
  const stream = () => {
    const list = ['video', 'audio'].map(kind => { const track = { kind, stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return track; });
    return { getTracks: () => [...list], getAudioTracks: () => list.filter(t => t.kind === 'audio'), addTrack: t => list.push(t), removeTrack: t => list.splice(list.indexOf(t), 1) };
  };
  const stopBtn = { style: {}, onclick: null }, runBtn = { disabled: false }, saveBtn = { disabled: true };
  const selectors = new Map();
  const $ = key => { if (!selectors.has(key)) selectors.set(key, { checked: true, style: {} }); return selectors.get(key); };
  class Recorder {
    state = 'inactive';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(400)]) }); queueMicrotask(() => this.onstop?.()); }
  }
  let timerId = 0;
  const video = { currentTime: 0, onended: null, captureStream: stream, play: async () => {}, pause: () => {} };
  const context = {
    exports: {}, Blob, MediaRecorder: Recorder, made: null, recorder: null,
    video, duration: 10, sourceSize: 10000, runBtn, stopBtn, saveBtn, preview: {}, stats: {}, $, document: {
      createElement: () => ({ width: 0, height: 0, captureStream: stream, getContext: () => ({ drawImage: () => {} }) }),
      addEventListener: () => {}, removeEventListener: () => {},
    },
    window: { setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id) },
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    outSize: () => ({ w: 320, h: 180 }), bitsPerSecond: () => 100000,
    startSec: () => 0, endSec: () => 10, seekTo: async () => {}, pickRecordType: () => 'video/webm',
    say: value => messages.push(value), t: key => key, size: value => String(value), mmss: value => String(value),
    statCell: () => '', attachMedia: (_el, value) => displayed.push(value), Toolbox: { trackUse: () => {} },
  };
  vm.runInNewContext(code, context);
  return {
    context, tracks, intervals, messages, displayed,
    run: context.exports.run,
    cancel: () => stopBtn.onclick(),
    finish: () => { video.currentTime = 10; if (video.onended) video.onended(); else for (const fn of intervals.values()) fn(); },
  };
}

for (const name of ['videotrim', 'videocompress']) {
  test(name + ' manual stop does not publish a partial clip as success', async () => {
    const f = fixture(name), job = f.run();
    await new Promise(resolve => setImmediate(resolve));
    f.context.video.currentTime = 0.25; f.cancel(); await job;
    assert.equal(f.context.made, null);
    assert.equal(f.displayed.length, 0);
    assert.equal(f.context.saveBtn.disabled, true);
    assert.ok(f.messages.includes(name + '.say.cancelled'));
    assert.equal(f.context.runBtn.disabled, false);
  });

  test(name + ' successful completion still offers its recorded result', async () => {
    const f = fixture(name), job = f.run();
    await new Promise(resolve => setImmediate(resolve));
    f.finish(); await job;
    assert.equal(f.displayed.length, 1);
    assert.equal(f.context.saveBtn.disabled, false);
    assert.ok(f.messages.includes(name + '.say.done'));
  });

  test(name + ' both stop paths release every captured track and progress timer', async () => {
    for (const cancelled of [true, false]) {
      for (const withAudio of [true, false]) {
        const f = fixture(name);
        f.context.$(name === 'videotrim' ? '#vtAudio' : '#vcAudio').checked = withAudio;
        const job = f.run();
        await new Promise(resolve => setImmediate(resolve));
        if (cancelled) f.cancel(); else f.finish();
        await job;
        assert.ok(f.tracks.length > 0);
        assert.ok(f.tracks.every(track => track.stopped));
        assert.equal(f.intervals.size, 0);
      }
    }
  });
}
