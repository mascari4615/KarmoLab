/**
 * 호스트별 경로 변환. Worker 와 시험이 같이 쓴다 (memo change.site-split).
 *
 * 원본은 GitHub Pages 하나. 호스트가 달라도 파일은 같고, 뿌리 (`/`) 만 호스트마다 다르게
 *   lab.*   뿌리 그대로 (KarmoLab 셸)
 *   dash.*  뿌리 그대로. 셸이 호스트를 보고 대시보드를 첫 화면으로 (toolbox.ts hostDefaultPage)
 *   blog.*  뿌리를 글 목록 (`/posts/`) 으로 (2단계. 지금은 GitHub Pages 가 직접 받음)
 * 그 외 경로는 그대로. 되돌리기는 DNS 삭제
 */
export const ROOT_BY_HOST = {
  lab: '/',
  dash: '/',
  blog: '/posts/',
};

/** 호스트의 첫 조각 (`lab.mascari4615.com` -> `lab`). 모르는 호스트는 lab 취급 */
export function kindOf(host) {
  const first = String(host || '').split('.')[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROOT_BY_HOST, first) ? first : 'lab';
}

/** 요청 경로를 원본 경로로. `/` 와 `/index.html` 만 바꾼다 */
export function originPath(host, pathname) {
  const kind = kindOf(host);
  if (pathname === '/' || pathname === '/index.html') return ROOT_BY_HOST[kind];
  return pathname;
}
