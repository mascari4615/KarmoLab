export function librarySwipe(element, enabled, step, { video = false } = {}) {
  const controller = new AbortController();
  let start = null, horizontal = false, suppressClick = false;
  element.addEventListener('touchstart', event => {
    const player = event.target.closest('video');
    const controls = player && (!video || event.touches[0]?.clientY >= player.getBoundingClientRect().bottom - 64);
    start = enabled() && event.touches.length === 1 && !controls && !event.target.closest('button, input, textarea, a, [role="slider"]')
      && (visualViewport?.scale || 1) <= 1.01
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    horizontal = false; suppressClick = false;
  }, { passive: true, signal: controller.signal });
  element.addEventListener('touchmove', event => {
    if (!start) return;
    if (event.touches.length !== 1 || !enabled()) { start = null; return; }
    const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
    if (!horizontal && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { start = null; return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) horizontal = true;
    if (horizontal && event.cancelable) event.preventDefault();
  }, { passive: false, signal: controller.signal });
  element.addEventListener('touchend', event => {
    if (!start || event.touches.length) { start = null; return; }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    start = null;
    if (enabled() && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClick = true;
      step(dx < 0 ? 1 : -1);
    }
  }, { passive: true, signal: controller.signal });
  element.addEventListener('touchcancel', () => { start = null; horizontal = false; }, { passive: true, signal: controller.signal });
  element.addEventListener('click', event => {
    if (!suppressClick || event.target.closest('button, .full-library-nav')) return;
    suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true, signal: controller.signal });
  return () => controller.abort();
}

export function galleryZoom(image, surface, changed = () => {}) {
  const controller = new AbortController();
  let scale = 1, x = 0, y = 0, gesture = null, lastTap = 0, moved = false;
  const paint = () => {
    const limitX = Math.max(0, (image.offsetWidth * scale - surface.clientWidth) / 2);
    const limitY = Math.max(0, (image.offsetHeight * scale - surface.clientHeight) / 2);
    x = Math.max(-limitX, Math.min(limitX, x)); y = Math.max(-limitY, Math.min(limitY, y));
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; surface.dataset.zoomed = scale > 1.01 ? '1' : '0'; changed(scale > 1.01);
  };
  const set = (value) => { scale = Math.max(1, Math.min(4, value)); if (scale === 1) x = y = 0; paint(); };
  const reset = () => { gesture = null; set(1); };
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const middle = touches => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });
  surface.addEventListener('touchstart', event => {
    moved = false;
    if (event.target !== image || image.hidden) return;
    if (event.touches.length === 2) { gesture = { pinch: true, distance: distance(event.touches), scale, center: middle(event.touches), x, y }; }
    else if (scale > 1 && event.touches.length === 1) gesture = { x, y, startX: event.touches[0].clientX, startY: event.touches[0].clientY };
    else gesture = null;
  }, { passive: true, signal: controller.signal });
  surface.addEventListener('touchmove', event => {
    moved = true;
    if (!gesture) return;
    if (gesture.pinch && event.touches.length === 2) {
      const center = middle(event.touches);
      x = gesture.x + center.x - gesture.center.x; y = gesture.y + center.y - gesture.center.y;
      set(gesture.scale * distance(event.touches) / Math.max(1, gesture.distance));
    } else if (!gesture.pinch && event.touches.length === 1 && scale > 1) {
      x = gesture.x + event.touches[0].clientX - gesture.startX; y = gesture.y + event.touches[0].clientY - gesture.startY; paint();
    }
    if (event.cancelable) event.preventDefault();
  }, { passive: false, signal: controller.signal });
  surface.addEventListener('touchend', event => {
    if (!gesture && !moved && event.target === image && event.changedTouches.length === 1 && !event.touches.length) {
      const now = Date.now(); if (now - lastTap < 280) { set(scale > 1 ? 1 : 2); lastTap = 0; } else lastTap = now;
    } else lastTap = 0;
    gesture = null;
  }, { passive: true, signal: controller.signal });
  surface.addEventListener('touchcancel', () => { gesture = null; lastTap = 0; }, { passive: true, signal: controller.signal });
  image.addEventListener('dblclick', event => { event.preventDefault(); set(scale > 1 ? 1 : 2); }, { signal: controller.signal });
  let pointer = null;
  image.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || scale <= 1 || event.button !== 0) return;
    event.preventDefault(); pointer = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x, y }; image.setPointerCapture(event.pointerId);
  }, { signal: controller.signal });
  image.addEventListener('pointermove', event => { if (pointer?.id === event.pointerId) { x = pointer.x + event.clientX - pointer.sx; y = pointer.y + event.clientY - pointer.sy; paint(); } }, { signal: controller.signal });
  for (const type of ['pointerup', 'pointercancel']) image.addEventListener(type, () => { pointer = null; }, { signal: controller.signal });
  image.draggable = false;
  return { reset, dispose: () => { controller.abort(); reset(); }, toggle: () => set(scale > 1 ? 1 : 2), get zoomed() { return scale > 1.01; } };
}
