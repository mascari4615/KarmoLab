import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {installTerrainSource,sampleTerrainSource,alpinePatch} from '../src/terrain-source.mjs';
import {createWorld,paint,validateWorld} from '../src/terrain.mjs';
import {sampleDetail} from '../src/detail.mjs';

test('공개 고도 자료의 해독과 큰 붓 편집, JSON 왕복이 같은 상세 표면에 반영',async()=>{
  const bytes=gunzipSync(await readFile(new URL('../public/data/alpine-v1.terrain',import.meta.url)));
  installTerrainSource('alpine-v1',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const world=createWorld({blank:true});world.terrainSource='alpine-v1';
  const source=sampleTerrainSource(world,alpinePatch.u,alpinePatch.v);assert.ok(source.height>.04&&source.height<.05);assert.equal(source.weight,1);
  const before=sampleDetail(world,alpinePatch.u,alpinePatch.v).height;
  paint(world,alpinePatch.u,alpinePatch.v,'raise',.03,.1);
  assert.ok(Math.abs(sampleDetail(world,alpinePatch.u,alpinePatch.v).height-before-.1)<1e-7);
  paint(world,alpinePatch.u,alpinePatch.v,'desert',.03,.1);assert.equal(sampleDetail(world,alpinePatch.u,alpinePatch.v).biome,4);
  const restored=validateWorld(JSON.parse(JSON.stringify(world)));assert.ok(Math.abs(sampleDetail(restored,alpinePatch.u,alpinePatch.v).height-before-.1)<1e-7);
  assert.equal(sampleTerrainSource(world,.5,.5),null);
});
