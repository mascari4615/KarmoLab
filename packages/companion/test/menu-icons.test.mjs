import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { icon } from '../assets/icons.js';

/**
 * 메뉴 아이콘은 icons.js 에 든 것만 그려짐. 없는 이름이면 버튼이 빈 칸으로 보임 (조용히 실패).
 * face.html 의 data-icon 과 원형 켜고 끄기 목록의 icon 이름이 모두 있어야 함 (2026-11-03)
 */
test('face.html 이 쓰는 메뉴 아이콘이 모두 icons.js 에 있다', () => {
  const face = readFileSync(new URL('../assets/face.html', import.meta.url), 'utf8');
  const names = new Set([
    ...[...face.matchAll(/data-icon="([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...face.matchAll(/\bicon: '([a-z0-9-]+)'/g)].map((m) => m[1]),
  ]);
  assert.ok(names.size >= 15, `찾은 아이콘 이름이 너무 적다 (${names.size}). 찾는 식이 깨졌을 수 있음`);
  const missing = [...names].filter((n) => icon(n) === '');
  assert.deepEqual(missing, [], `icons.js 에 없는 아이콘: ${missing.join(', ')}`);
});

test('없는 이름은 빈 문자열, 있는 이름은 svg', () => {
  assert.equal(icon('없는-아이콘'), '');
  assert.match(icon('ear'), /^<svg [^>]*viewBox="0 0 24 24"/);
});
