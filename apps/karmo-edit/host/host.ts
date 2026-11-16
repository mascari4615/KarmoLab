/**
 * 셸 없는 도구 받침. 편집 도구가 쓰는 `Toolbox` API 만 같은 이름으로 제공
 * 화면 틀은 임시 (시안 판정 전)
 */
import { saveInDesktop } from '../../karmolab/src/lib/desktop-save';

type Spec = { id: string; title?: string; layout?: string; tabs?: Array<{ label?: string; build: (c: HTMLElement) => void }>; accepts?: string[]; produces?: string[] };
type Item = { blob: Blob; name?: string; from?: string | null };
type Meta = Spec & { lazyScriptPaths?: string[]; layout?: string };

const w = window as unknown as Record<string, unknown>;
const cfg = w.__KARMO_EDIT__ as { table: { hubs: Record<string, string[]>; standalone: string[] }; paths: Record<string, string[]> };
const tools = new Map<string, Spec>();
let disposers: Array<() => void> = [];
let held: Item | null = null;
const loaded = new Map<string, Promise<void>>();

const metaOf = (id: string): Meta | undefined => ((w.KARMOLAB_LAZY_META as Meta[] | undefined) || []).find((m) => m.id === id);
const accepts = (id: string): string[] => metaOf(id)?.accepts || tools.get(id)?.accepts || [];
const kindMatches = (p: string, t: string): boolean => p === t || (p.endsWith('/*') && t.startsWith(p.slice(0, -1)));

const scriptUrl = (rel: string): string => {
  if (rel.startsWith('vendor/')) return `js/${rel}.js`;
  if (rel.startsWith('root/')) return `js/${rel.slice(5)}.js`;
  return `js/widgets/${rel}.js`;
};

function loadScript(rel: string): Promise<void> {
  const prev = loaded.get(rel);
  if (prev) return prev;
  const p = new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = scriptUrl(rel);
    s.async = false;
    s.onload = () => res();
    s.onerror = () => rej(new Error('load failed: ' + rel));
    document.body.appendChild(s);
  });
  loaded.set(rel, p);
  return p;
}

function showToast(msg: string, type = 'success'): void {
  const el = document.getElementById('statusToast');
  if (!el) return;
  el.textContent = msg;
  el.dataset.type = type;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2600);
}

function failure(container: HTMLElement, message: string): void {
  const el = document.createElement('div');
  el.className = 'tool-status error';
  el.textContent = message;
  container.replaceChildren(el);
}

/** 도구 자신이 밝힌 배치가 정본. 표의 값은 등록 전 임시 */
function syncLayout(container: HTMLElement, spec: Spec): void {
  const page = container.parentElement;
  if (!spec.layout || !page?.classList.contains('tool-page') || page.parentElement?.id !== 'ktMain') return;
  page.className = `tool-page layout-${spec.layout} active`;
  page.parentElement.dataset.layout = spec.layout;
}

/** 탭이 둘 이상인 도구만 탭 줄을 그림 */
function buildTabs(container: HTMLElement, spec: Spec): void {
  const tabs = spec.tabs || [];
  if (tabs.length < 2) {
    tabs[0]?.build(container);
    return;
  }
  const bar = document.createElement('div');
  bar.className = 'tool-tabs';
  bar.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  const show = (index: number): void => {
    bar.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('active', i === index);
      b.setAttribute('aria-selected', String(i === index));
    });
    body.innerHTML = '';
    tabs[index].build(body);
  };
  tabs.forEach((tab, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = tab.label || String(i + 1);
    b.onclick = () => show(i);
    bar.appendChild(b);
  });
  container.replaceChildren(bar, body);
  show(0);
}

function mountTool(id: string, container: HTMLElement): boolean {
  const spec = tools.get(id);
  if (spec?.tabs?.[0]) {
    syncLayout(container, spec);
    buildTabs(container, spec);
    return true;
  }
  const list = cfg.paths[id];
  if (!list) {
    failure(container, `${id} 는 이 프로그램에 없습니다.`);
    return false;
  }
  void Promise.all(list.map(loadScript))
    .then(() => {
      const s = tools.get(id);
      if (!s?.tabs?.[0]) throw new Error('등록 안 됨: ' + id);
      container.innerHTML = '';
      syncLayout(container, s);
      buildTabs(container, s);
    })
    .catch((e) => failure(container, String(e.message || e)));
  return true;
}

