/**
 * mascari4615.com 뿌리. 내 주소들을 안내하는 한 장 (사용자 2026-09-22).
 * Worker 안에 박아 두어 Pages 배포와 무관하게 늘 뜬다. 그림 없음, 글자와 링크만.
 * 색과 글꼴은 KarmoLab 첫 화면 토큰 (남색 글자, 주황 하나, 흰 판). 밝기는 기기 설정대로
 */
export const LINKS = [
  { href: 'https://lab.mascari4615.com/', name: 'KarmoLab', en: 'LAB', desc: '도구, 오락실, 커뮤니티' },
  { href: 'https://blog.mascari4615.com/', name: '글', en: 'BLOG', desc: '개발 기록과 생각' },
  { href: 'https://dash.mascari4615.com/', name: '대시보드', en: 'DASH', desc: '로그인한 본인만' },
  { href: 'https://files.mascari4615.com/', name: '파일', en: 'FILES', desc: '암호화된 개인 저장소' },
  { href: 'https://github.com/Mascari4615', name: 'GitHub', en: 'CODE', desc: '소스와 이슈' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function landingHtml() {
  const cards = LINKS.map((l) => `<a class="c" href="${esc(l.href)}"><span class="en">${esc(l.en)}</span><b>${esc(l.name)}</b><span class="d">${esc(l.desc)}</span></a>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mascari4615</title>
<meta name="description" content="Mascari4615 의 주소들. KarmoLab, 글, 대시보드, 파일, GitHub">
<style>
:root{--bg:#c9d6e4;--bg2:#a9c6e6;--paper:rgba(255,255,255,.82);--edge:rgba(255,255,255,.95);--ink:#182238;--ink2:#56607a;--ink3:#96a0b8;--acc:#e8862e}
@media(prefers-color-scheme:dark){:root{--bg:#0f141c;--bg2:#1a2536;--paper:rgba(20,26,36,.78);--edge:rgba(255,255,255,.18);--ink:#f2f4f7;--ink2:#aab2c0;--ink3:#6f7a8c;--acc:#f0a04b}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{font:15px/1.5 "Gothic A1","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;color:var(--ink);background:linear-gradient(160deg,var(--bg2),var(--bg) 60%);padding:56px 24px}
.w{max-width:960px;margin:0 auto}
.en{font-family:Oswald,"Segoe UI",sans-serif;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink3)}
h1{font-size:32px;font-weight:900;margin:6px 0 4px}
p.s{margin:0 0 28px;color:var(--ink2)}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.c{display:flex;flex-direction:column;justify-content:flex-end;min-height:150px;padding:16px 18px;background:var(--paper);border:1px solid var(--edge);color:var(--ink);text-decoration:none;position:relative;transition:border-color .15s}
.c:hover{border-color:var(--acc)}
.c b{font-size:19px;font-weight:900;margin-top:auto}
.c .d{font-size:12px;color:var(--ink2);margin-top:2px}
.c:first-child{background:var(--acc);color:#fff}.c:first-child .en,.c:first-child .d{color:#fff;opacity:.75}
.f{margin-top:28px;font-size:12px;color:var(--ink3)}
</style></head><body><div class="w">
<span class="en">Mascari4615</span>
<h1>내 주소들</h1>
<p class="s">마녀와 인형의 세계를 만드는 인디 개발자. 아래에서 고르세요.</p>
<div class="g">${cards}</div>
<p class="f">mascari4615.com</p>
</div></body></html>`;
}
