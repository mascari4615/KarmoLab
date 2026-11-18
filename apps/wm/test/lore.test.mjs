import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,validateWorld,paint} from '../src/terrain.mjs';
import {initialEntries,records,updateRecord,removeRecord,validateLore,recoverRecordDraft} from '../src/lore.mjs';
import {editSnapshot,restoreEdit} from '../src/editor.mjs';

const fixture=()=>({...createWorld({blank:true}),places:[{id:'home',name:'집',type:'home',x:.2,y:.5,area:'숲',text:'원본',source:'사용자 작성'}],entries:[{id:'person',kind:'person',title:'인물',body:'초안',state:'draft',links:[{to:'place:home',label:'사는 곳'}]}]});
test('장소와 인물, 사건, 양방향 참조의 JSON 왕복',()=>{
  const world=fixture();world.entries.push({id:'event',kind:'event',title:'사건',body:'첫째 줄\n둘째 줄 <script>는 글자',state:'question',date:'미정',links:[{to:'entry:person',label:'참여 인물'},{to:'place:home',label:'배경'}]});
  const restored=validateWorld(JSON.parse(JSON.stringify(world)));assert.deepEqual(restored.entries,world.entries);
  assert.equal(records(restored).filter(r=>r.links.some(l=>l.to==='place:home')).length,2);
  assert.equal(records(restored)[2].state,'question');
});
test('이전 세계 파일에 설정 기록이 없어도 읽고 새 행성에는 WM 인물을 심지 않음',()=>{
  const old=fixture();delete old.entries;assert.doesNotThrow(()=>validateWorld(old));assert.deepEqual(initialEntries(old),[]);
  old.id='undo';old.places=[];const seeded=initialEntries(old);assert.equal(seeded.length,4);assert.ok(seeded.every(e=>e.state==='draft'&&e.links.length===0));
  old.entries=[];assert.deepEqual(initialEntries(old),[]);
});
test('설정 수정은 지형 배열을 유지하고, 메타데이터 실행 취소는 나중의 지형 수정을 보존',()=>{
  let world=fixture();const before=editSnapshot(world,'meta'),heights=world.heights,biomes=world.biomes;
  world=updateRecord(world,'place:home',{title:'새 이름',body:'새 설정',state:'confirmed',area:'숲',links:[{to:'entry:person',label:'거주자'}]});
  assert.equal(world.heights,heights);assert.equal(world.biomes,biomes);paint(world,.2,.5,'raise',.04,.1);const terrain=world.heights.slice();
  const redo=editSnapshot(world,'meta');world=restoreEdit(world,before);assert.equal(world.places[0].text,'원본');assert.deepEqual(world.heights,terrain);
  world=restoreEdit(world,redo);assert.equal(world.places[0].state,'confirmed');assert.equal(world.places[0].links[0].to,'entry:person');
});
test('삭제하면 참조도 제거, 실행 취소로 본문과 참조 함께 복구',()=>{
  const world=fixture(),snapshot=editSnapshot(world,'meta'),removed=removeRecord(world,'place:home');
  assert.equal(removed.places.length,0);assert.deepEqual(removed.entries[0].links,[]);validateLore(removed);
  const restored=restoreEdit(removed,snapshot);assert.equal(restored.places[0].name,'집');assert.equal(restored.entries[0].links[0].to,'place:home');
});
test('깨진 연결과 과도한 기록, 잘못된 상태를 거부하고 기존 자료는 그대로 유지',()=>{
  const world=fixture(),before=JSON.stringify(world);
  assert.throws(()=>updateRecord(world,'place:home',{title:'이름',body:'',area:'',state:'made-up',links:[]}));
  assert.throws(()=>updateRecord(world,'place:home',{title:'이름',body:'',area:'',state:'draft',links:[{to:'entry:missing',label:'없는 항목'}]}));
  assert.throws(()=>updateRecord(world,'place:home',{title:' ',body:'',area:'',state:'draft',links:[]}));
  assert.throws(()=>updateRecord(world,'place:home',{title:'이름',body:'x'.repeat(30001),area:'',state:'draft',links:[]}));
  assert.equal(JSON.stringify(world),before);
});
test('삭제된 연결이 있는 초안도 본문과 이름을 보존해 복구',()=>{
  const world=fixture(),draft={title:'저장 전 이름',body:'저장되지 않은 소중한 본문',area:'',state:'question',links:[{to:'place:deleted',label:'사라진 곳'},{to:'entry:person',label:'남은 인물'}]};
  const recovered=recoverRecordDraft(world,'place:home',draft);assert.equal(recovered.values.body,draft.body);assert.equal(recovered.values.title,draft.title);assert.equal(recovered.removedLinks,1);assert.equal(recovered.values.links[0].to,'entry:person');assert.equal(draft.links.length,2);
  assert.doesNotThrow(()=>updateRecord(world,'place:home',recovered.values));
});
test('이전 파일의 긴 지역 메모를 보존하며 본문 수정과 백업 가능',()=>{
  const world=fixture();world.places[0].area='기존 지역 메모 '.repeat(100);validateWorld(world);
  const next=updateRecord(world,'place:home',{title:'집',body:'본문 수정',area:world.places[0].area,state:'draft',links:[]});assert.equal(next.places[0].area,world.places[0].area);assert.equal(next.places[0].text,'본문 수정');
});
