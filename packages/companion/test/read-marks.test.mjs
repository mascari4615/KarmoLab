import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadMarks } from '../dist/read-marks.js';

const H = 3_600_000;

test('원본이 잠깐 비어도 읽음 유지, 이틀 안 보이면 지움', () => {
  const r = new ReadMarks(null, 0);
  r.set('일정:a', true, 0);
  r.touch(new Set(), 1 * H);
  assert.equal(r.has('일정:a'), true);
  r.touch(new Set(['일정:a']), 40 * H);
  r.touch(new Set(), 80 * H);
  assert.equal(r.has('일정:a'), true);
  r.touch(new Set(), 89 * H);
  assert.equal(r.has('일정:a'), false);
});

test('옛 배열 형식과 새 객체 형식을 읽고 객체로 저장', () => {
  const old = new ReadMarks(['x', 3], 5);
  assert.deepEqual(old.toJSON(), { x: 5 });
  const back = new ReadMarks(JSON.parse(JSON.stringify(old)), 99);
  assert.deepEqual(back.toJSON(), { x: 5 });
  back.set('x', false, 100);
  assert.deepEqual(back.ids(), []);
});
