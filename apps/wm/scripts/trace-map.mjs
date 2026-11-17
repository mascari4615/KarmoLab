import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';

const image = PNG.sync.read(readFileSync(new URL('../public/reference/original-map.png', import.meta.url)));
const { width, height, data } = image;
const ocean = (x, y) => {
  const p = (y * width + x) * 4;
  return data[p] === 48 && data[p + 1] === 96 && data[p + 2] === 130;
};
const black = (x, y) => data[(y * width + x) * 4] === 0;
const land = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
  if (!black(x, y)) return !ocean(x, y);
  // 원본의 검은 해안선도 육지 경계에 포함
  return true;
}));
const edges = new Map();
const add = (a, b) => { const key = a.join(','); if (!edges.has(key)) edges.set(key, []); edges.get(key).push(b); };
const filled = (x, y) => y >= 0 && y < height && x >= 0 && x < width && land[y][x];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (!filled(x, y)) continue;
  if (!filled(x, y - 1)) add([x, y], [x + 1, y]);
  if (!filled(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
  if (!filled(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
  if (!filled(x - 1, y)) add([x, y + 1], [x, y]);
}
const rings = [];
while (edges.size) {
  const first = edges.keys().next().value;
  const start = first.split(',').map(Number);
  const ring = [start];
  let point = start;
  for (let i = 0; i < width * height * 4; i++) {
    const key = point.join(',');
    const choices = edges.get(key);
    if (!choices?.length) break;
    point = choices.pop();
    if (!choices.length) edges.delete(key);
    if (point[0] === start[0] && point[1] === start[1]) break;
    ring.push(point);
  }
  if (ring.length > 3) rings.push(ring.map(([x, y]) => [x / width, y / height]));
}
const palette = { '75,105,47': 1, '82,75,36': 2, '138,111,48': 3, '50,60,57': 4, '99,155,255': 5 };
const biomes = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
  const p = (y * width + x) * 4;
  return palette[`${data[p]},${data[p + 1]},${data[p + 2]}`] || 0;
}).join(''));
mkdirSync(new URL('../src/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/geography.json', import.meta.url), JSON.stringify({ width, height, rings, biomes, land: land.map(row => row.map(value => value ? '1' : '0').join('')) }));
console.log(`Traced ${rings.length} coastal rings from ${width} × ${height} source`);
