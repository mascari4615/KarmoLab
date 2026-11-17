import { createWorld } from './terrain.mjs';
import { generateLandform } from './landform.mjs';
self.onmessage=({data:options})=>{
  try{
    const world=createWorld(options);
    if(!options.blank)Object.assign(world,generateLandform({seed:options.seed,original:Boolean(options.original)}));
    self.postMessage({world});
  }catch(error){self.postMessage({error:error.message});}
};
