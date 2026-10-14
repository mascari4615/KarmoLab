export { librarySwipe, galleryZoom } from './gestures.js';
import { librarySwipe, galleryZoom } from './gestures.js';

export function nextItem(items, selected, direction, { key = item => item.id, focused = '', boundary = 'clamp' } = {}) {
  if (!items.length) return null;
  const focus = items.findIndex(item => String(key(item)) === String(focused));
  const current = focus >= 0 ? focus : items.findIndex(item => String(key(item)) === String(selected));
  if (current < 0) return direction < 0 ? items.at(-1) : items[0];
  const index = current + direction;
  if (boundary === 'stop' && (index < 0 || index >= items.length)) return null;
  return items[Math.max(0, Math.min(items.length - 1, index))];
}

export function mediaPosition(items, selected, key = item => item.id) {
  const index = items.findIndex(item => String(key(item)) === String(selected));
  return { index, total: items.length, previous: index > 0, next: index >= 0 && index < items.length - 1 };
}

export function createMediaSurface({ image, video, onError = () => {} }) {
  let request = null;
  const clear = () => { request?.abort(); video.pause(); video.removeAttribute('src'); video.load(); image.removeAttribute('src'); };
  return {
    show(item) {
      clear(); request = new AbortController();
      const signal = request.signal, moving = item.kind === 'video';
      image.hidden = moving; video.hidden = !moving;
      image.alt = item.title || ''; image.referrerPolicy = 'no-referrer';
      video.poster = item.poster || ''; video.muted = true;
      const target = moving ? video : image;
      target.addEventListener('error', () => onError(item), { once: true, signal });
      target.src = item.src;
      if (moving) video.play()?.catch(() => {});
    },
    clear,
    dispose: clear
  };
}

export function createMediaViewer({ parent = document.body, labels, onSelect = () => {} }) {
  const dialog = document.createElement('dialog'); dialog.className = 'kmb-viewer'; dialog.setAttribute('aria-label', labels.title);
  const style = document.createElement('style');
  style.textContent = `.kmb-viewer{box-sizing:border-box;width:100%;max-width:100%;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--text-primary,#182238);color:var(--bg-primary,#fff);overflow:hidden}.kmb-viewer::backdrop{background:#000}.kmb-viewer[open]{display:flex;flex-direction:column}.kmb-bar{display:flex;align-items:center;gap:12px;padding:8px max(16px,env(safe-area-inset-right));flex:none;background:var(--dash-paper,#fff);color:var(--text-primary,#182238)}.kmb-bar button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;min-height:44px;min-width:44px;padding:8px 12px;cursor:pointer}.kmb-bar button:disabled{opacity:.4;cursor:default}.kmb-caption{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kmb-frame{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.kmb-frame img,.kmb-frame video{max-width:100%;max-height:100%;object-fit:contain}.kmb-viewer [hidden]{display:none!important}.kmb-status{margin:0;padding:8px 16px;background:var(--dash-paper,#fff);color:var(--error,#d9553f)}.kmb-footer{padding-bottom:max(8px,env(safe-area-inset-bottom));justify-content:center}.kmb-viewer[data-zoomed="1"] img{touch-action:none;cursor:grab}.kmb-viewer:focus-visible,.kmb-viewer button:focus-visible{outline:2px solid var(--accent,#e8862e);outline-offset:-2px}`;
  const button = text => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; return b; };
  const head = document.createElement('div'); head.className = 'kmb-bar';
  const caption = document.createElement('span'); caption.className = 'kmb-caption';
  const zoomButton = button(labels.zoom), closeButton = button(labels.close); head.append(caption, zoomButton, closeButton);
  const frame = document.createElement('div'); frame.className = 'kmb-frame';
  const image = document.createElement('img'), video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; frame.append(image, video);
  const error = document.createElement('p'); error.className = 'kmb-status'; error.setAttribute('role', 'alert'); error.hidden = true;
  const foot = document.createElement('div'); foot.className = 'kmb-bar kmb-footer';
  const previous = button(labels.previous), position = document.createElement('span'), next = button(labels.next); foot.append(previous, position, next);
  dialog.append(style, head, frame, error, foot); parent.append(dialog);
  let items = [], selected = '', caller = null;
  const zoom = galleryZoom(image, dialog, value => { zoomButton.textContent = value ? labels.fit : labels.zoom; zoomButton.setAttribute('aria-pressed', String(value)); });
  const surface = createMediaSurface({ image, video, onError: () => { error.textContent = labels.error; error.hidden = false; } });
  const paint = item => {
    selected = item.id; error.hidden = true; zoom.reset(); surface.show(item); caption.textContent = item.title || labels.title; zoomButton.hidden = item.kind === 'video';
    const state = mediaPosition(items, selected); previous.disabled = !state.previous; next.disabled = !state.next; position.textContent = `${state.index + 1} / ${state.total}`; onSelect(item);
  };
  const step = direction => { const item = nextItem(items, selected, direction, { boundary: 'stop' }); if (item) paint(item); };
  const stopSwipe = librarySwipe(dialog, () => dialog.open && !zoom.zoomed, step, { video: true });
  const close = () => { surface.clear(); zoom.reset(); if (dialog.open) dialog.close(); if (caller?.isConnected) caller.focus({ preventScroll: true }); };
  closeButton.addEventListener('click', close); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  previous.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1)); zoomButton.addEventListener('click', zoom.toggle);
  dialog.addEventListener('keydown', e => { e.stopPropagation(); if (e.target !== video && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } });
  return {
    open(list, id, source = document.activeElement) { const item = list.find(item => item.id === id); if (!item) return; items = list; caller = source; if (!dialog.open) dialog.showModal(); paint(item); closeButton.focus(); },
    close,
    dispose() { close(); stopSwipe(); zoom.dispose(); surface.dispose(); dialog.remove(); }
  };
}
