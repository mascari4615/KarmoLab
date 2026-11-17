import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { createWorld } from '../src/terrain.mjs';
import { generateLandform } from '../src/landform.mjs';
import { reliefPixels } from '../src/relief.mjs';

const out=process.argv[2],erosion=Number(process.argv[3]??180000);
console.time('generate');
const world={...createWorld({original:true}),...generateLandform({erosion})};
console.timeEnd('generate');
console.time('render');
const png=new PNG({width:1536,height:864});png.data=Buffer.from(reliefPixels(world,png.width,png.height));
writeFileSync(`${out}.png`,PNG.sync.write(png));writeFileSync(`${out}.json`,JSON.stringify(world));
console.timeEnd('render');
