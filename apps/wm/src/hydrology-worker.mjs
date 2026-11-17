import { rivers } from './hydrology.mjs';
self.onmessage=({data:{id,world}})=>{try{self.postMessage({id,paths:rivers(world)});}catch{self.postMessage({id,paths:[]});}};
