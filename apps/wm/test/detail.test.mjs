import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, paint, validateWorld } from '../src/terrain.mjs';
import { sampleDetail, generateDetail, sampleRenderedHeight } from '../src/detail.mjs';
import { intersectSurface } from '../src/surface-ray.mjs';

test('상세 지형은 경도 이음매와 극점에서 동일 높이',()=>{
  const world=createWorld({original:true});
  for(const v of [0,.1,.4,.8,1])assert.ok(Math.abs(sampleDetail(world,0,v).height-sampleDetail(world,1,v).height)<1e-10);
  for(const v of [0,1])assert.ok(Math.abs(sampleDetail(world,.1,v).height-sampleDetail(world,.8,v).height)<1e-10);
});
test('기본 격자보다 작은 붓질은 저장 후에도 표면에 남고 다른 위치는 보존',()=>{
  const world=createWorld({blank:true}),base=world.heights.slice();
  assert.equal(paint(world,.5,.5,'raise',.0004,.1),true);
  assert.deepEqual(world.heights,base);
  const restored=validateWorld(JSON.parse(JSON.stringify(world)));
  assert.ok(sampleDetail(restored,.5,.5).height>-.151);
  assert.ok(Math.abs(sampleDetail(restored,.51,.5).height+.25)<1e-12);
  restored.detailStrokes[0].radius=NaN;assert.throws(()=>validateWorld(restored));
});
test('상세 타일 숫자 높이가 같은 위치의 편집 결과와 일치',()=>{
  const world=createWorld({blank:true});paint(world,.5,.5,'raise',.001,.2);
  const pixels=generateDetail(world,[.5,.5,.004,.004],33),i=(16*33+16)*4;
  const height=pixels[i];
  assert.ok(Math.abs(height-sampleDetail(world,.5,.5).height)<.00004);
});

test('표시 타일과 피킹 높이는 같은 보간을 사용하고 경계는 원래 표면과 연결',()=>{
  const world=createWorld({blank:true}),size=33,bounds=[.5,.5,.01,.01];paint(world,.5,.5,'raise',.001,.3);
  const tile={bounds,size,pixels:generateDetail(world,bounds,size)};
  assert.ok(Math.abs(sampleRenderedHeight(world,tile,.5,.5)-tile.pixels[(16*size+16)*4])<1e-7);
  assert.ok(Math.abs(sampleRenderedHeight(world,tile,.495,.5)+.25)<1e-10);
  assert.ok(Math.abs(sampleRenderedHeight(world,null,.5,.5)+.25)<1e-10);
});
test('상세 산에서 비스듬한 광선은 카메라 앞의 첫 표면을 선택',()=>{
  const world={seaLevel:0,relief:3},origin=[1.027,0,0],direction=[-Math.cos(.19),Math.sin(.19),0];
  const uv=intersectSurface(origin,direction,world,()=>1);
  const radius=1.024,b=origin[0]*direction[0],distance=-b-Math.sqrt(b*b-origin[0]**2+radius**2);
  const expectedV=Math.acos(direction[1]*distance/radius)/Math.PI;
  assert.ok(Math.abs(uv[1]-expectedV)<1e-7);
  assert.equal(intersectSurface(origin,[1,0,0],world,()=>1),null);
});
test('상한에서 작은 깎기와 나중에 칠한 큰 생물군계 붓이 적용',()=>{
  const world=createWorld({blank:true});for(let i=0;i<10;i++)paint(world,.5,.5,'raise',.001,.3);
  paint(world,.5,.5,'lower',.001,.3);assert.ok(sampleDetail(world,.5,.5).height<.71);
  paint(world,.5,.5,'lower',.06,.3);assert.ok(Math.abs(sampleDetail(world,.5,.5).height-.4)<1e-7);
  paint(world,.5,.5,'forest',.001,.1);paint(world,.5,.5,'desert',.06,.1);
  assert.equal(sampleDetail(world,.5,.5).biome,4);
  const restored=validateWorld(JSON.parse(JSON.stringify(world)));assert.ok(Math.abs(sampleDetail(restored,.5,.5).height-.4)<1e-7);
});

test('상세 필드의 경사는 높이와 일치하고 바다 평면은 0',()=>{
  const world=createWorld({blank:true});
  const sea=generateDetail(world,[.5,.5,.01,.01],17);for(let i=0;i<sea.length;i+=4){assert.equal(sea[i+2],0);assert.equal(sea[i+3],0);}
  paint(world,.5,.5,'raise',.001,.3);const raised=generateDetail(world,[.5,.5,.004,.004],65);
  assert.ok(raised[(32*65+24)*4+2]>0);assert.ok(raised[(32*65+40)*4+2]<0);
});
