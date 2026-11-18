import {gradientNoise} from './landform.mjs';
import {spherePoint} from './world.mjs';

const smooth=(a,b,value)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
const weatherCache=new Map(),width=384,height=193;
function weatherAt(seed,u,v){
  let field=weatherCache.get(seed);
  if(!field){
    field=new Float32Array(width*height*2);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=spherePoint(x/width,y/(height-1)),n=(f,s)=>gradientNoise(p[0]*f,p[1]*f,p[2]*f,seed+s),i=(y*width+x)*2;
      field[i]=n(9,152)*.55+n(31,411)*.20+n(91,191)*.08;field[i+1]=.94+n(57,53)*.1;
    }
    weatherCache.set(seed,field);if(weatherCache.size>3)weatherCache.delete(weatherCache.keys().next().value);
  }
  const px=((u%1+1)%1)*width,py=Math.max(0,Math.min(1,v))*(height-1),x=Math.floor(px),y=Math.floor(py),a=px-x,b=py-y,result=[0,0];
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const at=(Math.min(height-1,y+j)*width+(x+i)%width)*2,w=(i?a:1-a)*(j?b:1-b);result[0]+=field[at]*w;result[1]+=field[at+1]*w;}
  return result;
}

// 독립 샘플의 연속 기후 색. 수동으로 칠한 생물군계는 호출부에서 우선
export function sampleClimateColor(world,u,v,h,heat,out=[0,0,0]){
  const [weather,variation]=weatherAt(world.seed,u,v);
  const westArc=.208+.027*Math.sin(v*13);
  const shadow=smooth(westArc-.005,westArc+.065,u)*(1-smooth(.37,.46,u));
  const coast=1-smooth(.003,.025,h-world.seaLevel);
  const moisture=.64+weather+coast*.3-shadow*.45-smooth(.6,1,heat)*.12;
  const dry=1-smooth(.08,.38,moisture),forest=smooth(.38,.7,moisture),ice=1-smooth(-.3,-.05,heat);
  const rock=smooth(.025,.075,h-world.seaLevel)*.4;
  for(let i=0;i<3;i++){
    let c=[116,129,84][i]+([49,77,53][i]-[116,129,84][i])*forest;
    c+=([174,145,103][i]-c)*dry;
    c+=([132,128,114][i]-c)*rock;
    out[i]=(c+([198,217,222][i]-c)*ice)*variation;
  }
  return out;
}
