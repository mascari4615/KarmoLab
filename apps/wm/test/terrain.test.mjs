import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, sampleHeight, sampleFilteredHeight, climate, paint, validateWorld, strokePoints } from '../src/terrain.mjs';
import { sourceLand, sourceMask } from '../src/source-coasts.mjs';

test('손그림 좌표의 북서쪽 숲과 동쪽 큰바다, 내해 섬을 보존', () => {
  assert.equal(sourceLand(.16, .1), true);
  assert.equal(sourceLand(.85, .45), false);
  assert.equal(sourceLand(.28, .54), true);
  const mask = sourceMask(256, 144);
  for (let y = 0; y < 144; y += 7) for (let x = 0; x < 256; x += 7) assert.equal(Boolean(mask[y * 256 + x]), sourceLand(x / 256, y / 143));
});
test('빠른 붓질은 경도 이음매의 짧은 경로로 이어짐', () => {
  const points = strokePoints([.98, .5], [.02, .5], .01);
  assert.ok(points.length > 2);
  assert.ok(points.every(([u]) => u > .97 || u < .03));
  const world = createWorld({ blank: true });
  for (const [u, v] of points) paint(world, u, v, 'raise', .01, .15);
  assert.ok(sampleHeight(world, 0, .5) > -.25);
  assert.equal(sampleHeight(world, .5, .5), -.25);
});

test('운도, 가마, 한울과 동주기자전 기본값 보존', () => {
  const world = createWorld({ original: true });
  assert.equal(world.name, '운도'); assert.equal(world.star, '가마'); assert.equal(world.moon, '한울'); assert.equal(world.tidalLocked, true);
  assert.ok(climate(world, world.sunU, world.sunV) > .99);
  assert.ok(climate(world, (world.sunU + .5) % 1, 1 - world.sunV) < -.99);
});
test('경도 이음매와 극점에서 높이 연속', () => {
  const world = createWorld({ original: true });
  for (let v = 0; v <= 1; v += .03) assert.ok(Math.abs(sampleHeight(world, 0, v) - sampleHeight(world, 1, v)) < 1e-10);
  for (let u = 0; u <= 1; u += .04) for (const v of [0, 1]) assert.equal(sampleHeight(world, u, v), sampleHeight(world, 0, v));
});
test('행성 보간은 이음매와 극점을 보존하며 데이터 범위를 넘지 않음', () => {
  const world=createWorld({original:true});
  const minimum=Math.min(...world.heights),maximum=Math.max(...world.heights);
  for(let u=0;u<=1;u+=.031){
    for(const v of [0,1])assert.equal(sampleFilteredHeight(world,u,v),sampleHeight(world,0,v));
    for(let v=0;v<=1;v+=.041){
      const h=sampleFilteredHeight(world,u,v);
      assert.ok(h>=minimum-1e-12&&h<=maximum+1e-12);
      assert.ok(Math.abs(h-sampleFilteredHeight(world,u+1,v))<1e-10);
    }
  }
});

test('경도 경계를 넘은 붓질이 양쪽에 적용되고 멀리 있는 지형은 유지', () => {
  const world = createWorld({ blank: true }); const distant = sampleHeight(world, .5, .5);
  paint(world, 0, .5, 'raise', .08, .2);
  assert.ok(sampleHeight(world, .01, .5) > -.25); assert.ok(sampleHeight(world, .99, .5) > -.25);
  assert.equal(sampleHeight(world, .5, .5), distant);
});
test('극점 붓질 이후에도 동일 극점 높이와 가져오기 유효성 유지', () => {
  const world = createWorld({ blank: true }); paint(world, .4, 0, 'raise', .08, .2);
  assert.doesNotThrow(() => validateWorld(world));
});
test('독립 행성 수정으로 원본 운도 변경 없음', () => {
  const original = createWorld({ original: true }), other = createWorld({ seed: 501 }); const before = JSON.stringify(original);
  paint(other, .5, .5, 'lower', .1, .3); assert.equal(JSON.stringify(original), before);
});
test('JSON 왕복으로 지형, 장소, 천체 설정 손실 없음', () => {
  const world = createWorld({ original: true }); paint(world, .4, .7, 'ice', .06, .1);
  assert.deepEqual(validateWorld(JSON.parse(JSON.stringify(world))), world);
});
test('손상된 높이, 중복 장소와 불연속 극점 파일 거부', () => {
  const world = createWorld({ original: true });
  const duplicate = structuredClone(world); duplicate.places.push(duplicate.places[0]); assert.throws(() => validateWorld(duplicate), /중복/);
  const corrupt = structuredClone(world); corrupt.heights[30] = null; assert.throws(() => validateWorld(corrupt), /손상/);
  const pole = structuredClone(world); pole.heights[0] += .01; assert.throws(() => validateWorld(pole), /극점/);
});
