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

/** 대시보드로 가는 주소. 대시보드는 lab 위젯이 아니라 전용 장 (`apps/karmolab/dash/index.html`).
 *  로컬과 github.io 는 그 원본 자리. dev 서버에는 조립된 `/dash/` 가 없다 */
export function dashUrl(): string {
    if (!onSplitHost()) return '/apps/karmolab/dash/index.html';
    return hostKind() === 'dash' ? '/' : HOSTS.dash + '/';
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

/** 소개 주소. 소개는 blog 소속 (2026-09-23 사용자 결정 "About 페이지 블로그로") */
export function aboutUrl(): string {
    return onSplitHost() && hostKind() !== 'blog' ? HOSTS.blog + '/about/' : '/about/';
}
