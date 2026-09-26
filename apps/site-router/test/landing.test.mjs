// 안내 장 앵커는 공개 주소만. Dash, Files 는 커맨드 일치 뒤.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { LINKS, MINE, COMMAND } from '../src/landing.mjs';

test('안내 장 앵커는 공개 주소만. Dash 와 Files 는 커맨드 뒤', async () => {
  assert.equal(COMMAND, 'karmo');
  assert.deepEqual(LINKS.map((l) => l.name), ['KarmoLab', 'Blog', 'GitHub']);
  assert.deepEqual(MINE.map((l) => l.name), ['Dash', 'Files']);
  const res = await worker.fetch(new Request('https://mascari4615.com/'), {});
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const l of LINKS) assert.match(html, new RegExp(`<a href="${l.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">${l.name}</a>`));
  assert.doesNotMatch(html, /<a [^>]*href="https:\/\/dash\.mascari4615\.com\//);
  assert.doesNotMatch(html, /<a [^>]*href="https:\/\/files\.mascari4615\.com\//);
  assert.doesNotMatch(html, /커멘트/);
  assert.match(html, /aria-label="커맨드"/);
  assert.match(html, /name="command"/);
  assert.match(html, /var COMMAND="karmo"/);
  assert.match(html, /#mine a\{/);
  assert.match(html, /https:\/\/dash\.mascari4615\.com\//);
  assert.match(html, /https:\/\/files\.mascari4615\.com\//);
});
