import { sourceMask } from './source-coasts.mjs';

// 주기 경도, 시드 재현성을 갖는 경사 잡음
export function gradientNoise(x, y, z, seed = 27) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const fade = t => t*t*t*(t*(t*6-15)+10), mix = (a,b,t) => a+(b-a)*t;
  const grad = (a,b,c,dx,dy,dz) => {
    let n = Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^seed;
    n = Math.imul(n^(n>>>13),1274126177); n = (n^(n>>>16))&15;
    const p = n<8?dx:dy, q = n<4?dy:n===12||n===14?dx:dz;
    return (n&1?-p:p)+(n&2?-q:q);
  };
  const a=fade(fx),b=fade(fy),c=fade(fz);
  return mix(mix(mix(grad(ix,iy,iz,fx,fy,fz),grad(ix+1,iy,iz,fx-1,fy,fz),a),mix(grad(ix,iy+1,iz,fx,fy-1,fz),grad(ix+1,iy+1,iz,fx-1,fy-1,fz),a),b),mix(mix(grad(ix,iy,iz+1,fx,fy,fz-1),grad(ix+1,iy,iz+1,fx-1,fy,fz-1),a),mix(grad(ix,iy+1,iz+1,fx,fy-1,fz-1),grad(ix+1,iy+1,iz+1,fx-1,fy-1,fz-1),a),b),c);
}

function distanceField(mask,w,h) {
  const d = new Float32Array(mask.length).fill(w);
  const at = (x,y) => Math.max(0,Math.min(h-1,y))*w+(x+w)%w;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(mask[i]!==mask[at(x+1,y)]||mask[i]!==mask[at(x-1,y)]||mask[i]!==mask[at(x,y+1)]||mask[i]!==mask[at(x,y-1)]) d[i]=.5;
  }
  for(let pass=0;pass<2;pass++){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;d[i]=Math.min(d[i],d[at(x-1,y)]+1,d[at(x,y-1)]+1,d[at(x-1,y-1)]+1.414,d[at(x+1,y-1)]+1.414);
    }
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
      const i=y*w+x;d[i]=Math.min(d[i],d[at(x+1,y)]+1,d[at(x,y+1)]+1,d[at(x+1,y+1)]+1.414,d[at(x-1,y+1)]+1.414);
    }
  }
  return d;
}

// 물방울의 경사 이동, 운반 한도와 퇴적으로 골짜기 생성
export function erode(heights,w,h,seed,drops=100000,radius=3) {
  let state=seed|0; const random=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
  const read=(x,y)=>heights[y*w+(x+w)%w];
  const sample=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
    const a=read(ix,iy),b=read(ix+1,iy),c=read(ix,iy+1),d=read(ix+1,iy+1);
    return [(a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty,(b-a)*(1-ty)+(d-c)*ty,(c-a)*(1-tx)+(d-b)*tx];
  };
  const brush=[];let total=0;
  for(let y=-Math.ceil(radius);y<=radius;y++)for(let x=-Math.ceil(radius);x<=radius;x++){const weight=Math.max(0,1-Math.hypot(x,y)/radius);if(weight){brush.push([x,y,weight]);total+=weight;}}
  for(const p of brush)p[2]/=total;
  for(let drop=0;drop<drops;drop++){
    let x=random()*w,y=4+random()*(h-9),vx=0,vy=0,speed=1,water=1,sediment=0;
    if(read(Math.floor(x),Math.floor(y))<.008)continue;
    for(let step=0;step<60;step++){
      const old=sample(x,y),ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
      vx=vx*.13-old[1]*.87;vy=vy*.13-old[2]*.87;
      const length=Math.hypot(vx,vy);if(length<1e-9)break;
      vx/=length;vy/=length;
      x=(x+vx+w)%w;y+=vy;
      if(y<4||y>h-5)break;
      const next=sample(x,y),delta=next[0]-old[0];
      const capacity=Math.max(.00003,-delta*speed*water*5);
      if(delta>0||sediment>capacity){
        const amount=delta>0?Math.min(delta,sediment):(sediment-capacity)*.25;
        sediment-=amount;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)heights[(iy+dy)*w+(ix+dx)%w]+=amount*(dx?tx:1-tx)*(dy?ty:1-ty);
      }else{
        const amount=Math.min((capacity-sediment)*.28,-delta);
        for(const [dx,dy,weight] of brush){const i=(iy+dy)*w+(ix+dx+w)%w;const removed=Math.min(Math.max(0,heights[i]-.003),amount*weight);heights[i]-=removed;sediment+=removed;}
      }
      speed=Math.sqrt(Math.max(.01,speed*speed-delta*5));water*=.975;
      if(next[0]<.003)break;
    }
  }
}

