import { createWorld } from './terrain.mjs';
import { gradientNoise, erode } from './landform.mjs';
import { spherePoint, clamp } from './world.mjs';
import {prepareTerrainSource,sampleTerrainSource,alpinePatch} from './terrain-source.mjs';

const continents=[
 [[.16,.25],[.185,.21],[.215,.22],[.23,.18],[.27,.16],[.29,.19],[.34,.17],[.37,.20],[.38,.25],[.34,.27],[.355,.31],[.40,.32],[.415,.36],[.386,.40],[.35,.39],[.32,.42],[.34,.46],[.35,.51],[.31,.52],[.28,.56],[.275,.61],[.29,.66],[.26,.71],[.23,.72],[.21,.65],[.205,.59],[.18,.55],[.17,.48],[.18,.44],[.165,.39],[.15,.35],[.14,.30]],
 [[.56,.36],[.60,.30],[.64,.33],[.68,.28],[.73,.31],[.75,.36],[.80,.38],[.82,.43],[.79,.47],[.75,.45],[.73,.49],[.78,.54],[.75,.58],[.72,.57],[.69,.64],[.64,.66],[.61,.61],[.60,.56],[.55,.55],[.53,.49],[.57,.45],[.54,.41]],
];
function coastDistance(u,v,points){
 let inside=false,distance=1;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [ax,ay]=points[j],[bx,by]=points[i],dx=bx-ax,dy=by-ay,t=clamp(((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy),0,1);
  distance=Math.min(distance,Math.hypot(u-ax-t*dx,v-ay-t*dy));
  if((ay>v)!==(by>v)&&u<(bx-ax)*(v-ay)/(by-ay)+ax)inside=!inside;
 }
 return (inside?distance:-distance)/.13;
}

// 정본 운도와 독립된 지형 제작 예제
export async function createSampleWorld(seed=8147){
  const world=createWorld({blank:true,name:'지형 실험 행성',seed});
  world.terrainSource='alpine-v1';world.snowLevel=.075;await prepareTerrainSource(world);
  const width=1536,height=768,heights=new Float32Array(width*height),biomes=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/(height-1),p=spherePoint(u,v),n=(f,offset=0)=>gradientNoise(p[0]*f,p[1]*f,p[2]*f,seed+offset);
    const warpU=n(3)*.012,warpV=n(4,31)*.016,a=u+warpU,b=v+warpV;
    let continent=Math.max(...continents.map(points=>coastDistance(a,b,points)));
    continent+=n(13)*.07+n(39)*.025+n(105)*.012;
    const inland=clamp(continent*5,0,1),westArc=.208+.027*Math.sin(v*13),eastArc=.65+.038*Math.sin(v*10);
    const belt=Math.max(Math.exp(-(((u-westArc)/.019)**2))*Math.exp(-(((v-.40)/.23)**4)),Math.exp(-(((u-eastArc)/.024)**2))*Math.exp(-(((v-.49)/.19)**4)));
    let ridges=0,gain=.5;
    for(let octave=0,f=22;octave<5;octave++,f*=2.07){ridges+=(1-Math.abs(n(f,octave*137)))**3*gain;gain*=.5;}
    const plateau=.12*Math.exp(-(((u-.28)/.047)**4)-((v-.46)/.10)**4);
    let h=continent>0?inland*(.008+Math.max(0,n(20))*.025+plateau+belt*(.12+ridges*.48)*clamp(.72+n(7,414)*.9,.25,1.3)):-.009-(1-Math.exp(continent*6))*(.30+n(5)*.06);
    let volcanic=0;
    // 원래 해저에 더해지는 화산호와 분화구. 먼 바다의 깊이는 보존
    for(let island=0;island<7;island++){
      const cx=.43+island*.017,cy=.57+Math.sin(island*.6)*.047,r=Math.hypot((u-cx)*2,v-cy),radius=.009+island*.0005;
      const cone=Math.exp(-r*r/(radius*radius*1.5)),crater=Math.exp(-r*r/(radius*radius*.055));
      h+=.58*cone-.20*crater;volcanic=Math.max(volcanic,Math.exp(-r*r/(radius*radius*.35)));
    }
    heights[y*width+x]=clamp(h,-1,1);
    if(h>0)biomes[y*width+x]=volcanic>.12?5:0;
  }
  erode(heights,width,height,seed,420000);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(heights[i]>0)heights[i]*=.32;
    const source=sampleTerrainSource(world,x/width,y/(height-1),Math.PI*2/width);
    if(source)heights[i]+=(source.height-heights[i])*source.weight;
  }
  for(const y of [0,height-1])for(let x=0;x<width;x++){heights[y*width+x]=-.25;biomes[y*width+x]=0;}
  Object.assign(world,{id:'sample-8147-v5',regionalDetail:true,star:'샘플 항성',moon:'',sunU:.23,sunV:.5,width,height,clouds:.4,heights:Array.from(heights,h=>Math.round(h*100000)/100000),biomes:Array.from(biomes)});
  world.places=[
    ['alpine','상세 산악 지역','mountain',alpinePatch.u,alpinePatch.v,'연결된 능선과 빙하곡을 살펴보는 상세 지형. 공개 고도 수치자료를 재구성했으며, 높이와 생물군계를 직접 편집할 수 있습니다.'],
    ['folds','서부 습곡산맥','mountain',.194,.40,'길게 이어진 산맥과 침식 골짜기. 확대하면 능선의 작은 굴곡을 살펴볼 수 있습니다.'],
    ['plateau','중앙 고원','desert',.28,.46,'산맥 동쪽의 건조한 고원. 주변 저지대와 높이 차이를 비교하는 지형 예제입니다.'],
    ['forest','서쪽 숲','forest',.18,.30,'해안과 산맥 사이의 숲 지대. 지형과 생물군계를 각각 편집할 수 있습니다.'],
    ['islands','화산 열도','volcano',.481,.6167,'일곱 화산이 호를 이루는 바다. 원뿔 지형과 정상 분화구를 가까이에서 확인할 수 있습니다.'],
    ['ice','밤쪽 빙설 대륙','ice',.67,.49,'항성 반대쪽의 대륙. 표시 설정에서 낮과 밤을 끄면 어두운 면의 지형을 살펴볼 수 있습니다.'],
  ].map(([id,name,type,x,y,text])=>({id,name,type,x,y,text,area:'샘플 지형',source:id==='alpine'?'Mapzen, Copernicus EU-DEM 고도 자료 재구성. 운도의 세계관 설정과 무관.':'절차 생성 예제. 운도의 세계관 설정과 무관.',featured:true,viewSpan:id==='alpine'?.0004:type==='volcano'?.025:type==='ice'?.12:.045}));
  return world;
}
