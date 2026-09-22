/**
 * 호스트별 경로 변환. Worker 와 시험이 같이 쓴다 (memo change.site-split).
 *
 * 원본은 GitHub Pages 하나 (`mascari4615.github.io`). 호스트가 달라도 파일은 같고, 뿌리 (`/`) 만 호스트마다 다르게
 *   lab.*   뿌리 그대로 (KarmoLab 셸)
 *   dash.*  뿌리를 전용 front (`/dash/`) 로. KarmoLab 셸을 안 싣는 제 장
 *   mascari4615.com (apex, www) 는 안내 한 장 (`landing.mjs`). 원본으로 안 감
 *   blog.*  뿌리를 글 목록 (`/posts/`) 으로
 * 그 외 경로는 그대로. 되돌리기는 DNS 삭제
 */
export const ROOT_BY_HOST = {
  lab: '/',
  dash: '/dash/',
  blog: '/posts/',
};

/** 호스트의 첫 조각 (`lab.mascari4615.com` -> `lab`). 모르는 호스트는 lab 취급 */
export function kindOf(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'mascari4615.com' || h === 'www.mascari4615.com') return 'home';
  const first = h.split('.')[0];
  return Object.prototype.hasOwnProperty.call(ROOT_BY_HOST, first) ? first : 'lab';
}

/** 요청 경로를 원본 경로로. `/` 와 `/index.html` 만 바꾼다 */
export function originPath(host, pathname) {
  const kind = kindOf(host);
  if (kind === 'home') return null;
  if (pathname === '/' || pathname === '/index.html') return ROOT_BY_HOST[kind];
  return pathname;
}
