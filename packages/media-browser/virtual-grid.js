// 격자 밖 카드는 DOM 에 두지 않음. 행 높이 합으로 스크롤 길이와 자리 보존
export function virtualGrid(box, { key, create, update, heightOf, afterRender, scrollRoot = box, overscan = 2, retain = 0, windowed = () => true }) {
  const previousAnchor = box.style.overflowAnchor;
  let addedTabIndex = false;
  box.style.overflowAnchor = 'none';
  const spacer = () => {
    const el = document.createElement('div');
    el.style.gridColumn = '1 / -1';
    el.style.pointerEvents = 'none';
    return el;
  };
  const top = spacer(), bottom = spacer();
  top.style.overflowAnchor = 'none';
  bottom.style.overflowAnchor = 'none';
  let items = [], columns = 1, columnWidth = 0, rows = [], offsets = [0], gap = 0, scheduled = false, disposed = false;
  const index = new Map();
  const cache = new Map();
  const measured = new Map();
  let reveal = null, revealScrollTop = 0;
  const viewTopOf = () => {
    if (scrollRoot === box) return scrollRoot.scrollTop;
    const rect = scrollRoot.getBoundingClientRect();
    const scale = rect.height / scrollRoot.offsetHeight || 1;
    return (rect.top - box.getBoundingClientRect().top) / scale + scrollRoot.clientTop;
  };
  // 실제 높이 측정으로 행 위치가 바뀌어도 선택 이동의 대상 유지.
  function alignReveal() {
    const i = index.get(reveal);
    if (reveal == null || i == null || !rows.length) return;
    const row = Math.floor(i / columns), y = offsets[row], actual = measured.get(reveal);
    const itemHeight = actual && Math.abs(actual.width - columnWidth) < .5 ? actual.height : heightOf(items[i], columnWidth);
    const end = y + itemHeight;
    const viewTop = viewTopOf(), height = scrollRoot.clientHeight;
    if (itemHeight > height) {
      if (y < viewTop || y >= viewTop + height) scrollRoot.scrollTop += y - viewTop;
    } else if (y < viewTop) scrollRoot.scrollTop += y - viewTop;
    else if (end > viewTop + height) scrollRoot.scrollTop += end - viewTop - height;
    revealScrollTop = scrollRoot.scrollTop;
  }
  const cardResize = new ResizeObserver(entries => {
    if (disposed) return;
    let changed = false;
    for (const entry of entries) {
      const id = entry.target.dataset.key;
      if (!index.has(id)) continue;
      const size = entry.borderBoxSize?.[0];
      const width = size?.inlineSize ?? entry.target.offsetWidth;
      const height = size?.blockSize ?? entry.target.offsetHeight;
      const old = measured.get(id);
      if (height > 0 && (!old || Math.abs(old.width - width) > .1 || Math.abs(old.height - height) > .1)) {
        measured.set(id, { width, height }); changed = true;
      }
    }
    if (changed) layout();
  });

  function rowAt(y) {
    let lo = 0, hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, Math.max(0, rows.length - 1));
  }

  function render() {
    if (disposed || !box.isConnected) return;
    const focused = box.contains(document.activeElement) ? document.activeElement : null;
    const restoreFocus = () => {
      if (!focused || document.activeElement !== document.body) return;
      if (focused.isConnected && box.contains(focused)) focused.focus({ preventScroll: true });
      else {
        // 재조회에서 사라진 카드의 초점만 목록에 남김. 외부 필터 입력은 제외.
        if (!box.hasAttribute('tabindex')) { box.tabIndex = -1; addedTabIndex = true; }
        box.focus({ preventScroll: true });
      }
    };
    if (!rows.length) {
      top.remove(); bottom.remove();
      for (const el of [...box.children]) if (el.dataset.key != null) { cardResize.unobserve(el); el.remove(); }
      restoreFocus();
      return;
    }
    const extra = scrollRoot.clientHeight * overscan;
    // 위 간격을 키울 때 브라우저 스크롤 앵커가 scrollTop 을 같이 밀면, 다음 프레임에 간격이 화면을 덮음
    const held = scrollRoot.scrollTop;
    const viewTop = viewTopOf();
    const first = windowed() ? rowAt(Math.max(0, viewTop - extra)) : 0;
    const last = windowed() ? Math.min(rows.length, rowAt(viewTop + scrollRoot.clientHeight + extra) + 1) : rows.length;
    if (first === 0) top.remove(); else box.prepend(top);
    top.style.height = `${Math.max(0, offsets[first] - gap)}px`;
    if (last === rows.length) bottom.remove(); else box.append(bottom);
    bottom.style.height = `${Math.max(0, offsets[rows.length] - gap - offsets[last])}px`;

    const visible = items.slice(first * columns, last * columns);
    const wanted = new Set(visible.map((item) => String(key(item))));
    const old = new Map([...box.children].filter((el) => el.dataset.key != null).map((el) => [el.dataset.key, el]));
    for (const [id, el] of old) {
      if (wanted.has(id)) continue;
      old.delete(id);
      cardResize.unobserve(el);
      el.remove();
      if (retain) {
        cache.set(id, el);
        if (cache.size > retain) cache.delete(cache.keys().next().value);
      }
    }
    let prev = first === 0 ? null : top;
    for (const item of visible) {
      const id = String(key(item));
      let el = old.get(id);
      if (el) old.delete(id);
      else if (cache.has(id)) { el = cache.get(id); cache.delete(id); }
      if (el) update?.(el, item);
      else { el = create(item); el.dataset.key = id; }
      const next = prev ? prev.nextSibling : box.firstChild;
      if (next !== el) box.insertBefore(el, next);
      cardResize.observe(el);
      prev = el;
    }
    // DOM 재배치 또는 제거로 풀린 내부 초점만 복원. 외부 입력 초점 제외.
    restoreFocus();
    if (scrollRoot.scrollTop !== held) scrollRoot.scrollTop = held;
    if (reveal != null) revealScrollTop = scrollRoot.scrollTop;
    afterRender?.();
  }

  function layout() {
    const css = getComputedStyle(box);
    const widths = css.gridTemplateColumns.match(/[\d.]+px/g) || [];
    columns = Math.max(1, widths.length);
    const width = parseFloat(widths[0]) || box.clientWidth;
    columnWidth = width;
    gap = parseFloat(css.rowGap) || 0;
    rows = [];
    offsets = [0];
    for (let i = 0; i < items.length; i += columns) {
      const height = Math.max(...items.slice(i, i + columns).map((item) => {
        const actual = measured.get(String(key(item)));
        return actual && Math.abs(actual.width - width) < .5 ? actual.height : heightOf(item, width);
      }));
      rows.push(height);
      offsets.push(offsets.at(-1) + height + gap);
    }
    alignReveal();
    render();
  }

  const onScroll = () => {
    // 선택 이동으로 생긴 scroll 이벤트와 사용자 스크롤 구분.
    if (reveal != null && Math.abs(scrollRoot.scrollTop - revealScrollTop) > 1) reveal = null;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  };
  scrollRoot.addEventListener('scroll', onScroll, { passive: true });
  const resize = new ResizeObserver(layout);
  resize.observe(scrollRoot);
  if (scrollRoot !== box) resize.observe(box);

  return {
    set(next) {
      // 진행 정보만 갱신된 같은 순서의 목록은 선택 위치 보정 유지.
      if (reveal != null && (next.length !== items.length || !next.every((item, i) => index.get(String(key(item))) === i))) reveal = null;
      items = next;
      index.clear();
      items.forEach((item, i) => index.set(String(key(item)), i));
      for (const id of cache.keys()) if (!index.has(id)) cache.delete(id);
      for (const id of measured.keys()) if (!index.has(id)) measured.delete(id);
      layout();
    },
    keys() { return items.filter((item) => item.g || item.v).map((item) => String(key(item))); },
    ensureVisible(id) {
      const i = index.get(String(id));
      if (i == null || !rows.length) return;
      reveal = String(id);
      alignReveal();
      render();
    },
    dispose() { disposed = true; box.style.overflowAnchor = previousAnchor; if (addedTabIndex && box.getAttribute('tabindex') === '-1') box.removeAttribute('tabindex'); cache.clear(); measured.clear(); cardResize.disconnect(); resize.disconnect(); scrollRoot.removeEventListener('scroll', onScroll); },
  };
}
