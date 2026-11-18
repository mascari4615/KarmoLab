const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, 'gemini-music.js'), 'utf8');

test('music request follows fixed actions and returns a single matching download', async () => {
  const actions = [];
  let onCreated;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); if (args[0] === 'download') onCreated({ id: 42 }); return [{ result: { ok: true, downloadUrls: ['blob:https://gemini.google.com/123'] } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
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

test('recovery downloads the existing result without another prompt submission', async () => {
  const actions = []; let listener;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); if (args[0] === 'download') listener({ id: 4 }); return [{ result: { ok: true, downloadUrls: ['blob:https://gemini.google.com/result'] } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener: () => {} }, search: async () => [{ state: 'complete', filename: 'song.mp3', url: 'blob:https://gemini.google.com/result' }] },
  };
  const context = vm.createContext({ chrome, Date, URL, setTimeout });
  vm.runInContext(source, context);
  assert.equal((await context.geminiMusic(9, '', { resume: true, expectedUrl: 'https://gemini.google.com/app/123' })).filename, 'song.mp3');
  assert.deepEqual(actions, ['ready', 'download']);
});

test('music result selects only the exact clicked blob when downloads overlap', async () => {
  let listener;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { if (args[0] === 'download') { listener({ id: 1 }); listener({ id: 2 }); } return [{ result: { ok: true, downloadUrls: ['blob:https://gemini.google.com/expected'] } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
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
  Anchor.prototype.getAttribute = name => name === 'download' ? 'song.mp3' : null;
  const original = Anchor.prototype.click;
  const option = { getAttribute: () => '오디오만', innerText: '', click: () => new Anchor().click() };
  const chrome = {
    scripting: { executeScript: async ({ func, args, world }) => {
      if (args[0] !== 'download') return [{ result: { ok: true } }];
      assert.equal(world, 'MAIN');
      return [{ result: await func(...args) }];
    } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener: () => {} }, search: async () => [{ state: 'complete', filename: 'song.mp3', url: 'blob:https://gemini.google.com/from-page' }] },
  };
  const document = { querySelectorAll: () => [option], hasFocus: () => false };
  const fastTimeout = (fn, ms) => setTimeout(fn, ms === 10000 ? 5 : ms);
  const context = vm.createContext({ chrome, document, window: { addEventListener() {}, removeEventListener() {} }, location: { hostname: 'gemini.google.com', origin: 'https://gemini.google.com' }, HTMLAnchorElement: Anchor, Date, URL, setTimeout: fastTimeout, clearTimeout });
  vm.runInContext(source, context);
  const result = await context.geminiMusic(9, 'piano');
  assert.equal(result.filename, 'song.mp3');
  assert.equal(Anchor.prototype.click, original);
  assert.equal(Object.hasOwn(Anchor.prototype, 'click'), false);
});

test('blob creation in the task tab is matched and restored', async () => {
  let listener;
  class PageURL extends URL {}
  PageURL.createObjectURL = () => 'blob:https://gemini.google.com/created';
  const originalCreate = PageURL.createObjectURL;
  class Anchor { click() {} }
  const option = { getAttribute: () => '오디오만', innerText: '', click: () => { PageURL.createObjectURL({ type: 'audio/mpeg' }); listener({ id: 8 }); } };
  const chrome = {
    scripting: { executeScript: async ({ func, args }) => [{ result: args[0] === 'download' ? await func(...args) : { ok: true } }] },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener: () => {} }, search: async () => [{ state: 'complete', filename: 'song.mp3', url: 'blob:https://gemini.google.com/created' }] },
  };
  const fastTimeout = (fn, ms) => setTimeout(fn, ms === 10000 ? 5 : ms);
  const context = vm.createContext({ chrome, document: { querySelectorAll: () => [option], hasFocus: () => false }, window: { addEventListener() {}, removeEventListener() {} }, location: { hostname: 'gemini.google.com', origin: 'https://gemini.google.com' }, HTMLAnchorElement: Anchor, Date, URL: PageURL, setTimeout: fastTimeout, clearTimeout });
  vm.runInContext(source, context);
  assert.equal((await context.geminiMusic(9, 'piano')).filename, 'song.mp3');
  assert.equal(PageURL.createObjectURL, originalCreate);
});

test('download is not clicked while the task window is in use', async () => {
  let clicked = false;
  const option = { getAttribute: () => '오디오만', innerText: '', click: () => { clicked = true; } };
  const chrome = {
    scripting: { executeScript: async ({ func, args }) => [{ result: args[0] === 'download' ? await func(...args) : { ok: true } }] },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: true }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: () => {}, removeListener: () => {} } },
  };
  const context = vm.createContext({ chrome, document: { querySelectorAll: () => [option], hasFocus: () => true }, location: { hostname: 'gemini.google.com', origin: 'https://gemini.google.com' }, Date, URL, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiMusic(9, 'piano'), /사용 중/);
  assert.equal(clicked, false);
});

test('a focus change during download prevents automatic acceptance', async () => {
  let onCreated, onFocus;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { if (args[0] === 'download') { onFocus(1); onCreated({ id: 4 }); } return [{ result: { ok: true, downloadUrls: ['blob:https://gemini.google.com/result'] } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener: fn => { onFocus = fn; }, removeListener: () => {} } },
    downloads: { onCreated: { addListener: fn => { onCreated = fn; }, removeListener: () => {} }, search: async () => [{ state: 'complete', filename: 'song.mp3', url: 'blob:https://gemini.google.com/result' }] },
  };
  const context = vm.createContext({ chrome, Date, URL, setTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiMusic(9, 'piano'), /사용 중/);
});

test('ambiguous blobs are rejected and original browser methods are restored', async () => {
  let n = 0;
  class PageURL extends URL {}
  PageURL.createObjectURL = () => `blob:https://gemini.google.com/${++n}`;
  const originalCreate = PageURL.createObjectURL;
  class Anchor { click() {} }
  const option = { getAttribute: () => '오디오만', innerText: '', click: () => { PageURL.createObjectURL({ type: 'audio/mpeg' }); PageURL.createObjectURL({ type: 'audio/mpeg' }); } };
  const chrome = {
    scripting: { executeScript: async ({ func, args }) => [{ result: args[0] === 'download' ? await func(...args) : { ok: true } }] },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: () => {}, removeListener: () => {} } },
  };
  const fastTimeout = (fn, ms) => setTimeout(fn, ms === 10000 ? 5 : ms);
  const context = vm.createContext({ chrome, document: { querySelectorAll: () => [option], hasFocus: () => false }, window: { addEventListener() {}, removeEventListener() {} }, location: { hostname: 'gemini.google.com', origin: 'https://gemini.google.com' }, HTMLAnchorElement: Anchor, Date, URL: PageURL, setTimeout: fastTimeout, clearTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiMusic(9, 'piano'), /연결을 확인하지 못함/);
  assert.equal(PageURL.createObjectURL, originalCreate);
});
