import { buildWindowOpacity } from './lib/window-opacity-controls';

const cleanup = buildWindowOpacity(document.querySelector<HTMLElement>('main')!, true);
window.addEventListener('beforeunload', cleanup, { once: true });