export function generateLandform({width=768,height=432,seed=27,erosion=180000,original=true}={}) {
  const mask=sourceMask(width,height);
  if(!original)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const a=x/width*Math.PI*2,b=y/(height-1)*Math.PI,px=Math.cos(a)*Math.sin(b),py=Math.sin(a)*Math.sin(b),pz=Math.cos(b);
    const continent=gradientNoise(px*1.8,py*1.8,pz*1.8,seed)+gradientNoise(px*4.7,py*4.7,pz*4.7,seed)*.3;
    mask[y*width+x]=continent>.02?1:0;
  }
  const distance=distanceField(mask,width,height);
  let edgeField=Float32Array.from(distance,(d,i)=>mask[i]?d:-d);
  for(let pass=0;pass<3;pass++){
    const next=edgeField.slice();
    for(let y=1;y<height-1;y++)for(let x=0;x<width;x++){const i=y*width+x;next[i]=(edgeField[i]*4+edgeField[i-width]+edgeField[i+width]+edgeField[y*width+(x+1)%width]+edgeField[y*width+(x+width-1)%width])/8;}
    edgeField=next;
  }
  const heights=new Float32Array(mask.length),biomes=new Uint8Array(mask.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,u=x/width,v=y/(height-1),angle=u*Math.PI*2;
    const px=Math.cos(angle)*.4,py=Math.sin(angle)*.4,pz=v*1.4;
    const n=(f,offset=0)=>gradientNoise(px*f+offset,py*f,pz*f,seed);
    const variation=n(9),signed=edgeField[i]+n(35)*width*.005+n(115)*width*.0008;
    const inland=1-Math.exp(-Math.max(0,signed)/(width*.012));
    const bend=n(5)*.045+n(12)*.014;
    const band=original?Math.max(Math.exp(-(((v-.095-bend)/.087)**2)),Math.exp(-(((v-.925-bend)/.078)**2))):Math.max(0,.25+n(5)*1.3);
    let ridge=0,gain=.55,weight=1;
    const warp=n(7)*1.7;
    for(let octave=0,f=22;octave<5;octave++,f*=2.13){
      const value=1-Math.abs(gradientNoise(px*f+warp,py*f-warp,pz*f+warp,seed+octave*173));
      const signal=value*value*weight;ridge+=signal*gain;weight=Math.min(1,signal*1.6);gain*=.49;
    }
    const hills=(n(24)*.5+n(53)*.2+.45)*.075;
    const mountain=band*(.08+ridge*.64)*(.65+variation*.55);
    const r=Math.hypot((u-.085)*1.78,v-.87);
    const volcano=original?Math.max(0,.46*Math.exp(-r*41)-.39*Math.exp(-r*r/.000055)):0;
    const shelf=width*(.021+n(9)*.013),oceanDepth=.28+n(4)*.12+n(17)*.025;
    heights[i]=signed>0?(.018+hills+mountain+volcano)*inland:-.004-(1-Math.exp(signed/shelf))*oceanDepth;
    const edge=variation*.07+n(42)*.012;
    if(original&&signed>0)biomes[i]=v<.21+edge?1:v<.43+edge&&u<.35+edge?3:u>.60+edge&&v<.73?4:v>.73+edge&&u>.36+edge?1:2;
    if(original&&signed>0&&r<.065+n(42)*.008)biomes[i]=5;
  }
  if(erosion)erode(heights,width,height,seed,erosion);
  const cap=Math.ceil(height*.025);
  for(let offset=1;offset<cap;offset++)for(const y of [offset,height-1-offset]){
    let mean=0;for(let x=0;x<width;x++)mean+=heights[y*width+x]/width;
    const t=offset/cap,blend=t*t*(3-2*t);for(let x=0;x<width;x++)heights[y*width+x]=mean+(heights[y*width+x]-mean)*blend;
  }
  for(const y of [0,height-1]){
    let mean=0;for(let x=0;x<width;x++)mean+=heights[y*width+x]/width;
    for(let x=0;x<width;x++){heights[y*width+x]=mean;biomes[y*width+x]=0;}
  }
  return {width,height,heights:Array.from(heights,v=>Math.round(v*100000)/100000),biomes:Array.from(biomes)};
}
