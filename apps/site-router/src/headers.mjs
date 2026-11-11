/**
 * 호스트별 보안 응답 헤더. Worker 와 시험이 같이 쓴다 (memo systems/security.md 보안 헤더 절, 2026-11-11).
 *
 * 본문 CSP 정본: 각 장의 `<meta http-equiv="Content-Security-Policy">` (인라인 지문과 같은 파일).
 * 여기: meta 로 못 거는 것만.
 *   HSTS            모든 호스트. includeSubDomains 는 Cloudflare 영역 설정 몫 (HTTPS 없는 하위 주소 차단 위험)
 *   frame-ancestors dash 만 'none'. lab 은 KarmoGraph 삽입 코드로 남의 글에 끼워지는 기능이라 열림
 *   Permissions-Policy dash 만. 카메라, 마이크, 위치 미사용 (2026-11-11 번들 실측)
 */
export const HSTS = 'max-age=31536000';

const DASH = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/* Lab 1단계: 바깥 스크립트 출처만 잠금.
   인라인 제외 이유: 빌드의 내용 변경으로 지문 고정 불가, 지문이 있으면 미리읽기 규칙 꺼짐 (apps/karmolab/scripts/gen-csp-shell.mjs 머리말).
   연결 제외 이유: API 시험기 같은 도구의 임의 주소 호출. 장 146개 생성기 대신 헤더 (meta 셋과 겹쳐 적용).
   출처: gc.zgo.at 방문 수, jsdelivr 배경 제거와 transformers, cdnjs html2canvas (2026-11-11 소스 전수, 전 장 측정 위반 0) */
export const LAB_CSP = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://gc.zgo.at https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
  + "worker-src 'self' blob: https://cdn.jsdelivr.net; object-src 'none'; base-uri 'self'";

/** kind = route.mjs kindOf 값 (lab, dash, blog, home) */
export function securityHeaders(kind) {
  const base = { 'strict-transport-security': HSTS };
  if (kind === 'dash') return { ...base, ...DASH };
  if (kind === 'lab') return { ...base, 'content-security-policy': LAB_CSP };
  return base;
}

/** 평문 HTTP 요청이면 같은 주소의 https 로 보낼 주소. 아니면 null */
export function httpsRedirect(url) {
  if (url.protocol !== 'http:') return null;
  return 'https://' + url.host + url.pathname + url.search;
}
