import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CSP_CONTENT } from './lib/head-security.mjs';

/* Dash 장 CSP 와 인라인 스크립트 지문 대조. 어긋나면 그 스크립트 차단, 그리기 전 테마 누락.
   출처 목록 정본: memo projects/dash/apps/dash.md 보안 헤더 절 */
const html = readFileSync(new URL('../dash/index.html', import.meta.url), 'utf8').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
const metas = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)">/g)].map((m) => m[1]);
const csp = metas[0] || '';
const directive = (name) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || '').split(/\s+/).slice(1);

test('CSP meta 가 하나이고 사이트 공통 세 줄을 품는다', () => {
  assert.equal(metas.length, 1);
  assert.ok(csp.includes(CSP_CONTENT), 'lib/head-security.mjs CSP_CONTENT');
  assert.ok(html.indexOf('http-equiv="Content-Security-Policy"') < html.indexOf('<script'), 'CSP 는 첫 스크립트보다 앞');
});

test('인라인 스크립트마다 지문이 script-src 에 있다', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/type="application\/ld\+json"/.test(m[1]));
  assert.ok(inline.length > 0);
  for (const m of inline) {
    const hash = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
    assert.ok(directive('script-src').includes(hash), `script-src 에 ${hash} 없음`);
  }
  assert.ok(!directive('script-src').includes("'unsafe-inline'"));
  assert.ok(!directive('script-src').includes("'unsafe-eval'"));
});

test('기본은 self, 이벤트 핸들러 속성 없음', () => {
  assert.deepEqual(directive('default-src'), ["'self'"]);
  assert.equal(/\son[a-z]+="/i.test(html), false);
});

test('번들이 부르는 바깥 API 가 connect-src 에 있다', () => {
  for (const o of ['https://api.github.com', 'https://mydash-relay.mascari4615.com', 'https://bot.mascari4615.com', 'https://laptop.mascari4615.com', 'https://www.googleapis.com', 'https://tasks.googleapis.com']) {
    assert.ok(directive('connect-src').includes(o), o);
  }
});
