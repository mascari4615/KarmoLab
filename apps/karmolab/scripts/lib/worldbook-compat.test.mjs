import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldbookCompat } from './worldbook-compat.mjs';

const book = (kinds, docs) => ({ kinds: kinds.map((id) => ({ id })), docs });

test('종류가 사라지면 실패, 허용하면 경고', () => {
  const prev = book(['char', 'place'], [{ id: 'char/yon', title: '욘' }, { id: 'place/a', title: 'a' }]);
  const next = book(['char'], [{ id: 'char/yon', title: '욘' }]);
  const r = worldbookCompat(prev, next);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /place/);
  assert.match(r.notes.join('|'), /사라진 문서 1개/);
  assert.equal(worldbookCompat(prev, next, { allowDrop: true }).problems.length, 0);
});

test('필드 소멸은 경고, 그대로면 조용', () => {
  const prev = book(['char'], [{ id: 'char/yon', title: '욘', summary: 's' }]);
  const next = book(['char'], [{ id: 'char/yon', title: '욘' }]);
  assert.deepEqual(worldbookCompat(prev, next).notes, ['모든 문서에서 사라진 필드: summary']);
  assert.deepEqual(worldbookCompat(prev, prev), { problems: [], notes: [] });
});
