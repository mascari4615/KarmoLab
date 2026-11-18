import { createWorld } from './terrain.mjs';
import { generateLandform } from './landform.mjs';
import { createSampleWorld } from './sample-world.mjs';
self.onmessage=async({data:options})=>{
  try{
    if(options.sample){self.postMessage({world:await createSampleWorld(options.seed||8147)});return;}
    const world=createWorld(options);
    world.regionalDetail=!options.original&&!options.blank;
    if(!options.blank)Object.assign(world,generateLandform({seed:options.seed,original:Boolean(options.original)}));
    self.postMessage({world});
  }catch(error){self.postMessage({error:error.message});}
};
