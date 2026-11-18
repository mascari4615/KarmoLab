import { paintedRows } from './terrain.mjs';
const PREFIX='wm.world.v1.',snapshots=new WeakMap(),baselines=new WeakMap();
function terrainSnapshot(world){
  let value=snapshots.get(world);
  if(!value||value.heightRef!==world.heights||value.biomeRef!==world.biomes){value={heightRef:world.heights,biomeRef:world.biomes,heights:new Float32Array(world.heights.length),biomes:new Uint8Array(world.biomes.length),revision:-1};snapshots.set(world,value);}
  const rows=paintedRows(world,value.revision);value.revision=rows.revision;
  for(let i=rows.top*world.width;i<(rows.bottom+1)*world.width;i++){value.heights[i]=world.heights[i];value.biomes[i]=world.biomes[i];}
  let baseline;if(world.detailBaseHeights){baseline=baselines.get(world.detailBaseHeights);if(!baseline){baseline=Float32Array.from(world.detailBaseHeights);baselines.set(world.detailBaseHeights,baseline);}}
  return {heights:value.heights,biomes:value.biomes,...(baseline?{detailBaseHeights:baseline}:{})};
}
let database,problem='';
export const storageProblem=()=>problem;
function open(){return database??=new Promise((resolve,reject)=>{
  let ended=false;const fail=message=>{if(ended)return;ended=true;clearTimeout(timer);problem=message;reject(new Error(message));};
  const timer=setTimeout(()=>fail('저장소를 열지 못했어요. 다른 WM 탭을 새로고침한 뒤 다시 시도해 주세요.'),5000);
  const request=indexedDB.open('wm-worlds',2);
  request.onupgradeneeded=()=>{
    if(ended){request.transaction.abort();return;}
    const db=request.result;if(!db.objectStoreNames.contains('worlds'))db.createObjectStore('worlds',{keyPath:'id'});
    if(!db.objectStoreNames.contains('catalog')){
      const catalog=db.createObjectStore('catalog',{keyPath:'id'}),cursor=request.transaction.objectStore('worlds').openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(item){catalog.put({id:item.value.id,name:item.value.name});item.continue();}};
    }
  };
  request.onblocked=()=>fail('다른 WM 탭을 닫거나 새로고침한 뒤 저장을 다시 시도해 주세요.');
  request.onsuccess=()=>{if(ended){request.result.close();return;}ended=true;clearTimeout(timer);problem='';request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
  request.onerror=()=>fail('브라우저 저장소를 열 수 없어요. JSON 내보내기로 작업을 보관해 주세요.');
}).catch(error=>{database=null;throw error;});}
async function request(mode,action,table='worlds'){
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,mode),result=action(tx.objectStore(table));
    tx.oncomplete=()=>resolve(result.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function storeWorld(world,{signal}={}){
  const db=await open();if(signal?.aborted)throw new DOMException('취소됨','AbortError');
  const snapshot={...world,places:world.places.map(p=>({...p})),...terrainSnapshot(world),...(world.detailStrokes?{detailStrokes:world.detailStrokes.map(s=>({...s}))}:{})};
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['worlds','catalog'],'readwrite'),abort=()=>tx.abort();
    signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    tx.objectStore('worlds').put(snapshot);tx.objectStore('catalog').put({id:snapshot.id,name:snapshot.name});
    tx.oncomplete=()=>{cleanup();resolve();};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(tx.error||new DOMException('취소됨','AbortError'));};
  });
}
export async function storeWorldIfMissing(world,{signal}={}){
  const db=await open();if(signal?.aborted)throw new DOMException('취소됨','AbortError');
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['worlds','catalog'],'readwrite'),worlds=tx.objectStore('worlds'),lookup=worlds.get(world.id);
    let inserted=false;const abort=()=>tx.abort();signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    lookup.onsuccess=()=>{if(lookup.result)return;worlds.add({...world,...terrainSnapshot(world)});tx.objectStore('catalog').put({id:world.id,name:world.name});inserted=true;};
    tx.oncomplete=()=>{cleanup();resolve(inserted);};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(tx.error||new DOMException('취소됨','AbortError'));};
  });
}
export async function readWorld(id){
  let stored,readError;try{stored=await request('readonly',store=>store.get(id));}catch(error){readError=error;}
  if(stored)return {...stored,heights:Array.from(stored.heights,v=>Math.round(v*100000)/100000),biomes:Array.from(stored.biomes),...(stored.detailBaseHeights?{detailBaseHeights:Array.from(stored.detailBaseHeights)}:{})};
  const raw=localStorage.getItem(PREFIX+id);if(raw)return JSON.parse(raw);if(readError)throw readError;return null;
}
export async function listWorlds(){
  let stored=[];try{stored=await request('readonly',store=>store.getAll(),'catalog');}catch{}const entries=new Map();
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key.startsWith(PREFIX))continue;
    try{const item=JSON.parse(localStorage.getItem(key));entries.set(item.id,item.name);}catch{}
  }
  for(const item of stored)entries.set(item.id,item.name);
  return entries;
}
