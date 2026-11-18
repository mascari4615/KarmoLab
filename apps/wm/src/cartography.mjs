import { biomeAt, sampleHeight, noise } from './terrain.mjs';

const hash = (x, y, seed = 0) => {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};

// 연결된 등고선. 셀 테두리를 그리지 않아 확대 시 격자 노출 방지.
export function contourLines(values, columns, rows, level = 0) {
  const segments = [], adjacent = new Map();
  const add = (a, b) => {
    const index = segments.length; segments.push([a, b]);
    for (const p of [a, b]) { if (!adjacent.has(p.key)) adjacent.set(p.key, []); adjacent.get(p.key).push(index); }
  };
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < columns - 1; x++) {
    const i = y * columns + x, v = [values[i], values[i + 1], values[i + columns + 1], values[i + columns]];
    const points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], crossings = [];
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      if ((v[edge] > level) === (v[next] > level)) continue;
      const a = points[edge], b = points[next], t = (level - v[edge]) / (v[next] - v[edge]);
      const key = edge % 2 === 0 ? `h${Math.min(a[0], b[0])}:${a[1]}` : `v${a[0]}:${Math.min(a[1], b[1])}`;
      crossings.push({ key, x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
    }
    if (crossings.length === 2) add(...crossings);
    else if (crossings.length === 4) {
      const centerHigh = v.reduce((a, b) => a + b, 0) / 4 > level;
      const pairs = centerHigh === (v[0] > level) ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
      for (const [a, b] of pairs) add(crossings[a], crossings[b]);
    }
  }
  const used = new Set(), lines = [];
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    const line = [], first = segments[start][0]; let point = first, current = start;
    while (!used.has(current)) {
      used.add(current); line.push([point.x, point.y]);
      const segment = segments[current]; point = segment[0].key === point.key ? segment[1] : segment[0];
      if (point.key === first.key) { line.push([first.x, first.y]); break; }
      const next = adjacent.get(point.key)?.find(index => !used.has(index));
      if (next === undefined) { line.push([point.x, point.y]); break; }
      current = next;
    }
    lines.push(line);
  }
  return lines;
}

const palette = { forest: '#c8d1ad', desert: '#e9d6a5', ice: '#e0ece7', volcano: '#c6b9a5' };
export function buildCartography(world) {
  const columns = 386, rows = 218, elevation = new Float32Array(columns * rows);
  const biomeFields = Object.fromEntries(Object.keys(palette).map(key => [key, new Float32Array(elevation.length)]));
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x, u = (x - 1) / (columns - 3), v = (y - 1) / (rows - 3);
    const outside = x === 0 || y === 0 || x === columns - 1 || y === rows - 1;
    const h = outside ? world.seaLevel - 1 : sampleHeight(world, Math.min(.999999, u), v);
    elevation[i] = h;
    const biome = outside ? 'sea' : biomeAt(world, u, Math.max(.005, Math.min(.995, v)), h);
    for (const [key, values] of Object.entries(biomeFields)) values[i] = biome === key && h > world.seaLevel ? 1 : 0;
  }
  const pathAt = (values, level) => contourLines(values,columns,rows,level).map(line=>line.map(([x,y])=>[(x-1)/(columns-3)*1600,(y-1)/(rows-3)*900]));
  const land = pathAt(elevation, world.seaLevel);
  const biomes = Object.entries(biomeFields).map(([key, values]) => [key, pathAt(values, .5)]);
  const ridges = [.12, .22, .35].map(h => pathAt(elevation, world.seaLevel + h));
  const symbols = [];
  for (let row = 2; row < 89; row++) for (let col = 1; col < 160; col++) {
    const r = hash(col, row, world.seed), u = (col + r * .8) / 160, v = (row + hash(row, col, world.seed) * .8) / 90;
    const h = sampleHeight(world, u, v), biome = biomeAt(world, u, v, h);
    if (h <= world.seaLevel + .014) continue;
    const nearPlace = world.places.some(p => Math.abs(p.x-u)<.034&&Math.abs(p.y-v)<.024);
    if (nearPlace) continue;
    const x = u * 1600, y = v * 900;
    if (h > world.seaLevel + .17 && r > .90) symbols.push({ x, y, kind: 'mountain', size: Math.min(29, 10 + (h - world.seaLevel) * 30), r, biome });
    else if (biome === 'forest' && r > .55 + noise(u*32,v*22,3,world.seed)*.4) symbols.push({ x, y, kind: 'tree', size: 5 + r * 6, r });
    else if (biome === 'desert' && r > .88) symbols.push({ x, y, kind: 'dune', size: 7 + r * 6, r });
  }
  symbols.sort((a, b) => a.y - b.y);
  return {land,biomes,ridges,symbols};
}

