import assert from 'node:assert/strict';
import test from 'node:test';

import { groupsByMaterial } from '../assets/mesh-groups.js';

test('같은 재질 그룹을 하나로 모으고 재질 안의 순서는 그대로', () => {
  const index = new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const groups = [
    { start: 0, count: 3, materialIndex: 0 },
    { start: 3, count: 3, materialIndex: 1 },
    { start: 6, count: 3, materialIndex: 0 },
    { start: 9, count: 3, materialIndex: 1 },
  ];
  const r = groupsByMaterial(index, groups);
  assert.deepEqual([...r.index], [0, 1, 2, 6, 7, 8, 3, 4, 5, 9, 10, 11]);
  assert.deepEqual(r.groups, [
    { start: 0, count: 6, materialIndex: 0 },
    { start: 6, count: 6, materialIndex: 1 },
  ]);
  assert.ok(r.index instanceof Uint16Array);
});

test('재질마다 그룹이 하나뿐이면 손대지 않음', () => {
  const index = new Uint32Array([0, 1, 2, 3, 4, 5]);
  assert.equal(groupsByMaterial(index, [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }]), null);
  assert.equal(groupsByMaterial(index, [{ start: 0, count: 6, materialIndex: 0 }]), null);
});

test('그룹 밖 삼각형은 원래도 안 그려지므로 빠짐', () => {
  const index = new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const r = groupsByMaterial(index, [{ start: 0, count: 3, materialIndex: 0 }, { start: 6, count: 3, materialIndex: 0 }]);
  assert.deepEqual([...r.index], [0, 1, 2, 6, 7, 8]);
  assert.deepEqual(r.groups, [{ start: 0, count: 6, materialIndex: 0 }]);
});
