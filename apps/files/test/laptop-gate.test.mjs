import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laptopGateFor } from '../src/laptop-gate.mjs';

const APP = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app.mjs');

test('429 는 연결 실패가 아니라 입력창, 기다릴 초를 말한다', () => {
  const g = laptopGateFor(429, '16');
  assert.ok(g);
  assert.match(g.message, /16초 뒤에/);
  assert.doesNotMatch(g.message, /연결할 수 없/);
});

test('Retry-After 가 없거나 이상해도 입력창', () => {
  assert.match(laptopGateFor(429, null).message, /잠시 뒤에/);
  assert.match(laptopGateFor(429, 'abc').message, /잠시 뒤에/);
});

test('401, 403 은 입력창, 200 과 500 은 거절 아님', () => {
  assert.ok(laptopGateFor(401, null));
  assert.ok(laptopGateFor(403, null));
  assert.equal(laptopGateFor(200, null), null);
  assert.equal(laptopGateFor(500, null), null);
});

test('목록, 빌드, 올리기가 모두 같은 판정을 쓴다', async () => {
  const src = await readFile(APP, 'utf8');
  const uses = src.match(/laptopGateFor\(/g) || [];
  assert.ok(uses.length >= 3, 'laptopGateFor 호출 ' + uses.length + '곳');
  assert.doesNotMatch(src, /status === 401 \|\| \w+\.status === 403/, '401, 403 만 보는 옛 판정이 남음');
});
