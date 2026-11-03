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

test('걸어갈 자리는 다른 몸 바로 옆을 피한다', async () => {
  const { spreadTarget } = await import('../assets/surfaces.js');
  // 멀면 그대로
  assert.equal(spreadTarget(500, [100, 900], 100, 1800), 500);
  // 본체 (520) 바로 옆이면 가장 덜 붙는 자리로
  const moved = spreadTarget(500, [520, 900], 100, 1800);
  assert.ok(Math.min(Math.abs(moved - 520), Math.abs(moved - 900)) >= 110, `여전히 붙음: ${moved}`);
  assert.ok(moved >= 100 && moved <= 1800, `범위 밖: ${moved}`);
  // 자리가 꽉 차면 그래도 가장 넓은 틈
  const tight = spreadTarget(150, [100, 200, 300], 100, 300);
  assert.ok(tight >= 100 && tight <= 300);
  // 다른 몸이 없으면 그대로
  assert.equal(spreadTarget(640, [], 100, 1800), 640);
});

test('던지는 속도: 빠르고 막 놓았으면 던지고, 느리거나 멈췄다 놓으면 안 던짐', async () => {
  const { throwVelocity } = await import('../assets/surfaces.js');
  // 0.1초에 120px 오른쪽 = 1200 px/s
  const fast = [[1000, 0, 0], [1100, 120, 0]];
  assert.deepEqual(throwVelocity(fast, 1120), { vx: 1200, vy: 0 });
  // 느림 (0.1초에 20px = 200 px/s)
  assert.equal(throwVelocity([[1000, 0, 0], [1100, 20, 0]], 1110), null);
  // 빠르게 움직였어도 멈췄다 놓음 (마지막 움직임에서 80ms 넘음)
  assert.equal(throwVelocity(fast, 1200), null);
  // 너무 빠르면 2500 으로 자름
  assert.deepEqual(throwVelocity([[1000, 0, 0], [1030, 300, -300]], 1040), { vx: 2500, vy: -2500 });
  // 표본 하나면 없음
  assert.equal(throwVelocity([[1000, 0, 0]], 1000), null);
});

test('걷기 속도는 몸 키에 비례하고 뜀이 더 빠르다', async () => {
  const { walkSpeed } = await import('../assets/surfaces.js');
  // 키 300px 이면 걸음 0.8 x 300 / 1.33 로 180.45, 뜀 1.1 x 300 / 0.93 으로 354.84
  assert.ok(Math.abs(walkSpeed(300, false) - 180.45) < 0.1);
  assert.ok(Math.abs(walkSpeed(300, true) - 354.84) < 0.1);
  assert.equal(walkSpeed(600, false), walkSpeed(300, false) * 2);
});
