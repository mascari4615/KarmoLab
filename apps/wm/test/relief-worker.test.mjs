import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/terrain.mjs';

test('대체 지도의 자료 오류도 종료 응답을 보내며 다음 작업 진행',async()=>{
 const oldSelf=globalThis.self,oldFetch=globalThis.fetch,messages=[];
 globalThis.self={postMessage:value=>messages.push(value)};globalThis.fetch=async()=>({ok:false});
 try{
  await import('../src/relief-worker.mjs');
  const world=createWorld({blank:true});world.terrainSource='alpine-v1';
  await self.onmessage({data:{id:1,world,width:16,height:8}});
  assert.equal(messages[0].error,true);
  await self.onmessage({data:{id:2,world:createWorld({blank:true}),width:16,height:8}});
  assert.equal(messages[1].pixels.length,16*8*4);
 }finally{globalThis.self=oldSelf;globalThis.fetch=oldFetch;}
});
