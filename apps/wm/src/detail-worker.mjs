import { generateDetailAsync } from './detail.mjs';
import {prepareTerrainSource} from './terrain-source.mjs';
let world,generation=0,cancelDownload;
self.onmessage=async({data})=>{
  if(data.cancel){generation++;cancelDownload?.();return;}
  const token=++generation,cancelled=()=>token!==generation;
  if(data.world)world=data.world;
  if(data.edits)Object.assign(world,data.edits);
  const {bounds,key,revision,size}=data;
  const started=performance.now();
  try{
    const stopped=new Promise(resolve=>{cancelDownload=()=>resolve(false);});
    const ready=await Promise.race([prepareTerrainSource(world).then(()=>true),stopped]);
    cancelDownload=null;
    if(!ready||cancelled()){self.postMessage({key,revision,cancelled:true});return;}
    const draftSize=256,draft=await generateDetailAsync({...world,regionalDetail:false},bounds,draftSize,cancelled);
    if(draft)self.postMessage({bounds,key,revision,size:draftSize,pixels:draft,elapsed:performance.now()-started,draft:true},[draft.buffer]);
    const pixels=cancelled()?null:await generateDetailAsync(world,bounds,size,cancelled);
    if(pixels)self.postMessage({bounds,key,revision,size,pixels,elapsed:performance.now()-started},[pixels.buffer]);
    else self.postMessage({key,revision,cancelled:true});
  }catch(error){self.postMessage({key,revision,error:true,message:error.message});}
};
