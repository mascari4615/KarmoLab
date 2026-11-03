import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * 본체 (face.html) 와 분신 (pet.js) 은 같은 물리를 따로 갖고 있음. 한쪽만 고치면 분신이 본체와
 * 다르게 떨어지고 걸음이 미끄러짐. 값이 어긋나면 실패 (2026-11-03, 중복 통합 전까지의 가드)
 */
test('본체와 분신의 중력, 발 보정 값이 같다 (걷기는 surfaces.js 공용)', () => {
  const pet = readFileSync(new URL('../assets/pet.js', import.meta.url), 'utf8');
  const face = readFileSync(new URL('../assets/face.html', import.meta.url), 'utf8');
  const read = (src, name, prefix) => {
    const m = new RegExp(`${prefix}${name} = ([0-9.]+)`).exec(src);
    assert.notEqual(m, null, `${name} 을 못 찾음`);
    return Number(m[1]);
  };
  for (const name of ['GRAVITY_PX', 'FEET_BIAS']) {
    assert.equal(read(face, name, 'const '), read(pet, name, 'export const '), `${name} 이 본체와 분신에서 다르다`);
  }
});
