const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, 'gemini-video.js'), 'utf8');

test('video request uses Gemini controls and a download from the same conversation', async () => {
  const actions = [];
  let onCreated;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); if (args[0] === 'download') onCreated({ id: 42 }); return [{ result: { ok: true, downloadUrl: 'blob:https://gemini.google.com/123' } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123' }) },
    downloads: { onCreated: { addListener: (fn) => { onCreated = fn; }, removeListener: () => { onCreated = null; } }, search: async () => [{ state: 'complete', filename: 'C:/Users/test/Downloads/video.mp4', url: 'blob:https://gemini.google.com/123', fileSize: 1200 }] },
  };
  const context = vm.createContext({ chrome, Date, URL, setTimeout, InputEvent: function () {} });
  vm.runInContext(source, context);
  const result = await context.geminiVideo(9, 'A paper boat');
  assert.equal(result.ok, true);
  assert.equal(result.filename, 'C:/Users/test/Downloads/video.mp4');
  assert.deepEqual(actions, ['menu', 'mode', 'submit', 'send', 'ready', 'download']);
});

test('empty video prompt is rejected', async () => {
  const context = vm.createContext({ chrome: {}, Date, URL, setTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiVideo(1, ' '), /영상 설명/);
});
