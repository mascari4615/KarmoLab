export { librarySwipe, galleryZoom } from './gestures.js';
export { virtualGrid } from './virtual-grid.js';
export { createMediaList } from './media-list.js';
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

export function createMediaSurface({ image, video, onError = () => {}, onState = () => {}, observeState }) {
  let request = null, last = null, phase = 'idle';
  const clear = () => { request?.abort(); last = null; phase = 'idle'; video.pause(); video.removeAttribute('src'); video.load(); image.removeAttribute('src'); image.setAttribute?.('aria-busy', 'false'); video.setAttribute?.('aria-busy', 'false'); onState('idle', null); };
  const surface = {
    show(item) {
      clear(); request = new AbortController();
      const signal = request.signal, moving = item.kind === 'video';
      last = item; phase = 'loading'; onState(phase, item);
      image.hidden = moving; video.hidden = !moving;
      image.alt = item.title || ''; image.referrerPolicy = 'no-referrer';
      video.poster = item.poster || ''; video.muted = true;
      const target = moving ? video : image;
      const settle = next => {
        if (signal.aborted || ['idle', 'error', next].includes(phase) || !['ready', 'error'].includes(next)) return;
        phase = next; target.setAttribute?.('aria-busy', 'false'); onState(phase, item);
        if (next === 'error') onError(item);
      };
      target.setAttribute?.('aria-busy', 'true');
      const managed = observeState?.(target, settle, signal);
      if (!managed) {
        target.addEventListener(moving ? 'loadeddata' : 'load', () => settle('ready'), { once: true, signal });
        target.addEventListener('error', () => settle('error'), { once: true, signal });
      }
      target.src = item.src;
      if (moving) video.play()?.catch(() => {});
    },
    retry() { if (last && phase === 'error') surface.show(last); },
    get state() { return phase; },
    clear,
    dispose: clear
  };
  return surface;
}

export function createMediaStatus({ host, labels, retry, overlay = false }) {
  const box = document.createElement('div'); box.className = 'kmb-status-box'; box.hidden = true;
  const message = document.createElement('span'); message.setAttribute('role', 'status');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = labels.retry;
  const style = document.createElement('style'); style.textContent = `.kmb-status-box{flex:none;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px;background:var(--panel,var(--dash-paper,#fff));color:var(--fg,var(--text-primary,#182238));font:inherit}.kmb-status-box[hidden]{display:none!important}.kmb-status-box button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;min-width:44px;min-height:44px;padding:8px 12px;cursor:pointer}.kmb-status-box button[hidden]{display:none!important}.kmb-status-box[data-overlay="1"]{position:absolute;bottom:max(88px,env(safe-area-inset-bottom));left:12px;right:12px;z-index:5}`;
  box.dataset.overlay = overlay ? '1' : '0'; box.append(style, message, button); host.append(box);
  button.addEventListener('click', retry);
  return {
    element: box,
    update(phase) {
      const focused = document.activeElement === button;
      box.hidden = !['loading', 'error'].includes(phase); box.dataset.state = phase;
      message.setAttribute('role', phase === 'error' ? 'alert' : 'status'); message.textContent = phase === 'error' ? labels.error : labels.loading;
      button.hidden = phase !== 'error';
      if (focused && button.hidden) [...host.querySelectorAll('button')].find(control => control !== button && !control.disabled && control.getClientRects().length)?.focus({ preventScroll: true });
    },
    dispose() { box.remove(); }
  };
}

