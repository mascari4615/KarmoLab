import { sampleFilteredHeight, BIOMES } from './terrain.mjs';
import { gradientNoise } from './landform.mjs';
import { spherePoint, clamp } from './world.mjs';
import { regionalResidual, prepareRegions } from './regional-terrain.mjs';
import {sampleTerrainSource,sourceCovers} from './terrain-source.mjs';
const strokeCache=new WeakMap();
const emptyStrokes=[];
const baselineCache=new WeakMap();
function detailedBase(world){
  if(!world.detailBaseHeights)return world;
  let base=baselineCache.get(world);if(!base||base.heights!==world.detailBaseHeights){base={...world,heights:world.detailBaseHeights};baselineCache.set(world,base);}return base;
}
function preparedStrokes(world){
  const strokes=world.detailStrokes||emptyStrokes;let cached=strokeCache.get(world);
  if(cached?.source!==strokes||cached.length!==strokes.length){cached={source:strokes,length:strokes.length,values:strokes.map(s=>({...s,center:spherePoint(s.u,s.v),threshold:Math.cos(s.radius*Math.PI)}))};strokeCache.set(world,cached);}
  return cached.values;
}

// 구면 좌표의 고정 지형 함수. 확대 단계와 무관한 지점별 높이
export function sampleDetail(world,u,v,footprint=0,regionalWorld=world,baseHeight){
  const baseWorld=detailedBase(world),base=baseHeight??sampleFilteredHeight(baseWorld,u,v),p=spherePoint(u,v);
  const source=sampleTerrainSource(world,u,v,footprint);
  let h=base,amplitude=.052,frequency=120,weight=1;
  if((source?.weight||0)<.999&&regionalWorld.regionalDetail&&footprint<.0011)h+=regionalResidual(detailedBase(regionalWorld),u,v,footprint);
  const land=clamp((base-world.seaLevel)/.025,0,1),rugged=clamp((base-world.seaLevel)*4,.12,1);
  for(let octave=0;(source?.weight||0)<.999&&land>0&&octave<7;octave++){
    const visible=clamp(1-footprint*frequency*1.5,0,1);
    if(!visible)break;
    const n=gradientNoise(p[0]*frequency,p[1]*frequency,p[2]*frequency,world.seed+octave*101);
    const ridge=(1-Math.abs(n))**2;
    h+=(ridge-.58)*amplitude*weight*land*rugged*visible;
    weight=clamp(ridge*1.5,0,1);frequency*=2.13;amplitude*=.53;
  }
  if(source)h+=(source.height-h)*source.weight;
  if(source){
    const rough=clamp((source.slope-.12)/.65,0,1)*source.weight;
    for(let i=0,frequency=40000,amplitude=.00016;i<3&&rough>0;i++,frequency*=3,amplitude*=.43){
      const visible=clamp(1-footprint*frequency*1.5,0,1);if(!visible)break;
      h+=(.45-Math.abs(gradientNoise(p[0]*frequency,p[1]*frequency,p[2]*frequency,world.seed+911+i*31)))*amplitude*rough*visible;
    }
  }
  let biome=source?.weight>0?7:0;
  for(const stroke of preparedStrokes(world)){
    const center=stroke.center,dot=p[0]*center[0]+p[1]*center[1]+p[2]*center[2];
    const angle=stroke.radius*Math.PI;
    if(dot<stroke.threshold)continue;
    const weight=(1-Math.acos(clamp(dot,-1,1))/angle)**2;
    if(stroke.tool==='raise'||stroke.tool==='lower')h=clamp(h+(stroke.tool==='raise'?1:-1)*stroke.strength*weight,-1,1);
    else if(weight>.08)biome=BIOMES.indexOf(stroke.tool)+1;
  }
  return {height:clamp(h,-1,1),biome};
}

