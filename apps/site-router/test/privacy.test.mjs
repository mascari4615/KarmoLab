// mascari4615.com/privacy 는 방침 한 장, 안내 장에는 그 링크 없음
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { LINKS } from '../src/landing.mjs';

test('apex /privacy 는 방침 한 장, noindex', async () => {
  const res = await worker.fetch(new Request('https://mascari4615.com/privacy'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-site-router'), 'privacy');
  const html = await res.text();
  assert.match(html, /데이터를 저장하지 않습니다/);
  assert.match(html, /noindex/);
});

test('안내 장에는 privacy 링크가 없다 (잘 안 보이는 곳)', async () => {
  assert.ok(!LINKS.some((l) => l.href.includes('privacy')));
  const res = await worker.fetch(new Request('https://mascari4615.com/'), {});
  assert.doesNotMatch(await res.text(), /privacy/);
});
