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

test('Embed 수집: 계정 번호 검증, 중복 요청과 캐시 재사용', async () => {
  let calls = 0;
  const ctx = { Date, Map, Promise, runInTab: async () => { calls++; return { author: '새닉#42', image: 'https://ac.arca.live/a.webp' }; } };
  vm.createContext(ctx);
  const code = read('background.js');
  vm.runInContext(code.slice(code.indexOf('const embedPending'), code.indexOf('/* 확장 페이지와')), ctx);
  await Promise.all([ctx.readFollowEmbed('https://arca.live/b/example/1', '옛닉#42'), ctx.readFollowEmbed('https://arca.live/b/example/1', '옛닉#42')]);
  assert.equal(calls, 1);
  await ctx.readFollowEmbed('https://arca.live/b/example/1', '옛닉#42');
  assert.equal(calls, 1);
  await assert.rejects(ctx.readFollowEmbed('https://arca.live/b/example/2', '옛닉#43'), /글이 아닙니다/);
});

test('실제 Embed 분기: 외부 글, 비팔로우 작성자 거부', async () => {
  const ctx = { URL, chrome: { storage: { local: { get: async () => ({ likelist: { arca: { a: {} } } }) } } }, readFollowEmbed: async () => ({ image: '' }) };
  vm.createContext(ctx);
  const code = read('background.js');
  vm.runInContext(code.slice(code.indexOf('function dispatchExt(')), ctx);
  const call = (key, url) => new Promise((resolve) => ctx.dispatchExt({ type: 'arca.embed.read', key, url }, {}, resolve));
  assert.equal((await call('a', 'https://evil.test/b/x/1')).ok, false);
  assert.equal((await call('b', 'https://arca.live/b/x/1')).ok, false);
  assert.equal((await call('a', 'https://arca.live/b/x/1')).ok, true);
});
