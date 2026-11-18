const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, 'gemini-music.js'), 'utf8');

test('music request follows fixed actions and returns a single matching download', async () => {
  const actions = [];
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); return [{ result: { ok: true } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123' }) },
    downloads: { search: async () => [{ filename: 'C:/Users/test/Downloads/song.mp3', referrer: 'https://gemini.google.com/app/123', fileSize: 1200 }] },
  };
  const context = vm.createContext({ chrome, Date, URL, setTimeout, InputEvent: function () {} });
  vm.runInContext(source, context);
  const result = await context.geminiMusic(9, 'A piano tune');
  assert.equal(result.ok, true);
  assert.equal(result.filename, 'C:/Users/test/Downloads/song.mp3');
  assert.deepEqual(actions, ['menu', 'mode', 'submit', 'send', 'ready', 'download']);
});

test('empty prompt is rejected before using browser', async () => {
  const context = vm.createContext({ chrome: {}, Date, setTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiMusic(1, ' '), /음악 설명/);
});
