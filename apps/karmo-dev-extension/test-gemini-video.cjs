const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, 'gemini-video.js'), 'utf8');

test('video request uses Gemini controls and a download from the same conversation', async () => {
  const actions = [];
  let onCreated;
  const chrome = {
    scripting: { executeScript: async ({ args }) => { actions.push(args[0]); if (args[0] === 'download') onCreated({ id: 42 }); return [{ result: { ok: true, downloadUrls: ['blob:https://gemini.google.com/123'] } }]; } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
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

test('a disabled Gemini video tool reports unavailability', async () => {
  const option = { disabled: true, getAttribute: () => '', innerText: '동영상 만들기', click() { throw new Error('disabled tool clicked'); } };
  const chrome = { scripting: { executeScript: async ({ func, args }) => [{ result: args[0] === 'menu' ? { ok: true } : await func(...args) }] } };
  const document = { querySelectorAll: () => [option] };
  const context = vm.createContext({ chrome, document, location: { hostname: 'gemini.google.com' }, Date, URL, setTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiVideo(1, 'paper boat'), /동영상 만들기를 사용할 수 없음/);
});

test('video tool disabled after menu click reports unavailability', async () => {
  const option = { disabled: false, getAttribute: name => name === 'aria-disabled' ? 'true' : '', innerText: '동영상 만들기' };
  const chrome = { scripting: { executeScript: async ({ func, args }) => [{ result: args[0] === 'submit' ? await func(...args) : { ok: true } }] } };
  const document = { querySelectorAll: () => [option] };
  const context = vm.createContext({ chrome, document, location: { hostname: 'gemini.google.com' }, Date, URL, setTimeout });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiVideo(1, 'paper boat'), /동영상 만들기를 사용할 수 없음/);
});

test('single worker video download is accepted after the quiet interval', async () => {
  let listener, now = 0;
  class FastDate extends Date { static now() { return now; } }
  const chrome = {
    scripting: { executeScript: async ({ args }) => {
      if (args[0] === 'download') { listener({ id: 1 }); now += 13000; }
      return [{ result: { ok: true, downloadUrls: [] } }];
    } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener() {} }, search: async () => [{ state: 'complete', filename: 'worker.mp4', url: 'blob:https://gemini.google.com/worker', mime: 'video/mp4' }] },
  };
  const context = vm.createContext({ chrome, Date: FastDate, URL, setTimeout });
  vm.runInContext(source, context);
  assert.equal((await context.geminiVideo(9, 'paper boat')).filename, 'worker.mp4');
});

test('overlapping worker video downloads are rejected', async () => {
  let listener, now = 0;
  class FastDate extends Date { static now() { return now; } }
  const chrome = {
    scripting: { executeScript: async ({ args }) => {
      if (args[0] === 'download') { listener({ id: 1 }); listener({ id: 2 }); now += 13000; }
      return [{ result: { ok: true, downloadUrls: [] } }];
    } },
    tabs: { get: async () => ({ url: 'https://gemini.google.com/app/123', windowId: 1 }) },
    windows: { get: async () => ({ focused: false }), onFocusChanged: { addListener() {}, removeListener() {} } },
    downloads: { onCreated: { addListener: fn => { listener = fn; }, removeListener() {} }, search: async () => [{ state: 'complete', filename: 'worker.mp4', url: 'blob:https://gemini.google.com/worker', mime: 'video/mp4' }] },
  };
  const context = vm.createContext({ chrome, Date: FastDate, URL, setTimeout: fn => { now += 60000; fn(); } });
  vm.runInContext(source, context);
  await assert.rejects(context.geminiVideo(9, 'paper boat'), /다운로드 확인 실패/);
});
