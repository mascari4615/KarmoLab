/**
 * **어느 사이트를 재고 있나**. 한 이름으로 (2026-08-14)
 *
 * 라이브 점검 러너와 워크플로는 볼 곳을 `BASE` 하나로 정해 준다. 그런데 검사 열여섯 개는
 * `URL` 만 읽고, 그 기본값에 **실서비스 주소를 박아** 두고 있었다. 그래서 `BASE` 를 다른
 * 곳(미리보기, 스테이징)으로 줘도 그 열여섯은 **실서비스**를 재고 초록을 냈다 . 
 * 재는 대상이 내가 생각한 그것이 아닌데도 판정은 나온다(오늘 red-walk 중에 걸렸다:
 * `BASE=http://127.0.0.1:1` 로 돌렸는데 다섯이 멀쩡히 초록이었다. 실서비스를 보고 있었다).
 *
 * 규약: `URL` 이 있으면 그 장을 그대로 본다(한 장만 콕 집을 때). 없으면 `BASE` + 길.
 * 실서비스 주소는 **여기 한 곳**에만 적는다.
 */
export const defaultSite = 'https://blog.mascari4615.com';

/** 이 판이 보는 사이트 (프로토콜+호스트). */
export const liveBase = () => process.env.BASE || defaultSite;

/** 사이트 조립기가 내보낸 루트 판본 경로. */
export const liveBuildUrl = (base = liveBase()) => base.replace(/\/+$/, '') + '/build.json';

/** 조립 사이트 sha와 별도 앱 commit의 공통 판본 값. 빈 값은 조회 실패. */
export function buildRevision(body) {
  const value = body?.sha ?? body?.commit;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 이 판이 열 장.
 * @param {string} path 사이트 안의 길 (`/` 처럼 앞에 빗금)
 */
export const livePage = (path = '/') => process.env.URL || liveBase().replace(/\/+$/, '') + path;
