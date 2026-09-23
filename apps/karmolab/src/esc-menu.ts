/**
 * ESC 메뉴. 게임 로비의 일시정지 화면처럼, ESC 로 왼쪽에 판 하나가 뜬다 (karmo-design E1jk, 2026-09-22).
 *
 * 메뉴는 진입점 (사용자 2026-09-21). 안에는 어디로 가는 칸 여덟과 프로필, 닫기만.
 * 세부 UI 와 칸마다 붙는 수는 없음. 첫 화면에서 숨긴 머리 줄과 옆줄의 자리
 *
 * 바깥에서 부르는 것: `window.KarmoEscMenu.open() / close() / toggle() / use()`.
 * 부르는 곳: 첫 화면 구석 버튼 (home-page.ts) 과 ESC 키. 이동은 셸의 `data-goto` 대리인 몫
 * dash 사이트는 `use()` 로 칸을 대시보드 방으로 바꿔 끼운다 (mydash shell.ts). 같은 판, 다른 칸
 *
 * 아이콘은 `img/shell/menu/*.png` (Codex image_gen 으로 생성한 자작, 각진 덩어리 두 톤. 옅은 면은 알파 0.45).
 * CSS mask 로 그림. 한 그림으로 밝은 판과 어두운 판 둘
 */
import { t } from './lib/i18n.js';
import { toolIndexPath } from './lib/site-base';
import { dashUrl, labUrl, blogUrl, hostKind, onSplitHost } from './lib/site-hosts';

const ICON_BASE = '/apps/karmolab/img/shell/menu/';

type Cell = { id: string; icon: string; key: string; fallback: string };

/* 칸 여덟. 이름은 표준 용어만 (자작 용어 금지). 순서는 첫 화면 타일과 같다 */
const CELLS: Cell[] = [
    { id: 'home', icon: 'home', key: 'shell.menu.home', fallback: '홈' },
    { id: 'mydash', icon: 'dash', key: 'shell.menu.dashboard', fallback: '대시보드' },
    { id: 'tools', icon: 'tool', key: 'shell.menu.tools', fallback: '도구' },
    { id: 'arcade', icon: 'play', key: 'widgets.arcade.title', fallback: '오락실' },
    { id: 'community', icon: 'talk', key: 'shell.menu.community', fallback: '커뮤니티' },
    { id: 'favorites', icon: 'star', key: 'site.cta.favorites', fallback: '즐겨찾기' },
    { id: 'karmograph', icon: 'graph', key: 'shell.menu.graph', fallback: 'KarmoGraph' },
    { id: 'about', icon: 'about', key: 'shell.nav.about', fallback: '소개' },
    { id: 'blog', icon: 'book', key: 'shell.menu.blog', fallback: '글' }
];

function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** 바꿔 끼우는 칸 한 벌. 제목, 칸, 고르면 부를 손. `foot` 은 아래 줄의 버튼 하나 (나가기) */
type Custom = {
    title: string;
    cells: Array<{ id: string; icon: string; label: string }>;
    pick: (id: string) => void;
    foot?: { label: string; pick: () => void };
};

