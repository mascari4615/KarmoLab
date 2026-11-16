import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(new URL('../../karmolab/package.json', import.meta.url))('jsdom');
const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Embed: 글 작성자와 공개 그림 메타만, 외부와 위험 주소 제외', () => {
  for (const [image, expected] of [['//ac.arca.live/a.webp', 'https://ac.arca.live/a.webp'], ['https://evil.test/a.jpg', ''], ['data:image/png;base64,xx', '']]) {
    const dom = new JSDOM(`<meta property="og:image" content="${image}"><div class="article-head"><div class="user-info"><span data-filter="작성자#42"></span></div></div>`, { url: 'https://arca.live/b/example/1', runScripts: 'outside-only' });
    dom.window.eval(read('arca-embed.js'));
    const embed = dom.window.readArcaEmbed();
    assert.equal(embed.author, '작성자#42'); assert.equal(embed.image, expected);
    dom.window.close();
  }
});

test('종료된 Dev 아카 읽기는 저장소와 사이트 접근 없이 거부', async () => {
  const ctx = { chrome: { storage: { local: { get: () => assert.fail('No storage access') } } }, openWorkTab: () => assert.fail('No site access') };
  vm.createContext(ctx);
  const code = read('background.js');
  vm.runInContext(code.slice(code.indexOf('function dispatchExt(')), ctx);
  for (const type of ['arca.embed.read', 'arca.liked.read', 'arca.transfer.prepare']) {
    const result = await new Promise(resolve => ctx.dispatchExt({ type }, {}, resolve));
    assert.equal(result.ok, false); assert.match(result.error, /KarmoLab/);
  }
});

test('Embed: DOM 준비 즉시 읽기, 리소스 완료와 3초 대기 제외', async () => {
  const url = 'https://arca.live/b/example/1';
  let polls = 0;
  let now = 0;
  let closed = false;
  const ctx = { Date: { now: () => now }, Promise,
    location: { href: 'about:blank' }, document: { readyState: 'loading' },
    setTimeout: (resolve, ms) => { now += ms; resolve(); },
    within: (_ms, _label, promise) => promise,
    openWorkTab: async () => ({ id: 7 }), closeWorkTab: async () => { closed = true; },
    waitLoaded: () => { throw new Error('resource-complete wait must not run'); },
  };
  ctx.chrome = { scripting: { executeScript: async (options) => {
    assert.equal(options.injectImmediately, true);
    if (options.files) return [];
    if (options.args[0] === url) {
      polls++;
      if (polls >= 2) ctx.location.href = url;
      if (polls >= 3) ctx.document.readyState = 'interactive';
      return [{ result: options.func(url) }];
    }
    return [{ result: { author: 'a', image: 'https://ac.arca.live/a.webp' } }];
  } } };
  vm.createContext(ctx);
  const code = read('background.js');
  vm.runInContext(code.slice(code.indexOf('async function runInTab('), code.indexOf('async function youtubeRemove(')), ctx);
  assert.equal((await ctx.runInTab(url, 'arca-embed.js', 'readArcaEmbed', undefined, 'article-dom')).author, 'a');
  assert.equal(ctx.document.readyState, 'interactive');
  assert.equal(now, 200);
  assert.equal(closed, true);
});

test('Embed: 잘못된 페이지 DOM은 읽지 않고 시간 초과 뒤 탭 회수', async () => {
  let now = 0;
  let closed = false;
  const ctx = { Date: { now: () => now }, Promise, setTimeout: (resolve, ms) => { now += ms; resolve(); },
    within: (_ms, _label, promise) => promise,
    openWorkTab: async () => ({ id: 7 }), closeWorkTab: async () => { closed = true; },
    chrome: { scripting: { executeScript: async () => [{ result: false }] } },
  };
  vm.createContext(ctx);
  const code = read('background.js');
  vm.runInContext(code.slice(code.indexOf('async function runInTab('), code.indexOf('async function youtubeRemove(')), ctx);
  await assert.rejects(ctx.runInTab('https://arca.live/b/example/1', 'arca-embed.js', 'readArcaEmbed', undefined, 'article-dom'), /DOM 준비 시간 초과/);
  assert.equal(closed, true);
});
