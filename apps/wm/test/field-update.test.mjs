import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,paint} from '../src/terrain.mjs';
import {createFields} from '../src/fields.mjs';

test('붓질 행만 갱신한 필드가 전체 재계산과 같고 항성 변경은 전체에 반영',()=>{
  const world=createWorld({original:true}),cached=createFields();cached.update(world);
  for(const [u,v,tool] of [[.999,.4,'raise'],[.01,.01,'lower'],[.4,.5,'forest']]){
    paint(world,u,v,tool,.035,.09);
    const updated=cached.update(world),reference=createFields(),all=reference.update(world);
    assert.deepEqual(updated.elevation.image.data,all.elevation.image.data);assert.deepEqual(updated.colors.image.data,all.colors.image.data);reference.dispose();
  }
  world.sunU=.75;const updated=cached.update(world),reference=createFields(),all=reference.update(world);
  assert.deepEqual(updated.colors.image.data,all.colors.image.data);cached.dispose();reference.dispose();
});

test('샘플 수동 생물군계 칠하기가 기후 복원용 자연색 필드를 바꾸지 않음',()=>{
  const world=createWorld({blank:true,seed:8147});world.terrainSource='alpine-v1';world.heights.fill(.02);world.biomes.fill(0);
  const fields=createFields(),before=fields.update(world),expected=before.automatic.image.data.slice(),natural=before.colors.image.data.slice();
  for(let i=0;i<natural.length;i++)if(i%4!==3)assert.equal(expected[i],natural[i]);
  paint(world,.22,.4,'desert',.03,.1);
  const after=fields.update(world);
  assert.notDeepEqual(after.colors.image.data,natural);
  assert.deepEqual(after.automatic.image.data,expected);
  fields.dispose();
});
