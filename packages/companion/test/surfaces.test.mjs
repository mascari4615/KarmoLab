import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jumpTargets,
  jumpVelocity,
  landingSurface,
  standableSurfaces,
  supportAt,
} from '../assets/surfaces.js';

const win = (id, left, top, right, bottom) => ({ id, left, top, right, bottom });

test('앞쪽 창이 윗면을 덮은 부분은 서 있을 수 없다', () => {
  // 뒤 창 A 윗면(y 400) 일부를 앞 창 B(300~700, x 500~900)가 가림
  const surfaces = standableSurfaces([win('B', 500, 300, 900, 700), win('A', 100, 400, 1100, 800)]);
  const a = surfaces.filter((s) => s.id === 'A');
  assert.deepEqual(a.map((s) => [s.l, s.r]), [[100, 500], [900, 1100]], '덮인 가운데가 빠지고 양쪽 토막이 남아야 한다');
  assert.equal(surfaces.filter((s) => s.id === 'B').length, 1, '맨 앞 창 윗면은 통째로 남는다');
});

test('앞쪽 창이 윗면 높이를 지나지 않으면 덮지 않는다', () => {
  // 앞 창이 A 윗면(y 400)보다 아래에서 시작
  const surfaces = standableSurfaces([win('B', 500, 450, 900, 700), win('A', 100, 400, 1100, 800)]);
  assert.deepEqual(surfaces.filter((s) => s.id === 'A').map((s) => [s.l, s.r]), [[100, 1100]]);
});

test('화면 위쪽에 붙은 윗면과 너무 좁은 토막은 버린다', () => {
  const surfaces = standableSurfaces(
    [win('ok', 300, 500, 900, 800), win('narrow', 100, 500, 180, 800), win('top', 0, 20, 2000, 900)],
    { minTop: 340, minWidth: 120 },
  );
  assert.deepEqual(surfaces.map((s) => s.id), ['ok']);
});

test('받침면은 발 밑에서 가장 높은 면, 없으면 바닥', () => {
  const surfaces = [{ id: 'A', y: 600, l: 100, r: 500 }, { id: 'B', y: 800, l: 0, r: 2000 }];
  assert.equal(supportAt(surfaces, 1400, 300, 500).id, 'A', '발(500) 아래 가장 높은 면');
  assert.equal(supportAt(surfaces, 1400, 300, 700).id, 'B', 'A 는 이미 발보다 위라 B');
  assert.equal(supportAt(surfaces, 1400, 3000, 700).id, 'floor', '아무 면도 x 가 안 맞으면 바닥');
  assert.equal(supportAt(surfaces, 1400, 520, 590).id, 'A', '가장자리를 30px 벗어나도 선 것으로 본다');
  assert.equal(supportAt(surfaces, 1400, 560, 590).id, 'B', '30px 넘게 벗어나면 그 아래 면으로 떨어진다');
  assert.equal(supportAt(surfaces, 1400, 560, 900).id, 'floor', '발이 모든 면보다 아래면 바닥');
});

test('내려가며 지나간 면 중 가장 높은 면에 내린다', () => {
  const surfaces = [{ id: 'A', y: 600, l: 100, r: 500 }, { id: 'B', y: 650, l: 100, r: 500 }];
  assert.equal(landingSurface(surfaces, 1400, 300, 590, 700).id, 'A', '한 프레임에 둘 다 지나면 높은 쪽');
  assert.equal(landingSurface(surfaces, 1400, 300, 500, 580), null, '아직 안 닿음');
  assert.equal(landingSurface(surfaces, 1400, 900, 590, 700), null, 'x 가 면 밖');
  assert.equal(landingSurface(surfaces, 1400, 900, 1390, 1410).id, 'floor');
});

test('뛰어 오를 후보는 가깝고 적당히 높은 면만', () => {
  const surfaces = [
    { id: 'near', y: 700, l: 400, r: 900 },
    { id: 'tooHigh', y: 100, l: 400, r: 900 },
    { id: 'tooFar', y: 700, l: 2000, r: 2500 },
    { id: 'low', y: 990, l: 400, r: 900 },
    { id: 'self', y: 700, l: 0, r: 300 },
  ];
  const found = jumpTargets(surfaces, 500, 1000, 'self');
  assert.deepEqual(found.map((t) => t.surface.id), ['near']);
  assert.equal(found[0].landX, 500, '면 안이면 제자리 x 로 오른다');
});

test('뛰어오르는 속도로 실제로 그 면에 닿는다', () => {
  const g = 2600;
  const rise = 300;
  const run = 200;
  const { vx, vy, time } = jumpVelocity(rise, run, g);
  // 시간 time 뒤 높이와 가로 위치
  const y = vy * time + 0.5 * g * time * time; // 아래가 양수
  assert.ok(Math.abs(y - -rise) < 1, `도착 높이가 면 높이와 맞아야 한다: ${y}`);
  assert.ok(Math.abs(vx * time - run) < 1e-6);
  assert.ok(vy < 0, '위로 뛴다');
});
