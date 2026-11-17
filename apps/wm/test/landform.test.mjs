import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLandform,erode } from '../src/landform.mjs';
import { createWorld,validateWorld,sampleHeight,paint } from '../src/terrain.mjs';

test('침식 생성 후 고해상도 세계의 극점, 원본 육해, JSON 유효성 유지',()=>{
 const world={...createWorld({original:true}),...generateLandform({erosion:15000})};
 assert.doesNotThrow(()=>validateWorld(world));
 assert.ok(sampleHeight(world,.16,.1)>0);assert.ok(sampleHeight(world,.85,.45)<0);assert.ok(sampleHeight(world,.28,.54)>0);
 const before=sampleHeight(world,.9,.5);paint(world,.2,.5,'raise',.04,.1);assert.equal(sampleHeight(world,.9,.5),before);
 paint(world,.4,0,'lower',.06,.1);assert.doesNotThrow(()=>validateWorld(world));
});
test('침식은 재현 가능하고 평평한 바다를 깎지 않음',()=>{
 const field=new Float32Array(64*36).fill(-.2),copy=field.slice();erode(field,64,36,7,1000);assert.deepEqual(field,copy);
 const first=generateLandform({width:128,height:72,seed:15,erosion:500}),second=generateLandform({width:128,height:72,seed:15,erosion:500});assert.deepEqual(first,second);
});
