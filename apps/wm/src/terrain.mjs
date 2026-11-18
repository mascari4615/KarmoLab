import { sourceMask } from './source-coasts.mjs';
import {validateLore} from './lore.mjs';
import { makeRidges } from './ridges.mjs';
import { places, spherePoint, sphereUV, clamp, typeNames } from './world.mjs';

export const GRID_W = 256, GRID_H = 144;
export const BIOMES = ['auto', 'forest', 'grass', 'desert', 'ice', 'volcano'];
export function noise(x, y, z, seed = 19) {
  const hash = (a, b, c) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647) ^ seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz; fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy); fz *= fz * (3 - 2 * fz);
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy), mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
export function fractal(x, y, z, seed = 19) {
  let sum = 0, gain = .55, scale = 1;
  for (let i = 0; i < 5; i++) { sum += noise(x * scale, y * scale, z * scale, seed) * gain; gain *= .5; scale *= 2.03; }
  return sum;
}
const copy = value => JSON.parse(JSON.stringify(value));
function coastDistances(mask) {
  const distances = new Float32Array(mask.length).fill(100), queue = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const i = y * GRID_W + x;
    if (mask[i] !== mask[y * GRID_W + (x + 1) % GRID_W] || mask[i] !== mask[Math.min(GRID_H - 1, y + 1) * GRID_W + x]) { distances[i] = .5; queue.push(i); }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % GRID_W, y = Math.floor(i / GRID_W);
    for (const j of [y * GRID_W + (x + 1) % GRID_W, y * GRID_W + (x + GRID_W - 1) % GRID_W, Math.max(0, y - 1) * GRID_W + x, Math.min(GRID_H - 1, y + 1) * GRID_W + x]) {
      if (distances[j] > distances[i] + 1) { distances[j] = distances[i] + 1; queue.push(j); }
    }
  }
  return distances;
}
export function createWorld({ name = '새 행성', seed = 27, original = false, blank = false } = {}) {
  const heights = [], biomes = [];
  const originalMask = original ? sourceMask(GRID_W, GRID_H) : null;
  const coast = original ? coastDistances(originalMask) : null;
  const ridgeHeight = original ? makeRidges(seed) : null;
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const u = x / GRID_W, v = y / (GRID_H - 1), point = spherePoint(u, v);
    const elevation = fractal(...point.map(p => p * 4.1), seed);
    let h = blank ? -.25 : (elevation - .52) * 2;
    let biome = 0;
    if (original) {
      const land = originalMask[y * GRID_W + x] === 1;
      const inland = 1 - Math.exp(-coast[y * GRID_W + x] * .23);
      const mountains = ridgeHeight(u,v);
      const r = Math.hypot((u-.08)*1.78,v-.87);
      const volcano = .7*Math.exp(-r*30)-.52*Math.exp(-r*r/.0001);
      h = land ? (.035 + elevation * .065 + mountains + Math.max(0,volcano)) * inland : -.025 - inland * .31;
      const edge = (noise(u * 23, v * 17, 5, seed) - .5) * .07;
      if (land) biome = v < .18 + edge ? 1 : v < .4 && u < .35 ? 3 : u > .60 + edge && v < .72 ? 4 : v > .72 + edge && u > .36 + edge ? 1 : 2;
      if (land && ((u - .08) / .11) ** 2 + ((v - .87) / .12) ** 2 < 1 + edge * 4) biome = 5;
    }
    heights.push(h); biomes.push(biome);
  }
  // 원본 해안의 픽셀 계단을 연속 높이로 보간
  if (original) for (let pass = 0; pass < 1; pass++) {
    const previous = [...heights];
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      heights[i] = (previous[i] * 4 + previous[y * GRID_W + (x + 1) % GRID_W] + previous[y * GRID_W + (x - 1 + GRID_W) % GRID_W] + previous[i - GRID_W] + previous[i + GRID_W]) / 8;
    }
  }
  for (const y of [0, GRID_H - 1]) {
    const mean = heights.slice(y * GRID_W, (y + 1) * GRID_W).reduce((a, b) => a + b, 0) / GRID_W;
    for (let x = 0; x < GRID_W; x++) { heights[y * GRID_W + x] = mean; biomes[y * GRID_W + x] = 0; }
  }
  return { schema: 'wm-world', version: 1, id: original ? 'undo' : `world-${Date.now()}-${seed}`, name: original ? '운도' : name, seed, star: original ? '가마' : '항성', moon: original ? '한울' : '', tidalLocked: true, sunU: .18, sunV: .5, seaLevel: 0, relief: 1, clouds: .55, width: GRID_W, height: GRID_H, heights: heights.map(h => Math.round(h * 10000) / 10000), biomes, places: original ? copy(places) : [] };
}
export function sampleHeight(world, u, v) {
  u = ((u % 1) + 1) % 1; v = clamp(v, 0, 1);
  if (v === 0) return world.heights[0];
  if (v === 1) return world.heights[(world.height - 1) * world.width];
  const px = u * world.width, py = v * (world.height - 1), x = Math.floor(px), y = Math.floor(py), tx = px - x, ty = py - y;
  const at = (a, b) => world.heights[Math.min(world.height - 1, b) * world.width + (a % world.width)];
  return (at(x, y) * (1 - tx) + at(x + 1, y) * tx) * (1 - ty) + (at(x, y + 1) * (1 - tx) + at(x + 1, y + 1) * tx) * ty;
}
export function climate(world, u, v) {
  const p = spherePoint(u, v), sun = spherePoint(world.sunU, world.sunV);
  return p.reduce((sum, value, i) => sum + value * sun[i], 0);
}
export function sampleFilteredHeight(world,u,v){
  u=(u%1+1)%1;v=clamp(v,0,1);const px=u*world.width,py=v*(world.height-1),x=Math.floor(px),y=Math.floor(py),a=px-x,b=py-y;
  const weights=t=>[(1-t)**3/6,(4-6*t*t+3*t*t*t)/6,(1+3*t+3*t*t-3*t*t*t)/6,t*t*t/6],wx=weights(a),wy=weights(b);let result=0;
  for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)result+=world.heights[clamp(y+dy-1,0,world.height-1)*world.width+(x+dx-1+world.width)%world.width]*wx[dx]*wy[dy];
  const t=clamp(Math.min(v,1-v)/.06,0,1),blend=t*t*(3-2*t),pole=world.heights[v<.5?0:(world.height-1)*world.width];return pole+(result-pole)*blend;
}
export function sampleSmoothHeight(world, u, v) {
  const px = ((u % 1 + 1) % 1) * world.width, py = clamp(v, 0, 1) * (world.height - 1), x = Math.floor(px), y = Math.floor(py);
  const tx = px - x, ty = py - y;
  const at = (a, b) => world.heights[clamp(b, 0, world.height - 1) * world.width + (a + world.width) % world.width];
  const cubic = (a,b,c,d,t) => b + .5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
  const row = b => cubic(at(x-1,b),at(x,b),at(x+1,b),at(x+2,b),tx);
  return clamp(cubic(row(y-1),row(y),row(y+1),row(y+2),ty),-1,1);
}
export function biomeAt(world, u, v, elevation = sampleHeight(world, u, v)) {
  const x = Math.floor(((u % 1 + 1) % 1) * world.width), y = Math.round(clamp(v, 0, 1) * (world.height - 1));
  const manual = world.biomes[y * world.width + x];
  if (elevation <= world.seaLevel) return 'sea';
  if (manual) return BIOMES[manual];
  const heat = climate(world, u, v) - Math.max(0, elevation) * .35;
  if (heat < -.15) return 'ice';
  if (heat > .7) return 'desert';
  return heat > .2 ? 'grass' : 'forest';
}
export const colors = { sea: [19, 67, 85], forest: [48, 85, 51], grass: [112, 127, 68], desert: [184, 143, 86], ice: [190, 213, 213], volcano: [75, 65, 57] };
export function surfaceColor(world, u, v, height, cachedGrain) {
  const biome = biomeAt(world, u, v, height), color = [...colors[biome]];
  const grain = cachedGrain ?? fractal(...spherePoint(u, v).map(p => p * 35), world.seed);
  let factor = .78 + grain * .45;
  if (biome === 'sea') {
    const shore = Math.exp(-Math.abs(height - world.seaLevel) * 22);
    return [19 + shore * 24, 54 + shore * 57, 73 + shore * 51];
  }
  if (height > .36 && biome !== 'ice') { const rock = clamp((height - .36) * 3, 0, .75); for (let i = 0; i < 3; i++) color[i] += ([160, 157, 139][i] - color[i]) * rock; }
  if (height < world.seaLevel + .055) {
    const beach = 1 - clamp((height - world.seaLevel) / .055, 0, 1);
    const shore = [137, 145, 117];
    for (let i = 0; i < 3; i++) color[i] += (shore[i] - color[i]) * beach;
  }
  return color.map(c => clamp(c * factor, 0, 255));
}
const brushGrids = new Map();
const paintHistory=new WeakMap();
export function paintedRows(world,since=-1){
  const history=paintHistory.get(world)||[],revision=history.at(-1)?.revision||0;
  if(since<0||(history.length&&since<history[0].revision-1))return{top:0,bottom:world.height-1,revision};
  let top=world.height,bottom=-1;for(const change of history)if(change.revision>since){top=Math.min(top,change.top);bottom=Math.max(bottom,change.bottom);}
  return{top:Math.max(0,top-1),bottom:Math.min(world.height-1,bottom+1),revision};
}
export function strokePoints(from, to, radius) {
  if (!from) return [to];
  const a = spherePoint(...from), b = spherePoint(...to);
  const angle = Math.acos(clamp(a.reduce((sum, value, i) => sum + value * b[i], 0), -1, 1));
  const steps = Math.min(64, Math.max(1, Math.ceil(angle / (radius * Math.PI * .35))));
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    return sphereUV(a.map((value, j) => value * (1 - t) + b[j] * t));
  });
}
export function paint(world, u, v, tool, radius, strength) {
  if((world.detailStrokes?.length||0)>=20000)throw new Error('상세 편집 기록 한도에 도달했어요. 실행 취소 후 다시 그리거나 JSON으로 작업을 보관해 주세요.');
  if(world.terrainSource&&(tool==='raise'||tool==='lower')&&!world.detailBaseHeights){world.detailBaseHeights=world.heights.slice();world.detailStrokes??=[];}
  if(radius<1/world.height){
    if(!['raise','lower',...BIOMES].includes(tool))return false;
    if((tool==='raise'||tool==='lower')&&!world.detailBaseHeights)world.detailBaseHeights=world.heights.slice();
    world.detailStrokes??=[];
    world.detailStrokes.push({u:(u%1+1)%1,v:clamp(v,0,1),tool,radius,strength});return true;
  }
  if(world.detailBaseHeights&&(tool==='raise'||tool==='lower'))world.detailStrokes.push({u:(u%1+1)%1,v:clamp(v,0,1),tool,radius,strength});
  if((world.detailStrokes?.length||world.terrainSource)&&BIOMES.includes(tool)){world.detailStrokes??=[];world.detailStrokes.push({u:(u%1+1)%1,v:clamp(v,0,1),tool,radius,strength});}
  const brushPoint = spherePoint(u, v); let changed = false;
  const radiusRadians = radius * Math.PI;
  const gridKey = `${world.width}:${world.height}`;
  if (!brushGrids.has(gridKey)) {
    const longitude=Array.from({length:world.width},(_,x)=>[Math.cos(x/world.width*Math.PI*2),Math.sin(x/world.width*Math.PI*2)]);
    const latitude=Array.from({length:world.height},(_,y)=>[Math.cos(y/(world.height-1)*Math.PI),Math.sin(y/(world.height-1)*Math.PI)]);
    brushGrids.set(gridKey, {longitude,latitude});
  }
  const {longitude,latitude} = brushGrids.get(gridKey), threshold = Math.cos(radiusRadians);
  const top=Math.max(0,Math.floor((v-radius)*(world.height-1))),bottom=Math.min(world.height-1,Math.ceil((v+radius)*(world.height-1)));
  const centerSin=Math.sin(v*Math.PI),centerCos=Math.cos(v*Math.PI);
  for (let y = top; y <= bottom; y++) {
    const [cy,sy]=latitude[y],denominator=sy*centerSin;
    const limit=denominator>1e-12?(threshold-cy*centerCos)/denominator:-1;
    if(limit>1)continue;
    const halfWidth=limit<=-1?.5:Math.acos(limit)/(Math.PI*2);
    const first=Math.ceil((u-halfWidth)*world.width),last=Math.min(first+world.width-1,Math.floor((u+halfWidth)*world.width));
    for(let column=first;column<=last;column++){
    const x=(column%world.width+world.width)%world.width,[cx,sx]=longitude[x];
    const dot = -cx*sy*brushPoint[0]+cy*brushPoint[1]+sx*sy*brushPoint[2];
    if (dot < threshold) continue;
    const distance = Math.acos(clamp(dot, -1, 1));
    const weight = (1 - distance / radiusRadians) ** 2, index = y * world.width + x;
    if (tool === 'raise' || tool === 'lower') world.heights[index] = Math.round(clamp(world.heights[index] + (tool === 'raise' ? 1 : -1) * strength * weight, -1, 1) * 10000) / 10000;
    else if (BIOMES.includes(tool)) world.biomes[index] = BIOMES.indexOf(tool);
    changed = true;
    }
  }
  if(changed){const history=paintHistory.get(world)||[];history.push({revision:(history.at(-1)?.revision||0)+1,top,bottom});if(history.length>64)history.shift();paintHistory.set(world,history);}
  return changed;
}
export function validateWorld(input) {
  if (!input || input.schema !== 'wm-world' || input.version !== 1) throw new Error('지원하지 않는 세계 파일입니다.');
  if (![[256,144],[768,432],[1536,768]].some(([w,h])=>input.width===w&&input.height===h)) throw new Error('세계 데이터의 격자 크기가 맞지 않습니다.');
  const count = input.width * input.height;
  if(input.terrainSource!==undefined&&input.terrainSource!=='alpine-v1')throw new Error('지원하지 않는 상세 고도 자료입니다.');
  if(input.snowLevel!==undefined&&(!Number.isFinite(input.snowLevel)||input.snowLevel<.01||input.snowLevel>1))throw new Error('설선 높이가 올바르지 않습니다.');
  if(input.detailBaseHeights!==undefined&&(!Array.isArray(input.detailBaseHeights)||input.detailBaseHeights.length!==count||!input.detailBaseHeights.every(h=>Number.isFinite(h)&&h>=-1&&h<=1)))throw new Error('상세 편집의 원본 높이 데이터가 손상되었습니다.');
  if(input.regionalDetail!==undefined&&typeof input.regionalDetail!=='boolean')throw new Error('지역 지형 설정이 올바르지 않습니다.');
  if(input.detailStrokes!==undefined&&(!Array.isArray(input.detailStrokes)||input.detailStrokes.length>20000||!input.detailStrokes.every(s=>s&&Number.isFinite(s.u)&&s.u>=0&&s.u<=1&&Number.isFinite(s.v)&&s.v>=0&&s.v<=1&&Number.isFinite(s.radius)&&s.radius>=.00001&&s.radius<=.15&&Number.isFinite(s.strength)&&s.strength>=0&&s.strength<=.3&&['raise','lower',...BIOMES].includes(s.tool))))throw new Error('상세 지형 편집 데이터가 올바르지 않습니다.');
  if (!Array.isArray(input.heights) || input.heights.length !== count || !input.heights.every(h => Number.isFinite(h) && h >= -1 && h <= 1)) throw new Error('지형 높이 데이터가 손상되었습니다.');
  if (!Array.isArray(input.biomes) || input.biomes.length !== count || !input.biomes.every(b => Number.isInteger(b) && b >= 0 && b < BIOMES.length)) throw new Error('지형 종류 데이터가 손상되었습니다.');
  if (typeof input.name !== 'string' || input.name.length > 100 || !input.name.trim()) throw new Error('행성 이름을 확인해 주세요.');
  for (const key of ['sunU', 'sunV', 'seaLevel', 'relief', 'clouds', 'seed']) if (!Number.isFinite(input[key])) throw new Error('행성 설정이 올바르지 않습니다.');
  if (input.sunU < 0 || input.sunU > 1 || input.sunV < 0 || input.sunV > 1 || input.relief < .1 || input.relief > 3 || input.clouds < 0 || input.clouds > 1 || Math.abs(input.seaLevel) > .5) throw new Error('행성 설정 범위를 벗어났습니다.');
  if (!Array.isArray(input.places) || input.places.length > 1000 || !input.places.every(p => typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= 100 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) throw new Error('장소 데이터가 올바르지 않습니다.');
  if (new Set(input.places.map(p => p.id)).size !== input.places.length) throw new Error('장소 ID가 중복되어 있습니다.');
  for (const place of input.places) {
    if (!Object.hasOwn(typeNames, place.type)) throw new Error('장소 분류를 확인해 주세요.');
    for (const key of ['area', 'text', 'source']) if (place[key] !== undefined && (typeof place[key] !== 'string' || place[key].length > (key==='text'?30000:5000))) throw new Error('장소 설명을 확인해 주세요.');
  }
  if (typeof input.star !== 'string' || input.star.length > 100 || typeof input.moon !== 'string' || input.moon.length > 100 || typeof input.id !== 'string' || input.id.length > 150 || input.tidalLocked !== true) throw new Error('천체 설정이 올바르지 않습니다.');
  for (const row of [0, input.height - 1]) if (input.heights.slice(row * input.width, (row + 1) * input.width).some(value => Math.abs(value - input.heights[row * input.width]) > .0001)) throw new Error('극점의 높이가 서로 다릅니다.');
  validateLore(input);return copy(input);
}
