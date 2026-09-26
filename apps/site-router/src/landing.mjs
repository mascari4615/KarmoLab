/**
 * mascari4615.com 뿌리. 주소 안내 한 장 (사용자 2026-09-22, 초 미니멀, 지은 문구 금지).
 * Dash, Files 는 본인 전용. 화면 앵커는 커맨드 일치 뒤에만. 주소와 커맨드 문자열은 스크립트에 남음.
 * 커맨드 karmo. 소스에 평문이라 암호 자리 아님.
 */
export const LINKS = [
  { href: 'https://lab.mascari4615.com/', name: 'KarmoLab' },
  { href: 'https://blog.mascari4615.com/', name: 'Blog' },
  { href: 'https://github.com/Mascari4615', name: 'GitHub' },
];

export const MINE = [
  { href: 'https://dash.mascari4615.com/', name: 'Dash' },
  { href: 'https://files.mascari4615.com/', name: 'Files' },
];

export const COMMAND = 'karmo';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function landingHtml() {
  const rows = LINKS.map((l) => `<a href="${esc(l.href)}">${esc(l.name)}</a>`).join('');
  const mine = JSON.stringify(MINE.map((l) => [l.href, l.name]));
  const command = JSON.stringify(COMMAND);
  const script = `(function(){
var MINE=${mine};
var COMMAND=${command};
var KEY='mascari4615.mine';
var box=document.getElementById('mine');
var form=document.getElementById('gate');
function show(){
  if(!box.childElementCount){
    for(var i=0;i<MINE.length;i++){
      var a=document.createElement('a');
      a.href=MINE[i][0];
      a.textContent=MINE[i][1];
      box.appendChild(a);
    }
  }
  box.hidden=false;
  form.hidden=true;
}
try{ if(COMMAND && localStorage.getItem(KEY)==='1') show(); }catch(e){}
form.addEventListener('submit',function(ev){
  ev.preventDefault();
  var v=String(new FormData(form).get('command')||'').trim();
  if(!COMMAND || v!==COMMAND){ form.reset(); return; }
  try{ localStorage.setItem(KEY,'1'); }catch(e){}
  show();
});
})();`;
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
#mine{display:flex;flex-direction:column;gap:6px;margin-top:22px}
#mine[hidden]{display:none}
#mine a{font-size:16px;font-weight:400;color:var(--ink3)}
form{margin-top:22px;display:flex;align-items:center;gap:8px}
form[hidden]{display:none}
.p{color:var(--ink3);font-size:16px;font-weight:400}
input{background:transparent;border:0;border-bottom:1px solid var(--ink3);color:var(--ink);font:16px/1.6 "Gothic A1","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;font-weight:400;width:10em;padding:2px 0;outline:none}
</style></head><body><main><h1>Mascari4615</h1>${rows}<form id="gate"><span class="p">&gt;</span><input name="command" autocomplete="off" spellcheck="false" aria-label="커맨드" enterkeyhint="done"></form><div id="mine" hidden></div><script>${script}</script></main></body></html>`;
}
