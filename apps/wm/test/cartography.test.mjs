import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCartography,contourLines} from '../src/cartography.mjs';
import {createWorld,paint} from '../src/terrain.mjs';
import {originalRevision} from '../src/editor.mjs';

test('coasts preserve separate islands and an inland lake as closed rings',()=>{
  const width=13,height=9,values=new Float32Array(width*height).fill(-1);
  for(let y=1;y<=7;y++)for(let x=1;x<=7;x++)values[y*width+x]=1;
  for(let y=3;y<=5;y++)for(let x=3;x<=5;x++)values[y*width+x]=-1;
  values[4*width+10]=1;
  const rings=contourLines(values,width,height);
  assert.equal(rings.length,3);
  for(const ring of rings){assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(p=>p.every(Number.isFinite)));}
});

test('new original terrain carries authored and deleted notes without changing the saved world',()=>{
  const prior=createWorld({original:true});prior.places=prior.places.filter(p=>p.id!=='yon');
  prior.places.push({id:'authored',name:'내 장소',type:'city',x:.4,y:.5,text:'작성한 내용'});
  prior.entries=[{id:'author',kind:'lore',title:'내 설정',body:'보존할 본문',links:[],state:'draft'}];
  prior.star='내 항성';const before=JSON.stringify(prior),fresh=createWorld({original:true});
  const heightRef=fresh.heights,result=originalRevision(fresh,prior);
  assert.equal(result.id,'undo-atlas-v2');assert.equal(result.heights,heightRef);
  assert.deepEqual(result.places,prior.places);assert.deepEqual(result.entries,prior.entries);assert.equal(result.star,'내 항성');
  result.places[0].name='사본 수정';result.entries[0].body='사본 본문';
  assert.equal(JSON.stringify(prior),before);
});

test('a raised island appears in chart geometry and undo restores the empty sea',()=>{
  const world=createWorld({blank:true}),before=world.heights.slice();
  assert.equal(buildCartography(world).land.length,0);
  paint(world,.5,.5,'raise',.05,.3);
  paint(world,.5,.5,'raise',.05,.3);
  const after=buildCartography(world);
  assert.ok(after.land.length>0);
  assert.ok(after.land.flat().some(([x,y])=>Math.abs(x-800)<80&&Math.abs(y-450)<80));
  world.heights=before;
  assert.equal(buildCartography(world).land.length,0);
});
