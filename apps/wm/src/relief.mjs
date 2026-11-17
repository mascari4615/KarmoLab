import { sampleSmoothHeight as sampleHeight, biomeAt, noise, BIOMES } from './terrain.mjs';
import { spherePoint, clamp } from './world.mjs';
const palette = { forest: [84,115,84], grass: [159,172,125], desert: [211,187,140], ice: [207,224,224], volcano: [111,100,86] };
function colorField(world) {
  const w=world.width,h=world.height;let values=new Float32Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,type=BIOMES[world.biomes[i]]||'auto';
    const color=palette[type]||palette[biomeAt(world,x/w,y/(h-1),Math.max(world.seaLevel+.001,world.heights[i]))];
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
export function reliefPixels(world, width, height) {
  const result = new Uint8ClampedArray(width * height * 4), elevations = new Float32Array(width * height), colors=colorField(world);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    elevations[y * width + x] = sampleHeight(world, x / width, y / (height - 1));
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, h = elevations[i], base = h; let color;
    if (base <= world.seaLevel) {
      const shelf = Math.exp((base - world.seaLevel) * 25), deep = [34,72,87], shallow = [69,123,128];
      color = deep.map((c, j) => c + (shallow[j] - c) * shelf);
    } else {
      const u = x / width, v = y / (height - 1); color = biomeColor(world, colors, u, v);
      const dx = (elevations[y * width + (x + 1) % width] - elevations[y * width + (x + width - 1) % width]) * width * .10;
      const dy = (elevations[Math.min(height - 1, y + 1) * width + x] - elevations[Math.max(0, y - 1) * width + x]) * height * .10;
      const shade = clamp((.85 - dx * .46 - dy * .56) / Math.sqrt(1 + dx * dx + dy * dy), -.4, 1);
      const rock = clamp((h - world.seaLevel - .13) * 4.5, 0, .85), snow = clamp((h - world.seaLevel - .38) * 9, 0, .9), coast = Math.exp(-(base - world.seaLevel) * 240);
      const p=spherePoint(u,v), variation=noise(p[0]*28,p[1]*28,p[2]*28,world.seed)-.5;
      const grain = noise(x * 1.7, y * 1.7, 8, world.seed) - .5;
      color = color.map((c, j) => { c += ([169,157,134][j] - c) * rock; c += ([235,235,224][j] - c) * snow; c += ([197,187,143][j] - c) * coast; return c * (.76 + shade * .29+variation*.13) + grain * 2; });
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
