import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/terrain.mjs';

test('상세 작업은 미리보기 후 완성본을 전달하고 취소 후 다음 작업을 처리',async()=>{
  const previous=globalThis.self,messages=[];
  globalThis.self={postMessage:value=>messages.push(value)};
  try{
    await import('../src/detail-worker.mjs');
    const world=createWorld({blank:true}),request={world,bounds:[.2,.5,.005,.005],size:512,key:'A',revision:1};
    await self.onmessage({data:request});
    assert.deepEqual(messages.map(m=>[m.key,m.size,Boolean(m.draft)]),[['A',256,true],['A',512,false]]);
    messages.length=0;
    const pending=self.onmessage({data:{...request,size:1024,key:'B'}});
    await self.onmessage({data:{cancel:true}});await pending;
    assert.equal(messages.at(-1).cancelled,true);assert.equal(messages.some(m=>m.pixels&&!m.draft),false);
    messages.length=0;await self.onmessage({data:{...request,key:'C'}});
    assert.equal(messages.at(-1).key,'C');assert.equal(messages.at(-1).size,512);
  }finally{globalThis.self=previous;}
});

test('고도 자료 다운로드 중 취소하면 다른 행성의 상세 작업 진행',async()=>{
 const previous=globalThis.self,fetchBefore=globalThis.fetch,messages=[];
 let rejectFetch;globalThis.fetch=()=>new Promise((resolve,reject)=>{rejectFetch=reject;});
 globalThis.self={postMessage:value=>messages.push(value)};
 try{
  await import('../src/detail-worker.mjs?network-cancel');
  const world=createWorld({blank:true});world.terrainSource='alpine-v1';
  const request={world,bounds:[.194,.4,.001,.001],size:256,key:'download',revision:1};
  const pending=self.onmessage({data:request});await self.onmessage({data:{cancel:true}});
  await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(new Error('취소 미응답')),300))]);
  assert.equal(messages.at(-1).cancelled,true);
  await self.onmessage({data:{...request,world:createWorld({blank:true}),key:'next'}});
  assert.equal(messages.at(-1).key,'next');assert.ok(messages.at(-1).pixels);
 }finally{rejectFetch?.(new Error('시험 종료'));globalThis.fetch=fetchBefore;globalThis.self=previous;}
});
