import test from 'node:test';
import assert from 'node:assert/strict';
import { createDetailFields } from '../src/detail-fields.mjs';
import { createWorld } from '../src/terrain.mjs';

test('A에서 B로 이동 후 A로 돌아오면 늦은 B 계산을 적용하지 않음',()=>{
  const savedWorker=globalThis.Worker,requests=[];let worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(value){requests.push(value);}terminate(){}};
  try{
    const ready=[],uniforms={},detail=createDetailFields(uniforms,value=>ready.push(value));
    detail.update(createWorld({blank:true}));detail.request(.2,.5,.02,.02);detail.request(.7,.5,.02,.02);detail.request(.2,.5,.02,.02);
    const job=requests[0];worker.onmessage({data:{...job,pixels:new Float32Array(job.size*job.size*4),elapsed:1}});
    assert.equal(requests.filter(r=>!r.cancel).length,1);assert.equal(ready.length,1);assert.deepEqual(ready[0].bounds,job.bounds);detail.dispose();
  }finally{globalThis.Worker=savedWorker;}
});
test('계산 중 연속 편집은 최신 세계 하나로 합치고 숫자 배열 전송',()=>{
  const savedWorker=globalThis.Worker,requests=[];let worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(value){requests.push(value);}terminate(){}};
  try{
    const ready=[],detail=createDetailFields({},value=>ready.push(value)),world=createWorld({blank:true});
    detail.update(world);detail.request(.2,.5,.02,.02);
    for(let i=0;i<10;i++){world.heights[1]=i/10;detail.update(world);}
    assert.equal(requests.filter(r=>!r.cancel).length,1);
    const job=requests[0];worker.onmessage({data:{...job,pixels:new Float32Array(job.size*job.size*4),elapsed:1}});
    assert.equal(ready.length,0);assert.equal(requests.filter(r=>!r.cancel).length,2);assert.ok(requests.filter(r=>!r.cancel)[1].world.heights instanceof Float32Array);
    assert.ok(Math.abs(requests.filter(r=>!r.cancel)[1].world.heights[1]-.9)<1e-7);detail.dispose();
  }finally{globalThis.Worker=savedWorker;}
});

test('상세 자료 실패는 같은 세계를 자동으로 재요청하지 않음',()=>{
 const saved=globalThis.Worker,requests=[];let worker;
 globalThis.Worker=class{constructor(){worker=this;}postMessage(value){requests.push(value);}terminate(){}};
 try{
  const detail=createDetailFields({},()=>{});detail.update(createWorld({blank:true}));detail.request(.2,.5,.02,.02);
  worker.onmessage({data:{...requests[0],error:true}});detail.request(.2,.5,.02,.02);detail.request(.3,.5,.02,.02);
  assert.equal(requests.filter(r=>!r.cancel).length,1);
  detail.update(createWorld({blank:true}));assert.equal(requests.filter(r=>!r.cancel).length,2);detail.dispose();
 }finally{globalThis.Worker=saved;}
});
