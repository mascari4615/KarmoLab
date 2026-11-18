export const entryKinds={person:'인물',event:'사건',lore:'설정',faction:'세력'};
export const recordStates={draft:'초안',confirmed:'확정',question:'미정'};
export function initialEntries(world){
  if(Array.isArray(world.entries))return world.entries;
  if(world.id!=='undo')return [];
  return [
    ['yon-person','욘','숲속에 사는 엘프 마녀. 누군가를 행복하게 만드는 마법을 연구한다.'],
    ['ring','링','욘의 첫 번째 메이드 인형. 하고 싶은 일을 향해 먼저 움직인다.'],
    ['alisa','알리사','욘의 두 번째 메이드 인형. 계획을 세우고 함께 사는 공간을 돌본다.'],
    ['fourth','네 번째 인형','새로 만들어진, 아직 완성되지 않은 인형. 플레이어가 되어 이 세계를 만난다.'],
  ].map(([id,title,body])=>({id,title,body,kind:'person',state:'draft',links:world.places.some(p=>p.id==='yon')?[{to:'place:yon',label:'함께 지내는 곳'}]:[]}));
}
export function records(world){
  return [...world.places.map(p=>({key:`place:${p.id}`,kind:'place',title:p.name,body:p.text||'',state:p.state||'draft',source:p.source||'',area:p.area||'',links:p.links||[],value:p})),
    ...initialEntries(world).map(e=>({key:`entry:${e.id}`,kind:e.kind,title:e.title,body:e.body||'',state:e.state||'draft',source:'',area:e.date||'',links:e.links||[],value:e}))];
}
export function recordByKey(world,key){return records(world).find(r=>r.key===key);}
export function updateRecord(world,key,values){
  if(typeof values.title!=='string'||!values.title.trim()||values.title.length>100||typeof values.body!=='string'||values.body.length>30000||typeof values.area!=='string'||values.area.length>(key.startsWith('place:')?5000:100))throw new Error('이름과 설정 내용을 확인해 주세요.');
  if(!recordByKey(world,key))throw new Error('설정 항목을 찾을 수 없습니다.');
  const next={...world,places:world.places.map(p=>`place:${p.id}`===key?{...p,name:values.title,text:values.body,state:values.state,area:values.area,links:structuredClone(values.links)}:p),entries:(world.entries||[]).map(e=>`entry:${e.id}`===key?{...e,title:values.title,body:values.body,state:values.state,date:values.area,links:structuredClone(values.links)}:e)};
  validateLore(next);return next;
}
export function removeRecord(world,key){
  const clean=item=>({...item,links:(item.links||[]).filter(link=>link.to!==key)});
  return {...world,places:world.places.filter(p=>`place:${p.id}`!==key).map(clean),entries:(world.entries||[]).filter(e=>`entry:${e.id}`!==key).map(clean)};
}
export function recoverRecordDraft(world,key,values){
  if(!values||typeof values.body!=='string'||typeof values.title!=='string')throw new Error('초안 형식을 읽지 못했습니다.');
  const record=recordByKey(world,key),keys=new Set(records(world).map(r=>r.key)),original=Array.isArray(values.links)?values.links:[];
  const links=original.filter(l=>l&&keys.has(l.to)&&typeof l.label==='string'&&l.label.length<=100).slice(0,200);
  return {values:{title:values.title,body:values.body,area:typeof values.area==='string'?values.area:record.area,state:Object.hasOwn(recordStates,values.state)?values.state:'draft',links},removedLinks:original.length-links.length};
}
export function validateLore(world){
  const entries=world.entries??[];
  if(!Array.isArray(entries)||entries.length>2000)throw new Error('설정 기록 수를 확인해 주세요.');
  const keys=new Set(world.places.map(p=>`place:${p.id}`));
  for(const e of entries){
    if(!e||typeof e.id!=='string'||!e.id||e.id.length>150||!Object.hasOwn(entryKinds,e.kind)||typeof e.title!=='string'||!e.title.trim()||e.title.length>100||typeof e.body!=='string'||e.body.length>30000)throw new Error('설정 기록이 올바르지 않습니다.');
    const key=`entry:${e.id}`;if(keys.has(key))throw new Error('설정 기록 ID가 중복되었습니다.');keys.add(key);
    if(e.date!==undefined&&(typeof e.date!=='string'||e.date.length>100))throw new Error('사건 시점을 확인해 주세요.');
  }
  for(const item of [...world.places,...entries]){
    if(item.state!==undefined&&!Object.hasOwn(recordStates,item.state))throw new Error('설정 상태를 확인해 주세요.');
    if(item.links!==undefined&&(!Array.isArray(item.links)||item.links.length>200||!item.links.every(l=>l&&typeof l.to==='string'&&keys.has(l.to)&&typeof l.label==='string'&&l.label.length<=100)))throw new Error('설정 연결을 확인해 주세요.');
  }
}
