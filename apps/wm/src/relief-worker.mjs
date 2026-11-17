import { reliefPixels } from './relief.mjs';
self.onmessage = ({ data: { id, world, width, height } }) => {
  const pixels = reliefPixels(world, width, height);
  self.postMessage({ id, width, height, pixels }, [pixels.buffer]);
};
