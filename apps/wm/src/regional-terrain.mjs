import { sampleFilteredHeight } from './terrain.mjs';
import { gradientNoise, erode } from './landform.mjs';
import { spherePoint, clamp } from './world.mjs';

const caches=new WeakMap(),size=256,border=20;

// 내리막 흐름의 합류량에 따른 계곡과 뒤이은 물방울 침식
function drainage(heights,n,strength){
  const count=n*n,order=Uint32Array.from({length:count},(_,i)=>i),flow=new Float32Array(count).fill(1),next=new Int32Array(count).fill(-1);
  order.sort((a,b)=>heights[b]-heights[a]);
  for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
    const i=y*n+x;let slope=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const j=i+dy*n+dx,drop=(heights[i]-heights[j])/(dx&&dy?Math.SQRT2:1);
      if(drop>slope){slope=drop;next[i]=j;}
    }
  }
  for(const i of order)if(next[i]>=0)flow[next[i]]+=flow[i];
  for(let i=0;i<count;i++)heights[i]-=Math.min(strength,Math.log1p(Math.max(0,flow[i]-3))*strength*.22);
}

function buildRegion(world,column,row,columns){
  const rows=columns/2,n=size+border*2,heights=new Float32Array(n*n),original=new Float32Array(n*n),scale=32/columns;
  let land=false;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(column+(x-border)/(size-1))/columns,v=clamp((row+(y-border)/(size-1))/rows,0,1),p=spherePoint(u,v),base=sampleFilteredHeight(world,u,v);
    let ridges=0,amplitude=.04*scale,frequency=columns*7;
    for(let k=0;k<4;k++){
      const value=gradientNoise(p[0]*frequency,p[1]*frequency,p[2]*frequency,world.seed+503+k*107);
      ridges+=((1-Math.abs(value))**2-.55)*amplitude;frequency*=2.1;amplitude*=.52;
    }
    const roughness=clamp((base-world.seaLevel)*5,0,1);
    land ||= base>world.seaLevel;
    original[y*n+x]=base;heights[y*n+x]=base+ridges*roughness;
  }
  if(!land)return new Float32Array(size*size);
  drainage(heights,n,.023*scale);
  erode(heights,n,n,world.seed+column*1031+row*4099+columns,20000,1.6);
  const residual=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y+border)*n+x+border,edge=Math.min(x,y,size-1-x,size-1-y),t=clamp(edge/20,0,1);
    residual[y*size+x]=clamp(heights[i]-original[i],-.06*scale,.035*scale)*t*t*(3-2*t);
  }
  return residual;
}

function sampleRegion(world,u,v,columns){
  const px=u*columns,py=v*columns/2,column=Math.floor(px),row=Math.min(columns/2-1,Math.floor(py)),key=`${columns}:${row}:${column}`;
  let cache=caches.get(world);if(!cache){cache=new Map();caches.set(world,cache);}
  let tile=cache.get(key);
  if(!tile){tile=buildRegion(world,column,row,columns);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,tile);}
  const x=(px-column)*(size-1),y=(py-row)*(size-1),ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy;
  const at=(x,y)=>tile[Math.min(size-1,y)*size+Math.min(size-1,x)];
  return(at(ix,iy)*(1-a)+at(ix+1,iy)*a)*(1-b)+(at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a)*b;
}

// 고정된 지역 격자의 세 단계 상세. 화면 이동과 확대에도 위치별 구조 유지
export function regionalResidual(world,u,v,footprint=0){
  if(v<=0||v>=1)return 0;u=(u%1+1)%1;
  let value=0;
  for(const columns of [32,128,512]){
    const weight=clamp(1-footprint*columns*28,0,1);
    if(weight>0)value+=sampleRegion(world,u,v,columns)*weight;
  }
  return value;
}

export function* prepareRegions(world,bounds,footprint){
  if(!world.regionalDetail)return;
  const [cx,cy,w,h]=bounds;
  for(const columns of [32,128,512]){
    if(footprint*columns*28>=1)continue;const rows=columns/2;
    const left=Math.floor((cx-w/2)*columns),right=Math.floor((cx+w/2)*columns),top=Math.max(0,Math.floor((cy-h/2)*rows)),bottom=Math.min(rows-1,Math.floor((cy+h/2)*rows));
    for(let row=top;row<=bottom;row++)for(let x=left;x<=right;x++){
      const column=(x%columns+columns)%columns,key=`${columns}:${row}:${column}`;
      if(!caches.get(world)?.has(key)){sampleRegion(world,(column+.5)/columns,(row+.5)/rows,columns);yield;}
    }
  }
}