const Toolbox = {
  register(spec: Spec) {
    tools.set(spec.id, spec);
  },
  mountTool,
  switchPage(id: string) {
    open(id);
  },
  onDispose(fn: () => void) {
    disposers.push(fn);
  },
  showToast,
  trackUse() {},
  copyText(text: string) {
    void navigator.clipboard?.writeText(text);
    showToast('클립보드에 복사됨');
  },
  ensureScript(rel: string) {
    return loadScript(rel);
  },
  getLazyWidgetPublicMeta(id: string) {
    const { lazyScriptPaths: _p, ...rest } = metaOf(id) || ({ id } as Meta);
    return rest;
  },
  getPref(k: string, d: string) {
    try {
      return localStorage.getItem('kt_' + k) ?? d;
    } catch {
      return d;
    }
  },
  setPref(k: string, v: string) {
    try {
      localStorage.setItem('kt_' + k, v);
    } catch {
      /* 저장 못 해도 동작 */
    }
  },
  escapeHtml(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  },
  isDesktopApp() {
    return !!w.__KARMOLAB_DESKTOP__;
  },
  takeBundleRequest() {
    return null;
  },
  offerResult(item: Item) {
    if (item?.blob) held = item;
  },
  peekResult() {
    return held;
  },
  takeResult() {
    const h = held;
    held = null;
    return h;
  },
  onHandoff(kinds: string | string[], cb: (f: File) => void) {
    const list = typeof kinds === 'string' ? accepts(kinds) : kinds;
    const h = held;
    if (!h || !list.some((k) => kindMatches(k, h.blob.type))) return;
    held = null;
    cb(new File([h.blob], h.name || 'result', { type: h.blob.type }));
  },
  offerNext(anchor: HTMLElement, item: Item) {
    if (!anchor?.parentElement || !item?.blob) return;
    held = item;
    window.dispatchEvent(new CustomEvent('karmolab-result', { detail: { type: item.blob.type || '', name: item.name, size: item.blob.size } }));
    document.querySelectorAll('.tool-next-row').forEach((n) => n.remove());
    const all = [...Object.values(cfg.table.hubs).flat(), ...cfg.table.standalone];
    const next = all.filter((id) => id !== item.from && accepts(id).some((k) => kindMatches(k, item.blob.type))).slice(0, 5);
    if (!next.length) return;
    const row = document.createElement('div');
    row.className = 'tool-next-row';
    row.innerHTML = '<span class="tool-next-label">이어서</span>';
    next.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'tool-next-btn';
      b.textContent = metaOf(id)?.title || id;
      b.onclick = () => open(id);
      row.appendChild(b);
    });
    anchor.after(row);
  },
};
Object.assign(Toolbox, { result: Toolbox.offerNext });
w.Toolbox = Toolbox;
// 앱 창이면 저장을 download_save 로 (lib/desktop-save)
w.__KARMOLAB_DESKTOP__ = !!w.__TAURI__;
w.__KARMO_PDF_WORKER__ = new URL('js/vendor/pdfjs.worker.min.js', document.baseURI).href;
/* WebView2 의 a[download] 는 저장 없이 끝남 (실측: 다운로드 폴더에 파일 0).
   도구마다 저장 경로가 달라 (shared 넷, 직접 a 태그 넷) 앵커 click 한 곳에서 처리 */
if (w.__TAURI__) {
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement): void {
    if (!this.hasAttribute('download') || !/^(blob|data):/.test(this.href)) {
      anchorClick.call(this);
      return;
    }
    const name = this.download || 'download';
    void fetch(this.href)
      .then((r) => r.blob())
      .then((blob) => {
        saveInDesktop(blob, name, () => showToast('저장하지 못했습니다', 'error'));
      })
      .catch(() => showToast('저장하지 못했습니다', 'error'));
  };
}
// 마스코트 대사 호출 대역. 이 프로그램에 마스코트 없음
w.Mdd = {
  linePreset() {},
  injectCSS(id: string, css: string) {
    const domId = 'mdd-css-' + id;
    if (document.getElementById(domId)) return;
    const style = document.createElement('style');
    style.id = domId;
    style.textContent = css;
    document.head.appendChild(style);
  },
};

function open(id: string): void {
  disposers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* 다음 정리 계속 */
    }
  });
  disposers = [];
  const main = document.getElementById('ktMain') as HTMLElement;
  main.innerHTML = '';
  const layout = metaOf(id)?.layout || 'form';
  main.dataset.layout = layout;
  // 도구 CSS 계약: .tool-page.layout-* > .tab-panel
  const page = document.createElement('div');
  page.className = `tool-page layout-${layout} active`;
  page.id = 'page-' + id;
  const panel = document.createElement('div');
  panel.className = 'tab-panel active';
  page.appendChild(panel);
  main.appendChild(page);
  mountTool(id, panel);
  document.querySelectorAll<HTMLElement>('#ktNav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
}

w.__karmoEditBoot = () => {
  const nav = document.getElementById('ktNav') as HTMLElement;
  [...Object.keys(cfg.table.hubs), ...cfg.table.standalone].forEach((id) => {
    const b = document.createElement('button');
    b.dataset.id = id;
    b.textContent = metaOf(id)?.title || id;
    b.onclick = () => open(id);
    nav.appendChild(b);
  });
  w.__karmoEditOpen = open;
  const fromHash = decodeURIComponent(location.hash.slice(1));
  open(cfg.paths[fromHash] ? fromHash : Object.keys(cfg.table.hubs)[0]);
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (cfg.paths[id]) open(id);
  });
};
