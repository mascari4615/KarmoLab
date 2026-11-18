import { reliefPixels } from './relief.mjs';
import {prepareTerrainSource} from './terrain-source.mjs';
self.onmessage = async ({ data: { id, world, width, height, display,region } }) => {
  try{
  await prepareTerrainSource(world);
  const pixels = reliefPixels(world, width, height, display,region);
  self.postMessage({ id, worldId:world.id, width, height, pixels,region }, [pixels.buffer]);
  }catch(error){self.postMessage({id,error:true,message:error.message});}
};
