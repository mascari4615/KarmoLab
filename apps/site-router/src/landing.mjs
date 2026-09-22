/**
 * mascari4615.com 뿌리. 내 주소들을 안내하는 한 장 (사용자 2026-09-22).
 * Worker 안에 박아 두어 Pages 배포와 무관하게 늘 뜬다. 이름과 링크 다섯뿐 (사용자 "초 미니멀", 내가 지은 문구 금지)
 */
export const LINKS = [
  { href: 'https://lab.mascari4615.com/', name: 'KarmoLab' },
  { href: 'https://blog.mascari4615.com/', name: 'Blog' },
  { href: 'https://dash.mascari4615.com/', name: 'Dash' },
  { href: 'https://files.mascari4615.com/', name: 'Files' },
  { href: 'https://github.com/Mascari4615', name: 'GitHub' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function landingHtml() {
  const rows = LINKS.map((l) => `<a href="${esc(l.href)}">${esc(l.name)}</a>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mascari4615</title>
<style>
:root{--bg:#f4f6f9;--ink:#182238;--ink3:#96a0b8}
@media(prefers-color-scheme:dark){:root{--bg:#0f141c;--ink:#f2f4f7;--ink3:#6f7a8c}}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink)}
body{font:16px/1.6 "Gothic A1","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
main{display:flex;flex-direction:column;gap:6px}
h1{font-size:13px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--ink3);margin:0 0 14px}
a{color:var(--ink);text-decoration:none;font-size:24px;font-weight:900}
a:hover{text-decoration:underline}
</style></head><body><main><h1>Mascari4615</h1>${rows}</main></body></html>`;
}