export function createMediaViewer({ parent = document.body, labels, onSelect = () => {}, actions, beforeChange = () => true, onClose = () => {} }) {
  const dialog = document.createElement('dialog'); dialog.className = 'kmb-viewer'; dialog.setAttribute('aria-label', labels.title);
  const style = document.createElement('style');
  style.textContent = `.kmb-viewer{box-sizing:border-box;width:100%;max-width:100%;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--text-primary,#182238);color:var(--bg-primary,#fff);overflow:hidden}.kmb-viewer::backdrop{background:#000}.kmb-viewer[open]{display:flex;flex-direction:column}.kmb-bar{display:flex;align-items:center;gap:12px;padding:8px max(16px,env(safe-area-inset-right));flex:none;background:var(--dash-paper,#fff);color:var(--text-primary,#182238)}.kmb-bar button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;min-height:44px;min-width:44px;padding:8px 12px;cursor:pointer}.kmb-bar button:disabled{opacity:.4;cursor:default}.kmb-caption{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kmb-frame{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.kmb-frame img,.kmb-frame video{max-width:100%;max-height:100%;object-fit:contain}.kmb-viewer [hidden]{display:none!important}.kmb-status{margin:0;padding:8px 16px;background:var(--dash-paper,#fff);color:var(--error,#d9553f)}.kmb-footer{padding-bottom:max(8px,env(safe-area-inset-bottom));justify-content:center}.kmb-viewer[data-zoomed="1"] img{touch-action:none;cursor:grab}.kmb-viewer:focus-visible,.kmb-viewer button:focus-visible{outline:2px solid var(--accent,#e8862e);outline-offset:-2px}`;
  const button = text => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; return b; };
  const head = document.createElement('div'); head.className = 'kmb-bar';
  const caption = document.createElement('span'); caption.className = 'kmb-caption';
  const zoomButton = button(labels.zoom), closeButton = button(labels.close); head.append(caption, zoomButton, closeButton);
  const settings = button(actions?.label || ''); settings.hidden = !actions; head.insertBefore(settings, zoomButton); settings.setAttribute('aria-expanded', 'false');
  const workspace = document.createElement('div'); workspace.className = 'kmb-workspace';
  const details = document.createElement('section'); details.className = 'kmb-details'; details.hidden = true; details.setAttribute('aria-label', actions?.label || '');
  const darkStyle = document.createElement('style');
  darkStyle.textContent = `.kmb-viewer{position:fixed;inset:0;--bg-primary:#10151e;--bg-secondary:#182130;--bg-tertiary:#253247;--text-primary:#e8edf5;--text-secondary:#bac6d8;--text-tertiary:#acb9cd;--border:#53647e;--accent:#f0a04b;--error:#ff9b91;--dash-paper:#182130;--panel:#182130;--fg:#e8edf5;background:var(--bg-primary);color:var(--text-primary)}.kmb-viewer .kmb-bar{background:var(--bg-secondary);color:var(--text-primary)}.kmb-workspace{display:flex;flex:1;min-height:0;position:relative}.kmb-details{flex:0 0 min(420px,40%);min-width:0;overflow:auto;overscroll-behavior:contain;padding:12px;background:var(--bg-secondary);color:var(--text-primary)}@media(max-width:719px){.kmb-details{position:absolute;inset:0;width:auto;z-index:4}.kmb-viewer .kmb-bar{gap:8px;padding-inline:12px}}`;
  const frame = document.createElement('div'); frame.className = 'kmb-frame';
  const image = document.createElement('img'), video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; frame.append(image, video);
  const foot = document.createElement('div'); foot.className = 'kmb-bar kmb-footer';
  const previous = button(labels.previous), position = document.createElement('span'), next = button(labels.next); foot.append(previous, position, next);
  workspace.append(frame, details); dialog.append(style, darkStyle, head, workspace, foot); parent.append(dialog);
  let items = [], selected = '', caller = null;
  const zoom = galleryZoom(image, dialog, value => { zoomButton.textContent = value ? labels.fit : labels.zoom; zoomButton.setAttribute('aria-pressed', String(value)); });
  const status = createMediaStatus({ host: dialog, labels, retry: () => surface.retry() }); dialog.insertBefore(status.element, foot);
  const surface = createMediaSurface({ image, video, onState: phase => { zoomButton.disabled = phase !== 'ready'; status.update(phase); } });
  const paint = item => {
    selected = item.id; zoom.reset(); surface.show(item); caption.textContent = item.title || labels.title; zoomButton.hidden = item.kind === 'video';
    const state = mediaPosition(items, selected); previous.disabled = !state.previous; next.disabled = !state.next; position.textContent = `${state.index + 1} / ${state.total}`; onSelect(item);
    actions?.render(item, details);
  };
  const step = direction => { const item = nextItem(items, selected, direction, { boundary: 'stop' }); if (item && beforeChange(item)) paint(item); };
  const stopSwipe = librarySwipe(frame, () => dialog.open && !zoom.zoomed, step, { video: true });
  const showActions = value => { details.hidden = !value; settings.setAttribute('aria-expanded', String(!!value)); };
  settings.addEventListener('click', () => showActions(details.hidden));
  const close = (force = false) => { if (!force && !beforeChange(null)) return; surface.clear(); zoom.reset(); if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { if (dialog.open) return; onClose(); if (caller?.isConnected) caller.focus({ preventScroll: true }); });
  closeButton.addEventListener('click', () => close()); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  previous.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1)); zoomButton.addEventListener('click', zoom.toggle);
  dialog.addEventListener('keydown', e => { e.stopPropagation(); if (e.target !== video && !e.target.closest('input,textarea,select,[contenteditable],.kmb-details') && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } });
  return {
    open(list, id, source = document.activeElement) { const item = list.find(item => item.id === id); if (!item || !beforeChange(item)) return; items = list; if (!dialog.open) { caller = source; dialog.showModal(); showActions(!!actions?.openByDefault?.()); } paint(item); closeButton.focus(); },
    showActions,
    get opened() { return dialog.open; },
    close,
    dispose() { close(true); stopSwipe(); zoom.dispose(); surface.dispose(); status.dispose(); dialog.remove(); }
  };
}
