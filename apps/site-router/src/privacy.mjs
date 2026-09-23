/**
 * mascari4615.com/privacy. Google OAuth 앱 게시에 필요한 개인정보처리방침 한 장 (사용자 2026-09-23).
 * 어디에도 링크하지 않음 (사용자 "좀 잘 안 보이는 곳에"). 문구는 사용자 승인본 그대로
 */
export const PRIVACY_TEXT = [
  'Mascari4615 개인 대시보드는 본인 Google 캘린더와 할 일을 본인 브라우저에서만 읽고 씁니다.',
  '서버는 로그인 토큰 교환만 중계하며 데이터를 저장하지 않습니다.',
  '연결 해제는 대시보드의 로그아웃 또는 Google 계정 권한 설정에서 할 수 있습니다.',
  '문의: mascari4615@gmail.com',
];

export function privacyHtml() {
  const rows = PRIVACY_TEXT.map((l) => `<p>${l}</p>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Privacy</title>
<style>
:root{--bg:#f4f6f9;--ink:#182238}
@media(prefers-color-scheme:dark){:root{--bg:#0f141c;--ink:#f2f4f7}}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:15px/1.7 "Gothic A1","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;padding:48px 24px}
main{max-width:560px;margin:0 auto}
</style></head><body><main>${rows}</main></body></html>`;
}
