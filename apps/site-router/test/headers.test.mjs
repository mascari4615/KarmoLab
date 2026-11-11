// 보안 헤더. 여기서 깨지면 dash 가 남의 장에 끼워지거나 평문 HTTP 로 열림
import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders, httpsRedirect } from '../src/headers.mjs';
import worker from '../worker.mjs';

test('모든 호스트에 HSTS', () => {
  for (const kind of ['lab', 'dash', 'blog', 'home']) {
    assert.match(securityHeaders(kind)['strict-transport-security'], /^max-age=\d{8,}/);
  }
});

test('dash 만 끼워 넣기 금지, lab 은 KarmoGraph 삽입 때문에 열어 둔다', () => {
  assert.equal(securityHeaders('dash')['content-security-policy'], "frame-ancestors 'none'");
  assert.equal(securityHeaders('dash')['x-frame-options'], 'DENY');
  assert.ok(!securityHeaders('lab')['content-security-policy'].includes('frame-ancestors'));
  assert.equal(securityHeaders('lab')['x-frame-options'], undefined);
});

test('lab 은 바깥 스크립트 출처를 잠그고 연결은 열어 둔다', () => {
  const csp = securityHeaders('lab')['content-security-policy'];
  assert.match(csp, /script-src 'self' /);
  assert.ok(!csp.includes('connect-src'));
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.equal(securityHeaders('blog')['content-security-policy'], undefined);
});

test('http 는 같은 주소의 https 로', () => {
  assert.equal(httpsRedirect(new URL('http://dash.mascari4615.com/a?b=1')), 'https://dash.mascari4615.com/a?b=1');
  assert.equal(httpsRedirect(new URL('https://dash.mascari4615.com/')), null);
});

test('Worker 가 원본 응답에 헤더를 얹고 http 는 돌려보낸다', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/html' } });
  const res = await worker.fetch(new Request('https://dash.mascari4615.com/'), {});
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('strict-transport-security'), /max-age/);
  const lab = await worker.fetch(new Request('https://lab.mascari4615.com/'), {});
  assert.equal(lab.headers.get('x-frame-options'), null);
  assert.match(lab.headers.get('strict-transport-security'), /max-age/);
  const plain = await worker.fetch(new Request('http://lab.mascari4615.com/t/x/?q=1'), {});
  assert.equal(plain.status, 301);
  assert.equal(plain.headers.get('location'), 'https://lab.mascari4615.com/t/x/?q=1');
  const home = await worker.fetch(new Request('https://mascari4615.com/'), {});
  assert.match(home.headers.get('strict-transport-security'), /max-age/);
});
