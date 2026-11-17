import test from 'node:test';
import assert from 'node:assert/strict';

test('IndexedDB 업그레이드가 막혀도 legacy 세계를 읽고 목록 유지',async()=>{
 const values=new Map([['wm.world.v1.undo',JSON.stringify({id:'undo',name:'보존할 세계'})]]);
 globalThis.localStorage={getItem:key=>values.get(key)||null,get length(){return values.size;},key:i=>[...values.keys()][i]};
 globalThis.indexedDB={open(){const request={};queueMicrotask(()=>request.onblocked());return request;}};
 const storage=await import('../src/storage.mjs');
 assert.deepEqual(await storage.readWorld('undo'),{id:'undo',name:'보존할 세계'});
 assert.equal((await storage.listWorlds()).get('undo'),'보존할 세계');
 assert.match(storage.storageProblem(),/다른 WM 탭/);
});
