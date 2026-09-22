/**
 * 주소 셋 (memo change.site-split, 2026-09-22). 코드는 하나, 호스트가 셋.
 *   lab.mascari4615.com  KarmoLab (첫 화면 로비, 도구, 오락실, 커뮤니티)
 *   blog.mascari4615.com 글
 *   dash.mascari4615.com 대시보드
 * 셸은 지금 어느 호스트인지 알고, 서로 가는 링크는 절대 주소로
 * 로컬 (127.0.0.1, localhost) 과 mascari4615.github.io 는 lab 취급, 링크는 같은 origin 의 해시.
 */
export type HostKind = 'lab' | 'blog' | 'dash';

const DOMAIN = 'mascari4615.com';
const HOSTS: Record<HostKind, string> = {
    lab: `https://lab.${DOMAIN}`,
    blog: `https://blog.${DOMAIN}`,
    dash: `https://dash.${DOMAIN}`,
};

export function hostKind(host: string = typeof location !== 'undefined' ? location.host : ''): HostKind {
    const first = String(host || '').split('.')[0].toLowerCase();
    if (first === 'dash' || first === 'blog') return first;
    return 'lab';
}

/** 실서비스 셋 중 하나인가. 아니면 (로컬, github.io) 링크는 같은 origin */
export function onSplitHost(host: string = typeof location !== 'undefined' ? location.host : ''): boolean {
    return String(host || '').endsWith('.' + DOMAIN);
}

/** 대시보드로 가는 주소. 같은 호스트면 해시, 다른 호스트면 dash 뿌리 */
export function dashUrl(): string {
    if (!onSplitHost()) return '#mydash';
    return hostKind() === 'dash' ? '#mydash' : HOSTS.dash + '/';
}

/** KarmoLab 첫 화면으로 가는 주소 */
export function labUrl(page: string = 'home'): string {
    const hash = page === 'home' ? '' : '#' + page;
    if (!onSplitHost()) return hash || '#home';
    return hostKind() === 'lab' ? (hash || '#home') : HOSTS.lab + '/' + hash;
}

/** 글 목록 주소 */
export function blogUrl(): string {
    return onSplitHost() ? HOSTS.blog + '/posts/' : '/posts/';
}

/** 이 호스트에서 뿌리 (`/`) 로 들어왔을 때 먼저 보일 화면. dash 는 대시보드 */
export function hostDefaultPage(): string | null {
    return onSplitHost() && hostKind() === 'dash' ? 'mydash' : null;
}
