import {clamp} from './world.mjs';

export const alpinePatch=Object.freeze({id:'alpine-v1',u:.194,v:.4,w:.00148,h:.00282});
const sources=new Map(),pending=new Map();
export async function prepareTerrainSource(world){
  const id=world.terrainSource;if(!id||sources.has(id))return;
  if(id!=='alpine-v1')throw new Error('알 수 없는 상세 고도 자료입니다.');
  if(!pending.has(id))pending.set(id,(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
    const base=import.meta.env?.BASE_URL||'/atlas/',response=await fetch(`${base}data/${id}.terrain`,{signal:controller.signal});
    if(!response.ok)throw new Error('샘플의 상세 고도 자료를 불러오지 못했습니다.');
    const compressed=await response.arrayBuffer();
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    installTerrainSource(id,await new Response(stream).arrayBuffer());
    }finally{clearTimeout(timer);}
  })().catch(error=>{pending.delete(id);throw error;}));
  await pending.get(id);
}

export function installTerrainSource(id,buffer){
  const header=new DataView(buffer),width=header.getUint32(0,true),height=header.getUint32(4,true);
  if(id!=='alpine-v1'||width!==2048||height!==2048||buffer.byteLength!==8+width*height*2)throw new Error('상세 고도 자료가 손상되었습니다.');
  const values=new Int16Array(buffer,8);for(let y=0;y<height;y++)for(let x=1;x<width;x++)values[y*width+x]+=values[y*width+x-1];
  const levels=[{width,height,values}];
  for(let n=width/2;n>=32;n/=2){
    const previous=levels.at(-1),next=new Float32Array(n*n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*2*previous.width+x*2;next[y*n+x]=(previous.values[i]+previous.values[i+1]+previous.values[i+previous.width]+previous.values[i+previous.width+1])*.25;}
    levels.push({width:n,height:n,values:next});
  }
  sources.set(id,levels);
}

export function sourcePosition(world,u,v){
  if(world.terrainSource!=='alpine-v1')return null;
  const x=(u-alpinePatch.u)/alpinePatch.w+.5,y=(v-alpinePatch.v)/alpinePatch.h+.5;
  const edge=Math.min(x,1-x,y,1-y),t=clamp(edge/.14,0,1);return{x,y,weight:t*t*(3-2*t)};
}

export function sourceCovers(world,bounds){
  const [u,v,w,h]=bounds;
  return[-1,1].every(a=>[-1,1].every(b=>(sourcePosition(world,u+a*w/2,v+b*h/2)?.weight||0)>.999));
}

export function sampleTerrainSource(world,u,v,footprint=0){
  const position=sourcePosition(world,u,v),levels=sources.get(world.terrainSource);if(!position?.weight||!levels)return null;
  const footprintPixels=footprint*2048/(Math.PI*2*alpinePatch.w),level=clamp(Math.floor(Math.log2(Math.max(1,footprintPixels))),0,levels.length-1),grid=levels[level];
  const px=position.x*(grid.width-1),py=position.y*(grid.height-1),x=Math.floor(px),y=Math.floor(py),a=px-x,b=py-y;
  const at=(x,y)=>grid.values[Math.min(grid.height-1,y)*grid.width+Math.min(grid.width-1,x)];
  const nw=at(x,y),ne=at(x+1,y),sw=at(x,y+1),se=at(x+1,y+1),meters=(nw*(1-a)+ne*a)*(1-b)+(sw*(1-a)+se*a)*b;
  const gx=((ne-nw)*(1-b)+(se-sw)*b)*(grid.width-1)/(50000*alpinePatch.w*Math.PI*2*Math.max(.05,Math.sin(v*Math.PI)));
  const gy=((sw-nw)*(1-a)+(se-ne)*a)*(grid.height-1)/(50000*alpinePatch.h*Math.PI);
  return{height:.01+meters/50000,weight:position.weight,slope:Math.hypot(gx,gy)*.008};
}
