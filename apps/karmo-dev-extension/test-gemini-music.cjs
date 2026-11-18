const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, 'gemini-music.js'), 'utf8');

test('music request follows fixed actions and returns a single matching download', async () => {
  const actions = [];
  let onCreated;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); if (args[0] === 'download') onCreated({ id: 42 }); return [{ result: { ok: true, downloadUrl: 'blob:https://gemini.google.com/123' } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123' }) },
    downloads: { onCreated: { addListener: (fn) => { onCreated = fn; }, removeListener: () => { onCreated = null; } }, search: async () => [{ state: 'complete', filename: 'C:/Users/test/Downloads/song.mp3', referrer: '', url: 'blob:https://gemini.google.com/123', fileSize: 1200 }] },
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

test('music result selects only the exact clicked blob when downloads overlap', async () => {
  let listener;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { if (args[0] === 'download') { listener({ id: 1 }); listener({ id: 2 }); } return [{ result: { ok: true, downloadUrl: 'blob:https://gemini.google.com/expected' } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123' }) },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener: () => {} }, search: async ({ id }) => [{ state: 'complete', filename: 'song.mp3', url: id === 1 ? 'blob:https://gemini.google.com/other' : 'blob:https://gemini.google.com/expected' }] },
  };
  const context = vm.createContext({ chrome, Date, URL, setTimeout });
  vm.runInContext(source, context);
  const result = await context.geminiMusic(9, 'piano');
  assert.equal(result.filename, 'song.mp3');
});

test('official download click captures the same tab blob and restores the original method', async () => {
  let listener;
  function Element() {}
  Element.prototype.click = function () { listener({ id: 7 }); };
  function Anchor() { this.href = 'blob:https://gemini.google.com/from-page'; }
  Object.setPrototypeOf(Anchor.prototype, Element.prototype);
  Anchor.prototype.hasAttribute = name => name === 'download';
  const original = Anchor.prototype.click;
  const option = { getAttribute: () => '오디오만', innerText: '', click: () => new Anchor().click() };
  const chrome = {
    scripting: { executeScript: async ({ func, args, world }) => {
      if (args[0] !== 'download') return [{ result: { ok: true } }];
      assert.equal(world, 'MAIN');
      return [{ result: await func(...args) }];
    } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123' }) },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener: () => {} }, search: async () => [{ state: 'complete', filename: 'song.mp3', url: 'blob:https://gemini.google.com/from-page' }] },
  };
  const document = { querySelectorAll: () => [option] };
  const context = vm.createContext({ chrome, document, location: { hostname: 'gemini.google.com', origin: 'https://gemini.google.com' }, HTMLAnchorElement: Anchor, Date, URL, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  const result = await context.geminiMusic(9, 'piano');
  assert.equal(result.filename, 'song.mp3');
  assert.equal(Anchor.prototype.click, original);
  assert.equal(Object.hasOwn(Anchor.prototype, 'click'), false);
});
