import { gradientNoise } from './landform.mjs';
import { spherePoint } from './world.mjs';
export function weatherField(seed,width=1024,height=512){
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=spherePoint(x/width,y/(height-1));
  const wx=gradientNoise(p[0]*3,p[1]*3,p[2]*3,seed)*2,wy=gradientNoise(p[0]*3+17,p[1]*3,p[2]*3,seed)*2;
  const circulation=gradientNoise(p[0]*2.8+wx*.4,p[1]*2.8,p[2]*2.8-wy*.4,seed+73);
  let sum=0,gain=.48;
  for(let i=0,f=6;i<6;i++,f*=2.04){sum+=gradientNoise(p[0]*f+wx,p[1]*f*1.15+wy,p[2]*f-wx,seed+31)*gain;gain*=.53;}
  const density=Math.max(0,Math.min(1,.44+sum*.68+circulation*.24)),offset=(y*width+x)*4;data[offset]=Math.round(density*255);
  data[offset+1]=Math.round((.5+gradientNoise(p[0]*32,p[1]*32,p[2]*32,seed+139)*.5)*255);
  data[offset+2]=Math.round((.5+gradientNoise(p[0]*110,p[1]*110,p[2]*110,seed+241)*.5)*255);data[offset+3]=255;
 }
 return {width,height,data};
}