const KarmoEscMenu = (() => {
    let root: HTMLElement | null = null;
    let lastFocus: HTMLElement | null = null;
    let custom: Custom | null = null;

    function cellsHtml(): string {
        if (custom) {
            return custom.cells.map((c) =>
                `<button type="button" class="esc-cell" data-esc-pick="${esc(c.id)}" data-esc-close="1">` +
                `<span class="esc-ic" style="--esc-m:url(${ICON_BASE}${esc(c.icon)}.png)"></span><b>${esc(c.label)}</b></button>`
            ).join('');
        }
        return defaultCellsHtml();
    }

    function build(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'escMenu';
        el.className = 'esc-menu';
        el.hidden = true;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', t('shell.menu.title', undefined, '메뉴'));
        const title = custom ? custom.title : 'KarmoLab';
        const foot = custom && custom.foot
            ? `<button type="button" class="esc-out" data-esc-foot="1" data-esc-close="1">${esc(custom.foot.label)}</button>`
            : '';
        el.innerHTML = `
            <div class="esc-dim" data-esc-close="1"></div>
            <img class="esc-yawn" src="/apps/karmolab/img/widgets/mydash/yawn-stand.webp" alt="" aria-hidden="true" data-esc-close="1">
            <div class="esc-panel">
                <div class="esc-top">
                    <span class="esc-en">${esc(title)}, ${esc(t('shell.menu.title', undefined, '메뉴').toLowerCase())}</span>
                    <button type="button" class="esc-close" data-esc-close="1" aria-label="${esc(t('shell.menu.close', undefined, '닫기'))}">&times;</button>
                </div>
                <div class="esc-prof">
                    <span class="esc-av"><img src="/apps/karmolab/img/widgets/mydash/yawn-stand.webp" alt="" aria-hidden="true"></span>
                    <span class="esc-who"><b class="esc-name">Mascari4615</b><span class="esc-en">Indie, witch and dolls</span></span>
                </div>
                <div class="esc-cells">${cellsHtml()}</div>
                <div class="esc-foot"><kbd>ESC</kbd>${esc(t('shell.menu.close', undefined, '닫기'))}${foot}</div>
            </div>`;
        el.addEventListener('click', (e) => {
            const hit = e.target as HTMLElement | null;
            const pick = hit?.closest?.('[data-esc-pick]');
            if (pick && custom) custom.pick(pick.getAttribute('data-esc-pick') || '');
            if (hit?.closest?.('[data-esc-foot]') && custom && custom.foot) custom.foot.pick();
            if (hit?.closest?.('[data-esc-close]')) close();
        });
        document.body.appendChild(el);
        fillName(el);
        return el;
    }

    function defaultCellsHtml(): string {
        return CELLS.map((c) => {
            const label = esc(t(c.key, undefined, c.fallback));
            const icon = `<span class="esc-ic" style="--esc-m:url(${ICON_BASE}${c.icon}.png)"></span>`;
            /* 도구 목록은 본문이 박힌 장이라 링크. 나머지는 셸 화면 (`data-goto`).
               주소 셋 (site-hosts): 다른 호스트로 가야 하면 절대 주소 링크 */
            if (c.id === 'tools') return `<a class="esc-cell" href="${esc(toolIndexPath())}" data-esc-close="1">${icon}<b>${label}</b></a>`;
            if (c.id === 'blog') return `<a class="esc-cell" href="${esc(blogUrl())}" data-esc-close="1">${icon}<b>${label}</b></a>`;
            if (onSplitHost()) {
                const kind = hostKind();
                if (c.id === 'mydash' && kind !== 'dash') return `<a class="esc-cell" href="${esc(dashUrl())}" data-esc-close="1">${icon}<b>${label}</b></a>`;
                if (c.id !== 'mydash' && kind !== 'lab') return `<a class="esc-cell" href="${esc(labUrl(c.id))}" data-esc-close="1">${icon}<b>${label}</b></a>`;
            }
            return `<button type="button" class="esc-cell" data-goto="${c.id}" data-esc-close="1">${icon}<b>${label}</b></button>`;
        }).join('');
    }

    /* 이름은 계정 닉네임. 계정 조각은 나중에 오므로 구독으로 받는다. 없으면 기본 이름 그대로 */
    function fillName(el: HTMLElement): void {
        const account = (window as unknown as { KarmoAccount?: { subscribe?: (fn: (s: unknown) => void) => void } }).KarmoAccount;
        if (!account || !account.subscribe) return;
        account.subscribe((state) => {
            const name = (state as { account?: { displayName?: string } } | null)?.account?.displayName || '';
            const b = el.querySelector('.esc-name');
            if (b && name) b.textContent = name;
        });
    }

    function isOpen(): boolean { return !!root && !root.hidden; }

    function open(): void {
        if (soloSite() && !custom) return;
        if (!root) root = build();
        if (isOpen()) return;
        lastFocus = document.activeElement as HTMLElement | null;
        root.hidden = false;
        document.documentElement.setAttribute('data-esc-menu', '1');
        /* 다른 떠 있는 것 (설정 목록 등) 은 닫힌다. 셸이 이 이름을 듣는다 */
        window.dispatchEvent(new CustomEvent('karmolab:popover-open', { detail: 'esc-menu' }));
        (root.querySelector('.esc-cell') as HTMLElement | null)?.focus();
    }

    function close(): void {
        if (!isOpen() || !root) return;
        root.hidden = true;
        document.documentElement.removeAttribute('data-esc-menu');
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
        lastFocus = null;
    }

    function toggle(): void { if (isOpen()) close(); else open(); }

    /* 글을 치는 자리에서는 ESC 를 가로채지 않는다. 팔레트나 설정 창이 떠 있으면 그쪽 몫 */
    function typing(el: Element | null): boolean {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
    }
    function otherLayerOpen(): boolean {
        const palette = (window as unknown as { KarmoPalette?: { isOpen?: () => boolean } }).KarmoPalette;
        if (palette?.isOpen?.()) return true;
        return !!document.querySelector('#settingsMenu, .kl-modal-overlay, .tb-lightbox-overlay, dialog[open]');
    }

    /* dash 사이트는 KarmoLab 껍데기가 없다. 대시보드가 칸을 끼워 줄 때만 뜬다 */
    const soloSite = () => document.documentElement.getAttribute('data-site') === 'dash';
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || (soloSite() && !custom)) return;
        if (isOpen()) { e.preventDefault(); close(); return; }
        if (typing(document.activeElement) || otherLayerOpen()) return;
        e.preventDefault();
        open();
    });
    addEventListener('karmolab:popover-open', (e) => {
        if ((e as CustomEvent).detail !== 'esc-menu') close();
    });

    /** 칸을 바꿔 끼운다. 판은 다음에 열 때 새로 짓는다 */
    function use(next: Custom | null): void {
        custom = next;
        close();
        if (root) { root.remove(); root = null; }
    }

    return { open, close, toggle, isOpen, use };
})();

(window as unknown as { KarmoEscMenu: typeof KarmoEscMenu }).KarmoEscMenu = KarmoEscMenu;
