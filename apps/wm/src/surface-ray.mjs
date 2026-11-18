import { sphereUV } from './world.mjs';

export function intersectSurface(origin,direction,world,heightAt){
  const b=origin.reduce((sum,n,i)=>sum+n*direction[i],0),length2=origin.reduce((sum,n)=>sum+n*n,0);
  const radius=1+(1-world.seaLevel)*.008*world.relief,outer=b*b-length2+radius*radius;
  if(outer<0)return null;
  const inner=b*b-length2+1,near=Math.max(0,-b-Math.sqrt(outer)),far=inner>0?-b-Math.sqrt(inner):-b+Math.sqrt(outer);
  if(far<near)return null;
  const point=t=>origin.map((n,i)=>n+direction[i]*t);
  const distance=t=>{const p=point(t),uv=sphereUV(p);return Math.hypot(...p)-(1+Math.max(0,heightAt(...uv)-world.seaLevel)*.008*world.relief);};
  if(distance(near)<=0)return sphereUV(point(near));
  let previous=near;
  for(let step=1;step<=128;step++){
    const t=near+(far-near)*step/128;
    if(distance(t)<=1e-10){
      let low=previous,high=t;
      for(let i=0;i<14;i++){const middle=(low+high)/2;if(distance(middle)>0)low=middle;else high=middle;}
      return sphereUV(point((low+high)/2));
    }
    previous=t;
  }
  return null;
}
