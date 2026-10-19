import { virtualGrid } from './virtual-grid.js';

// Apps own records and actions; the list owns rendering, selection and scrolling.
export function createMediaList(host, {
  key = item => item.id, thumbnail = item => item.poster || item.src,
  label = item => item.title || '', caption = label, selection = 'none',
  minItemWidth = 160, aspectRatio = 1, captionHeight = 32, fit = 'contain',
  createImage = () => document.createElement('img'),
  onActivate = () => {}, onSelectionChange = () => {}, overscan = 1,
} = {}) {
  if (!['none', 'single', 'multiple'].includes(selection)) throw new TypeError('Invalid selection mode');
  if (!(minItemWidth > 0 && aspectRatio > 0 && captionHeight >= 0)) throw new RangeError('Invalid card dimensions');
  const originalStyle = host.getAttribute('style');
  let items = [], selected = new Set(), current = '', disposed = false;
  const byKey = new Map();
  host.classList.add('kmb-list');
  Object.assign(host.style, { display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(min(100%,${minItemWidth}px),1fr))`,
    gridAutoRows: 'max-content', alignContent: 'start', overflow: 'auto', minHeight: '0', gap: '8px' });
  const paint = (button, item) => {
    const id = String(key(item)), checked = selected.has(id);
    button.style.borderColor = checked || id === current ? 'var(--accent, #8554c7)' : 'var(--line, #888)';
    button.setAttribute('aria-label', label(item));
    button.setAttribute('aria-current', String(id === current));
    if (selection !== 'none') button.setAttribute('aria-pressed', String(checked));
    const image = button.querySelector('img'), text = button.querySelector('span');
    const src = thumbnail(item) || '';
    if (image.getAttribute('src') !== src) image.src = src;
    text.textContent = caption(item); text.title = label(item);
  };
  const grid = virtualGrid(host, { key, overscan,
    heightOf: (item, width) => (width - 2) / aspectRatio + captionHeight + 2,
    create: item => {
      const button = document.createElement('button'), image = createImage(), caption = document.createElement('span');
      button.type = 'button'; button.className = 'kmb-list-item';
      Object.assign(button.style, { boxSizing: 'border-box', minWidth: '0', padding: '0', display: 'grid',
        gridTemplateRows: `auto ${captionHeight}px`, alignItems: 'stretch', justifyItems: 'stretch', gap: '0', overflow: 'hidden',
        border: '1px solid var(--line, #888)', borderRadius: '8px', background: 'var(--panel2, #222)', color: 'inherit', cursor: 'pointer' });
      image.alt = ''; image.loading = 'lazy';
      Object.assign(image.style, { display: 'block', width: '100%', height: 'auto', aspectRatio: String(aspectRatio), minHeight: '0', maxHeight: 'none', objectFit: fit });
      Object.assign(caption.style, { display: 'block', minWidth: '0', padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', lineHeight: '20px' });
      button.append(image, caption); paint(button, item); return button;
    }, update: paint });
  const selectedItems = () => items.filter(item => selected.has(String(key(item))));
  const activate = event => {
    const button = event.target.closest('.kmb-list-item');
    if (!button || button.parentElement !== host) return;
    const id = button.dataset.key, item = byKey.get(id);
    if (!item) return;
    if (selection !== 'none') {
      if (selection === 'single') selected = new Set([id]);
      else if (selected.has(id)) selected.delete(id); else selected.add(id);
      grid.set(items); onSelectionChange(selectedItems());
    }
    onActivate(item);
  };
  host.addEventListener('click', activate);
  return {
    setItems(next) {
      if (disposed) return;
      const ids = next.map(item => String(key(item)));
      if (new Set(ids).size !== ids.length) throw new Error('Media list keys must be unique');
      items = [...next]; byKey.clear();
      items.forEach(item => byKey.set(String(key(item)), item));
      selected = new Set([...selected].filter(id => byKey.has(id)));
      grid.set(items);
    },
    setSelected(ids) {
      if (disposed) return;
      const valid = [...ids].map(String).filter(id => byKey.has(id));
      selected = new Set(selection === 'none' ? [] : selection === 'single' ? valid.slice(0, 1) : valid);
      grid.set(items);
    },
    setCurrent(id) { if (!disposed) { current = String(id); grid.set(items); } },
    selectedItems,
    ensureVisible(id) { if (!disposed) grid.ensureVisible(String(id)); },
    dispose() {
      if (disposed) return;
      disposed = true; grid.dispose(); host.removeEventListener('click', activate);
      host.replaceChildren(); host.classList.remove('kmb-list');
      if (originalStyle === null) host.removeAttribute('style'); else host.setAttribute('style', originalStyle);
      items = []; selected.clear(); byKey.clear();
    },
  };
}
