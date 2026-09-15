/**
 * 내 AI 위젯의 브라우저 소스 + 대시보드 로그인 전 화면틀 스모크 (jsdom)
 *
 * 무엇을 재나. 지은 묶음을 가짜 창에 실어 그림. 브라우저도 노트북도 안 부름.
 *  ① 열쇠 없음. 카드 대신 비밀번호 줄
 *  ② 열쇠 있음. `fetch` 를 가짜로 바꿔 노트북 응답 (밀어 받은 카드, `from:mois`) 이 게이지와
 *     낡음 칩과 출처 노트로 그려지는지. 로그인 버튼은 브라우저에서 없음
 *  ③ 401 이면 열쇠 폐기 후 다시 질문
 *  ④ 대시보드 홈 `renderEmpty`: 날짜 + 카드 일곱, 값은 하이픈, 열기 없음
 *
 * 먼저 `node build.mjs`. exit 0 이 통과, 1 은 하나라도 어긋남
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WIDGET = path.join(root, 'js/widgets/my-ai.js');
const HOME = path.join(root, 'js/widgets/mydash/home.js');
/* i18n 묶음은 구운 것을 그대로 싣는다. jsdom 은 script 를 안 받아 loadNamespace 가 못 채우고,
   새 열쇠는 코드에 한국어 기본값이 없어 (i18n-source 기준선) 없으면 t() 가 던진다 */
const I18N = path.join(root, 'js/i18n/ko/my-ai.js');
for (const b of [WIDGET, HOME, I18N]) {
  if (!fs.existsSync(b)) {
    console.error('[my-ai-web] 묶음이 없다. 먼저 node build.mjs: ' + b);
    process.exit(1);
  }
}

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  <- ' + detail));
  if (!ok) failed++;
}
const tick = () => new Promise((r) => setTimeout(r, 30));

/** 노트북이 내주는 모양 그대로. 밀어 받은 Claude 카드 + 못 잰 Codex */
const laptopBody = {
  ok: true,
  cards: [
    {
      id: 'claude', label: 'Claude', accent: '#d97757', error: null,
      quota: {
        live: false, observed_at: Math.floor(Date.now() / 1000) - 300, plan: 'max',
        windows: [{ key: 'five_hour', used_percent: 3, resets_at: Math.floor(Date.now() / 1000) + 3600 }],
        counts: [], last_rate_limited_at: null, notes: ['from:mois'],
      },
    },
    { id: 'codex', label: 'Codex', accent: '#10a37f', error: 'no-credentials', quota: null },
  ],
};

function bootWidget({ key, fetchImpl }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://blog.mascari4615.com/apps/karmolab/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (key) window.localStorage.setItem('laptop.pc.key', key);
  const calls = [];
  window.fetch = async (url, opts) => {
    calls.push(String(url));
    return fetchImpl(String(url), opts);
  };
  window.AbortSignal.timeout = () => undefined;
  window.__KARMO_I18N_NS = [];
  window.__KARMO_LOCALE = 'ko';
  window.eval(fs.readFileSync(I18N, 'utf8'));
  const registered = [];
  window.Toolbox = {
    register: (t) => registered.push(t),
    onDispose: () => undefined,
    ensureScript: () => Promise.resolve(),
  };
  window.Mdd = { injectCSS: () => undefined };
  window.eval(fs.readFileSync(WIDGET, 'utf8'));
  const tool = registered[0];
  const rootEl = window.document.createElement('div');
  window.document.body.appendChild(rootEl);
  tool.tabs[0].build(rootEl);
  return { window, rootEl, calls, tool };
}

/* ① 열쇠 없음 */
{
  const { window, rootEl, calls } = bootWidget({ key: '', fetchImpl: async () => ({ ok: true, status: 200, json: async () => laptopBody }) });
  await tick();
  const row = rootEl.querySelector('.myai-keyrow');
  check('① 열쇠 없으면 비밀번호 줄이 보인다', row && !row.hidden);
  check('① 노트북을 안 부른다', calls.length === 0, calls.join(','));
  check('① 카드 없음', rootEl.querySelectorAll('.myai-card').length === 0);
  void window;
}

/* ② 열쇠 있음 */
{
  const { rootEl, calls, tool } = bootWidget({ key: 'pw', fetchImpl: async () => ({ ok: true, status: 200, json: async () => laptopBody }) });
  await tick();
  check('② 노트북 /ai-quota/api 를 열쇠로 부른다', calls.length === 1 && /\/ai-quota\/api\?k=pw$/.test(calls[0]), calls.join(','));
  const cards = rootEl.querySelectorAll('.myai-card');
  check('② 카드 두 장', cards.length === 2, String(cards.length));
  check('② 게이지 하나 (5시간)', rootEl.querySelectorAll('.myai-bar').length === 1);
  check('② 낡음 칩 (라이브 아님)', !!rootEl.querySelector('.myai-chip--stale') && !rootEl.querySelector('.myai-chip--live'));
  const notes = Array.from(rootEl.querySelectorAll('.myai-note')).map((n) => n.textContent);
  check('② 출처 노트에 mois', notes.some((n) => n.includes('mois')), notes.join(' | '));
  check('② 브라우저에는 로그인 버튼 없음', !rootEl.querySelector('[data-claude-login]'));
  check('② Codex 는 오류 문구', !!rootEl.querySelector('.myai-card--error'));
  check('② 비밀번호 줄은 숨김', rootEl.querySelector('.myai-keyrow').hidden === true);
  check('② 등록에 desktopOnly 없음', tool.desktopOnly !== true);
}

/* ③ 401 */
{
  const { window, rootEl } = bootWidget({ key: 'bad', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await tick();
  check('③ 401 이면 열쇠를 버린다', window.localStorage.getItem('laptop.pc.key') === null);
  check('③ 다시 묻는다', rootEl.querySelector('.myai-keyrow').hidden === false);
}

/* ④ 대시보드 홈 빈 화면틀 */
{
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://blog.mascari4615.com/apps/karmolab/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.__KARMO_I18N_NS = [];
  window.fetch = () => Promise.reject(new Error('fetch 금지'));
  window.eval(fs.readFileSync(HOME, 'utf8'));
  const panel = window.KarmoDash && window.KarmoDash.panels.find((p) => p.id === 'home');
  check('④ 홈 패널에 renderEmpty', !!(panel && typeof panel.renderEmpty === 'function'));
  if (panel && panel.renderEmpty) {
    const box = window.document.createElement('div');
    window.document.body.appendChild(box);
    panel.renderEmpty(box);
    const cards = box.querySelectorAll('.mydh-card');
    check('④ 빈 카드 일곱', cards.length === 7, String(cards.length));
    check('④ 값은 하이픈', Array.from(box.querySelectorAll('.mydh-big')).every((b) => b.textContent === '-'));
    check('④ 열기 없음', box.querySelectorAll('[data-open]').length === 0);
    check('④ 날짜 줄', !!box.querySelector('.mydh-date'));
  }
}

console.log(failed ? `[my-ai-web] FAIL ${failed}` : '[my-ai-web] OK');
process.exit(failed ? 1 : 0);
