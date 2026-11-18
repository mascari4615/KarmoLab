import {buildCartography} from './cartography.mjs';
self.onmessage=({data:{id,world}})=>{
  try{const start=performance.now();self.postMessage({id,worldId:world.id,geometry:buildCartography(world),elapsed:performance.now()-start});}
  catch(error){self.postMessage({id,worldId:world.id,error:error.message});}
};
