import { biomeAt, noise, BIOMES } from './terrain.mjs';
import { spherePoint, clamp } from './world.mjs';
import { sampleDetail } from './detail.mjs';
import { sourcePosition } from './terrain-source.mjs';
import {sampleClimateColor} from './sample-climate.mjs';
const palette = { forest: [84,115,84], grass: [159,172,125], desert: [211,187,140], ice: [207,224,224], volcano: [111,100,86] };
function colorField(world) {
  const w=world.width,h=world.height;let values=new Float32Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,type=BIOMES[world.biomes[i]]||'auto';
    let color=palette[type]||palette[biomeAt(world,x/w,y/(h-1),Math.max(world.seaLevel+.001,world.heights[i]))];
    if(type==='auto'&&world.terrainSource==='alpine-v1'){const p=spherePoint(x/w,y/(h-1)),sun=spherePoint(world.sunU,world.sunV),heat=p.reduce((sum,n,j)=>sum+n*sun[j],0)-Math.max(0,world.heights[i])*.35;color=sampleClimateColor(world,x/w,y/(h-1),world.heights[i],heat);}
    values.set(color,i*3);
  }
  const radius=Math.max(1,Math.round(w/200));
  for(let pass=0;pass<2;pass++){
    const next=new Float32Array(values.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
      let sum=0;
      for(let d=-radius;d<=radius;d++){const i=pass===0?y*w+(x+d+w)%w:Math.max(0,Math.min(h-1,y+d))*w+x;sum+=values[i*3+c];}
      next[(y*w+x)*3+c]=sum/(radius*2+1);
    }
    values=next;
  }
  return values;
}
function biomeColor(world, colors, u, v) {
  const px = u * world.width, py = v * (world.height - 1), x = Math.floor(px), y = Math.floor(py), tx = px - x, ty = py - y;
  const result = [0,0,0];
  for (let b = 0; b <= 1; b++) for (let a = 0; a <= 1; a++) {
    const index = Math.min(world.height - 1, y + b) * world.width + (x + a) % world.width;
    const weight = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
    for (let c = 0; c < 3; c++) result[c] += colors[index*3+c] * weight;
  }
  return result;
}
export function reliefPixels(world, width, height, {terrainShading=true}={},region={u:0,v:0,w:1,h:1}) {
  const result = new Uint8ClampedArray(width * height * 4), elevations = new Float32Array(width * height), colors=colorField(world);
  const detailBiomes=new Uint8Array(width*height),footprint=Math.max(region.w*Math.PI*2/width,region.h*Math.PI/height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value=sampleDetail(world,region.u+x/(width-1)*region.w,region.v+y/(height-1)*region.h,footprint);
    elevations[y * width + x] = value.height;detailBiomes[y*width+x]=value.biome;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, h = elevations[i], base = h; let color;
    if (base <= world.seaLevel) {
      const shelf = Math.exp((base - world.seaLevel) * 25), deep = [34,72,87], shallow = [69,123,128];
      color = deep.map((c, j) => c + (shallow[j] - c) * shelf);
    } else {
      const u=region.u+x/(width-1)*region.w,v=region.v+y/(height-1)*region.h; color = biomeColor(world, colors, u, v);
      const biome=detailBiomes[i]-1;if(biome===6){const t=clamp((h-.035)/.03,0,1),weight=sourcePosition(world,u,v)?.weight||0;color=color.map((base,j)=>base+([59,79,56][j]+([110,117,79][j]-[59,79,56][j])*t*t*(3-2*t)-base)*weight);}
      else if(biome>0)color=[...palette[BIOMES[biome]]];
      else if(biome===0){const p=spherePoint(u,v),s=spherePoint(world.sunU,world.sunV),heat=p.reduce((sum,n,j)=>sum+n*s[j],0)-Math.max(0,h)*.35;color=[...palette[heat<-.15?'ice':heat>.7?'desert':heat>.2?'grass':'forest']];}
      if(biome===0&&world.terrainSource==='alpine-v1'){const p=spherePoint(u,v),s=spherePoint(world.sunU,world.sunV),heat=p.reduce((sum,n,j)=>sum+n*s[j],0)-Math.max(0,h)*.35;color=sampleClimateColor(world,u,v,h,heat);}
      const dx = (elevations[y * width + Math.min(width-1,x+1)] - elevations[y * width + Math.max(0,x-1)]) * width/region.w * .04/(4*Math.PI*Math.max(.05,Math.sin(v*Math.PI)));
      const dy = (elevations[Math.min(height - 1, y + 1) * width + x] - elevations[Math.max(0, y - 1) * width + x]) * height/region.h * .04/(2*Math.PI);
      const shade = clamp((.85 - dx * .46 - dy * .56) / Math.sqrt(1 + dx * dx + dy * dy), -.4, 1);
      const rock = clamp((h - world.seaLevel - .13) * 4.5, 0, .85), snow = clamp((h - world.seaLevel - (world.snowLevel??.38)) * 28, 0, .9), coast = Math.exp(-(base - world.seaLevel) * 240);
      const p=spherePoint(u,v), variation=noise(p[0]*28,p[1]*28,p[2]*28,world.seed)-.5;
      const grain = noise(x * 1.7, y * 1.7, 8, world.seed) - .5;
      color = color.map((c, j) => { c += ([169,157,134][j] - c) * rock; c += ([235,235,224][j] - c) * snow; c += ([197,187,143][j] - c) * coast; return c * ((terrainShading ? .76+shade*.29 : .95)+variation*.13) + grain * 2; });
    }
    result[i * 4] = color[0]; result[i * 4 + 1] = color[1]; result[i * 4 + 2] = color[2]; result[i * 4 + 3] = 255;
  }
  return result;
}
export function drainage(world) {
  const flow = new Float32Array(world.heights.length).fill(1), downstream = new Int32Array(flow.length).fill(-1);
  const order = Array.from(world.heights.keys()).sort((a, b) => world.heights[b] - world.heights[a]), w = world.width, h = world.height;
  for (const i of order) {
    if (world.heights[i] <= world.seaLevel) continue;
    const x = i % w, y = Math.floor(i / w); let lowest = world.heights[i], target = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || y + dy < 0 || y + dy >= h) continue;
      const j = (y + dy) * w + (x + dx + w) % w;
      if (world.heights[j] < lowest) { lowest = world.heights[j]; target = j; }
    }
    downstream[i] = target; if (target >= 0) flow[target] += flow[i];
  }
  return order.filter(i => flow[i] > 10 && downstream[i] >= 0 && world.heights[i] > world.seaLevel).map(i => [i % w / w, Math.floor(i / w) / (h - 1), downstream[i] % w / w, Math.floor(downstream[i] / w) / (h - 1), Math.sqrt(flow[i])]);
}