// GPU의 타일 보간과 경계 혼합을 피킹, 카메라, 장소에도 동일 적용
export function sampleRenderedHeight(world,tile,u,v){
  if(!tile)return sampleFilteredHeight(world,u,v);
  const [cx,cy,w,h]=tile.bounds,tU=(((u-cx+.5)%1+1)%1-.5)/w+.5,tV=(v-cy)/h+.5;
  const edge=Math.min(tU,1-tU,tV,1-tV),t=clamp(edge/.08,0,1),weight=t*t*(3-2*t);
  if(!weight)return sampleFilteredHeight(world,u,v);
  const px=clamp(tU,0,1)*(tile.size-1),py=clamp(tV,0,1)*(tile.size-1),x=Math.floor(px),y=Math.floor(py),a=px-x,b=py-y;
  const at=(x,y)=>tile.pixels[(Math.min(y,tile.size-1)*tile.size+Math.min(x,tile.size-1))*4];
  const detail=(at(x,y)*(1-a)+at(x+1,y)*a)*(1-b)+(at(x,y+1)*(1-a)+at(x+1,y+1)*a)*b;
  if(weight>=1)return detail;
  const base=sampleFilteredHeight(world,u,v);return base+(detail-base)*weight;
}

const meshVertices=new WeakMap();
export function sampleGlobeMeshHeight(world,tile,u,v){
  const px=((u%1+1)%1)*192,py=clamp(v,0,1-1e-10)*128,x=Math.floor(px),y=Math.floor(py);
  const vertex=(x,y)=>{const a=x/192,b=y/128,r=1+Math.max(0,sampleRenderedHeight(world,tile,a,b)-world.seaLevel)*.008*world.relief;return spherePoint(a,b,r);};
  const a=vertex(x,y),b=px-x>py-y?vertex(x+1,y):vertex(x,y+1),c=vertex(x+1,y+1),q=spherePoint(u,v);
  const ab=b.map((n,i)=>n-a[i]),ac=c.map((n,i)=>n-a[i]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const denominator=n.reduce((s,x,i)=>s+x*q[i],0);if(Math.abs(denominator)<1e-20)return sampleRenderedHeight(world,tile,u,v);
  return world.seaLevel+(n.reduce((s,x,i)=>s+x*a[i],0)/denominator-1)/(.008*world.relief);
}
// 구면 패치의 실제 삼각형 평면 높이. 세밀한 높이장의 봉우리가 격자 사이에 있을 때도 표시 면과 일치
export function sampleMeshHeight(world,tile,u,v,segments){
  if(!tile)return sampleGlobeMeshHeight(world,null,u,v);
  const [cx,cy,w,h]=tile.bounds,px=(((u-cx+.5)%1+1)%1-.5)/w+.5,py=(v-cy)/h+.5;
  if(px<0||px>=1||py<0||py>=1)return sampleGlobeMeshHeight(world,tile,u,v);
  let cache=meshVertices.get(tile);if(!cache){cache=new Map();meshVertices.set(tile,cache);}
  const vertex=(x,y)=>{
    const key=y*(segments+1)+x;let value=cache.get(key);
    if(!value){const a=cx+(x/segments-.5)*w,b=clamp(cy+(y/segments-.5)*h,0,1);value=[...spherePoint(a,b),sampleRenderedHeight(world,tile,a,b)];cache.set(key,value);}
    const r=1+Math.max(0,value[3]-world.seaLevel)*.008*world.relief+.0000002;return value.slice(0,3).map(n=>n*r);
  };
  const x=Math.floor(px*segments),y=Math.floor(py*segments),fx=px*segments-x,fy=py*segments-y;
  const a=fx+fy<1?vertex(x,y):vertex(x+1,y+1),b=vertex(x,y+1),c=vertex(x+1,y),q=spherePoint(u,v);
  const ab=b.map((n,i)=>n-a[i]),ac=c.map((n,i)=>n-a[i]);
  const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const denominator=n.reduce((s,x,i)=>s+x*q[i],0);if(Math.abs(denominator)<1e-20)return sampleRenderedHeight(world,tile,u,v);
  const radius=n.reduce((s,x,i)=>s+x*a[i],0)/denominator;
  const result=world.seaLevel+(radius-1)/(.008*world.relief),edge=clamp(Math.min(px,1-px,py,1-py)/.08,0,1);
  return edge*edge*(3-2*edge)>.99?result:Math.max(result,sampleGlobeMeshHeight(world,tile,u,v));
}

export function detailBounds(u,v,spanU,spanV){
  const extent=n=>Math.min(2,2**(Math.ceil(Math.log2(Math.max(.00003,n*1.25))*2)/2));
  const w=extent(spanU),h=extent(spanV);
  return [Math.round(u/(w/16))*(w/16),Math.round(v/(h/16))*(h/16),w,h];
}

// 같은 원본 행을 재사용하는 분리 보간. 근접 화면에서 중복되는 높이 읽기 절감
function baseTile(world,bounds,size){
  const [cx,cy,w,h]=bounds,data=new Float32Array(size*size),columns=new Int32Array(size*4),weights=new Float64Array(size*4),rows=new Map();
  const cubic=t=>[(1-t)**3/6,(4-6*t*t+3*t*t*t)/6,(1+3*t+3*t*t-3*t*t*t)/6,t*t*t/6];
  for(let x=0;x<size;x++){
    const px=((cx+(x/(size-1)-.5)*w)%1+1)%1*world.width,index=Math.floor(px),a=cubic(px-index);
    for(let k=0;k<4;k++){columns[x*4+k]=(index+k-1+world.width)%world.width;weights[x*4+k]=a[k];}
  }
  function row(y){
    y=clamp(y,0,world.height-1);let values=rows.get(y);
    if(!values){values=new Float64Array(size);for(let x=0;x<size;x++)for(let k=0;k<4;k++)values[x]+=world.heights[y*world.width+columns[x*4+k]]*weights[x*4+k];rows.set(y,values);}
    return values;
  }
  for(let y=0;y<size;y++){
    const v=clamp(cy+(y/(size-1)-.5)*h,0,1),py=v*(world.height-1),index=Math.floor(py),a=cubic(py-index),source=[row(index-1),row(index),row(index+1),row(index+2)];
    const t=clamp(Math.min(v,1-v)/.06,0,1),blend=t*t*(3-2*t),pole=world.heights[v<.5?0:(world.height-1)*world.width];
    for(let x=0;x<size;x++){let height=0;for(let k=0;k<4;k++)height+=source[k][x]*a[k];data[y*size+x]=pole+(height-pole)*blend;}
  }
  return data;
}

function* detailSteps(world,bounds,size){
  const data=new Float32Array(size*size*4),[cx,cy,w,h]=bounds;
  const strokes=(world.detailStrokes||[]).filter(s=>{
    if(Math.abs(s.v-cy)>h/2+s.radius)return false;
    const polar=Math.min(s.v-s.radius,1-s.v-s.radius),reach=polar<=0?.5:s.radius/(2*Math.sin(polar*Math.PI));
    return Math.abs(((s.u-cx+1.5)%1)-.5)<w/2+reach;
  });
  const local={...world,detailStrokes:strokes};
  const base=baseTile(detailedBase(world),bounds,size);
  const footprint=Math.max(w*Math.PI*2,h*Math.PI)/size;
  if(!sourceCovers(world,bounds))yield* prepareRegions(detailedBase(world),bounds,footprint);
  for(let y=0;y<size;y++){
  for(let x=0;x<size;x++){
    const u=cx+(x/(size-1)-.5)*w,v=clamp(cy+(y/(size-1)-.5)*h,0,1);
    const value=sampleDetail(local,u,v,footprint,world,base[y*size+x]),i=(y*size+x)*4;
    data[i]=value.height;data[i+1]=value.biome;
  }
  if(y%32===31)yield;
  }
  // 화면마다 반복하지 않는 구면 경사 계산
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,lat=clamp(cy+(y/(size-1)-.5)*h,0,1),dx=(Math.min(size-1,x+1)-Math.max(0,x-1))*w/(size-1)*2*Math.PI*Math.max(.045,Math.sin(lat*Math.PI));
    const dy=(Math.min(size-1,y+1)-Math.max(0,y-1))*h/(size-1)*Math.PI;
    data[i+2]=(data[(y*size+Math.min(size-1,x+1))*4]-data[(y*size+Math.max(0,x-1))*4])/dx;
    data[i+3]=(data[(Math.min(size-1,y+1)*size+x)*4]-data[(Math.max(0,y-1)*size+x)*4])/dy;
  }
  return data;
}

export function generateDetail(world,bounds,size=384){
  const steps=detailSteps(world,bounds,size);let result;do{result=steps.next();}while(!result.done);return result.value;
}

export async function generateDetailAsync(world,bounds,size,cancelled){
  const steps=detailSteps(world,bounds,size);let result;
  do{if(cancelled())return null;result=steps.next();if(!result.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!result.done);
  return cancelled()?null:result.value;
}