export function createCartography(world,geometry) {
  const pathFor=lines=>{const path=new Path2D();for(const line of lines){line.forEach(([x,y],i)=>path[i?'lineTo':'moveTo'](x,y));if(line.length>2&&line[0][0]===line.at(-1)[0]&&line[0][1]===line.at(-1)[1])path.closePath();}return path;};
  const land=pathFor(geometry.land),biomes=geometry.biomes.map(([key,lines])=>[key,pathFor(lines)]),ridges=geometry.ridges.map(pathFor),symbols=geometry.symbols;
  return {
    draw(context, x, y, width, height, { rivers = [], display = {} } = {}) {
      context.save(); context.beginPath(); context.rect(x, y, width, height); context.clip();
      context.translate(x, y); context.scale(width / 1600, height / 900);
      const unit = 1600 / width;
      context.fillStyle = '#a7c4c6'; context.fillRect(0, 0, 1600, 900);
      context.strokeStyle = '#c5dad5'; context.lineWidth = 22; context.lineJoin = 'round'; context.stroke(land);
      context.strokeStyle = '#d5e3d6'; context.lineWidth = 10; context.stroke(land);
      context.fillStyle = '#e9e2c5'; context.fill(land, 'evenodd');
      context.save(); context.clip(land, 'evenodd');
      for (const [key, path] of biomes) { context.fillStyle = palette[key]; context.fill(path, 'evenodd'); }
      if (display.terrainShading !== false) {
        context.strokeStyle = '#847d5c25'; context.lineWidth = .65;
        for (const path of ridges) context.stroke(path);
      }
      if (display.rivers !== false) {
        context.lineCap = 'round'; context.lineJoin = 'round';
        for (const path of rivers) {
          context.beginPath(); let previous;
          for (const p of path) { if (!previous || Math.abs(p[0] - previous[0]) > .5) context.moveTo(p[0] * 1600, p[1] * 900); else context.lineTo(p[0] * 1600, p[1] * 900); previous = p; }
          context.strokeStyle = '#f6edcc'; context.lineWidth = 2.7; context.stroke();
          context.strokeStyle = '#639ea6'; context.lineWidth = 1.15; context.stroke();
        }
      }
      for (const p of symbols) {
        context.save(); context.translate(p.x, p.y); const s = p.size;
        if (p.kind === 'mountain') {
          const peak = (p.r - .5) * s * .4;
          context.beginPath(); context.moveTo(-s * .70, 2); context.lineTo(-s * .27, -s * .43); context.lineTo(peak, -s); context.lineTo(s * .23, -s * .53); context.lineTo(s * .66, 2);
          context.fillStyle = p.biome === 'ice' ? '#f3f4e7' : '#ede5cc'; context.fill();
          context.strokeStyle = '#706f58'; context.lineWidth = .65; context.stroke();
          context.beginPath(); context.moveTo(peak, -s); context.lineTo(s * .23, -s * .53); context.lineTo(s * .66, 2); context.lineTo(s * .17, -s * .11); context.lineTo(peak + s * .09, -s * .51); context.closePath(); context.fillStyle = '#a1a28a'; context.fill();
          context.beginPath(); context.moveTo(peak, -s); context.lineTo(peak - s * .10, -s * .50); context.lineTo(-s * .27, -s * .22); context.strokeStyle = '#8b886e'; context.lineWidth = .5; context.stroke();
          for (let j = 0; j < 3; j++) { context.beginPath(); context.moveTo(s * (.18 + j * .09), -s * (.45 - j * .15)); context.lineTo(s * (.26 + j * .10), -s * (.13 - j * .08)); context.stroke(); }
        } else if (p.kind === 'tree') {
          context.strokeStyle = '#446653'; context.lineWidth = .65; context.beginPath(); context.moveTo(0, 1); context.lineTo(0, -s * .45); context.stroke();
          context.beginPath();
          if(p.r>.7){context.moveTo(0, -s); context.lineTo(s * .44, -s * .26); context.lineTo(s * .22, -s * .27); context.lineTo(s * .49, 0); context.quadraticCurveTo(0, s * .14, -s * .49, 0); context.lineTo(-s * .22, -s * .27); context.lineTo(-s * .44, -s * .26);context.closePath();}
          else{context.moveTo(-s*.4,-s*.15);context.bezierCurveTo(-s*.8,-s*.4,-s*.45,-s*.85,-s*.2,-s*.8);context.bezierCurveTo(-s*.1,-s*1.2,s*.4,-s*1.1,s*.4,-s*.68);context.bezierCurveTo(s*.8,-s*.65,s*.7,-s*.15,s*.34,-s*.12);context.quadraticCurveTo(0,s*.02,-s*.4,-s*.15);}
          context.fillStyle = p.r > .7 ? '#6f8a71' : '#8ba183'; context.fill(); context.stroke();
          context.beginPath();context.moveTo(s*.03,-s*.65);context.lineTo(s*.03,-s*.17);context.strokeStyle='#bac9a1';context.lineWidth=.6;context.stroke();
        } else {
          context.beginPath(); context.moveTo(-s, 1); context.quadraticCurveTo(-s * .2, -s * .65, s * .6, 0); context.strokeStyle = '#b69b63'; context.lineWidth = .7; context.stroke();
          context.beginPath(); context.moveTo(-s * .2, -s * .3); context.quadraticCurveTo(s * .1, 0, s * .45, 1); context.strokeStyle = '#c7af78'; context.stroke();
        }
        context.restore();
      }
      context.restore();
      context.strokeStyle = '#5b7970'; context.lineWidth = Math.max(.7, unit * .9); context.stroke(land);
      for (const place of world.places.filter(p => p.type === 'anomaly')) {
        context.strokeStyle = place.id === 'red-zone' ? '#a46b5c' : '#56869a'; context.lineWidth = 1;
        context.setLineDash([5, 6]); context.beginPath(); context.ellipse(place.x * 1600, place.y * 900, 66, 54, -.15, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
      }
      context.restore();
    },
  };
}
