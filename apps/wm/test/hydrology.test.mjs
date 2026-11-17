import test from 'node:test';
import assert from 'node:assert/strict';
import {rivers} from '../src/hydrology.mjs';
test('함몰지를 포함한 배수 경로가 유한하고 바다만 있는 세계는 빈 결과',()=>{
 const width=64,height=36,heights=Array.from({length:width*height},(_,i)=>{const y=Math.floor(i/width);return y>28?-.1:.3-y*.008+Math.sin(i%width*.4)*.006;});
 heights[15*width+20]=.01;
 const world={width,height,heights,seaLevel:0},paths=rivers(world);
 assert.ok(paths.length>0);for(const path of paths){assert.ok(path.length<1500);assert.equal(new Set(path.map(([u,v])=>`${u}:${v}`)).size,path.length);assert.ok(path.every(([u,v])=>u>=0&&u<1&&v>=0&&v<=1));}
 assert.deepEqual(rivers({...world,heights:heights.map(()=>-.1)}),[]);
});
