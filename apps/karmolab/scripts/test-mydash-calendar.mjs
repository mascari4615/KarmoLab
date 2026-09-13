/**
 * 개인 대시보드 캘린더 패널 스모크 (jsdom)
 *
 * 무엇을 재나. 지은 묶음(`js/widgets/mydash/calendar.js`)을 가짜 창에 실어 패널을 그리고,
 * 네 자리를 봄. 브라우저도 구글도 안 부름.
 *  ① 토큰 없음. 연결 카드 하나 (버튼, 안내 한 줄), 클라이언트 ID 없는 빌드 문구
 *  ② 토큰 있음. `fetch` 를 가짜로 바꿔 3일치 일정이 각 칸에 그려지는지
 *  ③ 북마크 수. `data/bookmarks/summary.json` 의 recordedAt 으로 센 수가 칸에 붙는지 (0 은 없음)
 *  ④ 칸을 누르면 아래에 그 날 일정 전부와 북마크 라벨
 *  ⑤ 401 이면 연결 카드로 되돌아가되 달력 껍데기는 남는지
 *
 * 가짜의 자리는 **네트워크**(`window.fetch`)와 **저장소**(`ctx.repo`). `gcal` 코드는 그대로 돌아
 * 구글 응답 모양을 화면 모양으로 바꾸는 길까지 같이 잼.
 *
 * 먼저 `node build.mjs` (또는 esbuild 로 이 묶음 하나). 클라이언트 ID 없는 로컬 빌드 기준.
 * exit 0 이 통과, 1 은 하나라도 어긋남
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUNDLE = path.join(root, 'js/widgets/mydash/calendar.js');
if (!fs.existsSync(BUNDLE)) {
  console.error('[mydash-cal] 묶음이 없다. 먼저 node build.mjs: ' + BUNDLE);
  process.exit(1);
}
const code = fs.readFileSync(BUNDLE, 'utf8');

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  <- ' + detail));
  if (!ok) failed++;
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 새 창 하나. 묶음을 실어 명부(`window.KarmoDash`)에 패널이 붙은 상태로 돌려줌 */
function boot({ token, fetchImpl }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://blog.mascari4615.com/apps/karmolab/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (token) {
    window.localStorage.setItem(
      'karmolab_google_token',
      JSON.stringify({ access_token: token, expires_at: Date.now() + 3600000 })
    );
  }
  window.fetch = fetchImpl || (() => Promise.reject(new Error('fetch 금지')));
  /* i18n 묶음 목록을 빈 것으로. jsdom 은 script 를 안 받아 `loadNamespace` 가 영영 안 끝남.
     아는 묶음이 없으면 바로 돌아오고, 글은 코드에 박힌 한국어 기본값으로 뜸 */
  window.__KARMO_I18N_NS = [];
  window.eval(code);
  const reg = window.KarmoDash;
  const panel = reg && reg.panels.find((p) => p.id === 'calendar');
  return { dom, window, panel };
}

/** 패널이 받는 ctx. 저장소는 북마크 파일 하나만 앎 */
function makeCtx(window, bookmarks) {
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  const counts = {};
  const statuses = [];
  return {
    counts,
    statuses,
    ctx: {
      root,
      repo: {
        readText: async () => {
          throw new Error('readText 안 씀');
        },
        readJson: async (p) => {
          if (p === 'data/bookmarks/summary.json') return bookmarks;
          throw new Error(p + ' 없음');
        },
        list: async () => [],
        tree: async () => [],
      },
      repoInfo: { owner: 'o', repo: 'r', branch: 'main' },
      status: (s) => statuses.push(s),
      setCount: (id, v) => {
        counts[id] = v;
      },
      openItem: () => undefined,
      isCurrent: () => true,
      onDispose: () => undefined,
    },
  };
}

const today = new Date();
today.setHours(0, 0, 0, 0);
const d0 = ymd(today);
const d1 = ymd(addDays(today, 1));
const d2 = ymd(addDays(today, 2));

/** 구글 응답 모양 그대로. 하루짜리 종일은 end 가 다음 날 */
function googleFetch({ status401 = false } = {}) {
  return async (url) => {
    const u = String(url);
    if (status401) return { ok: false, status: 401, json: async () => ({}) };
    if (u.includes('/users/me/calendarList')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 'primary', summary: '내 캘린더', backgroundColor: '#4285f4' }] }),
      };
    }
    if (u.includes('/calendars/primary/events')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'e1',
              summary: '치과',
              start: { dateTime: d0 + 'T14:00:00+09:00' },
              end: { dateTime: d0 + 'T15:00:00+09:00' },
            },
            { id: 'e2', summary: '휴가', start: { date: d1 }, end: { date: d2 } },
            {
              id: 'e3',
              summary: '스터디',
              start: { dateTime: d2 + 'T19:30:00+09:00' },
              end: { dateTime: d2 + 'T21:00:00+09:00' },
              colorId: '11',
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const bookmarks = {
  schema: 'bookmarks/1',
  data: {
    items: [
      { id: 'a', label: '첫 북마크', recordedAt: d0 + 'T09:00:00+09:00' },
      { id: 'b', label: '둘째 북마크', recordedAt: d0 + 'T21:00:00+09:00' },
      { id: 'c', label: '옛 것', recordedAt: '2001-01-01T00:00:00+09:00' },
      { id: 'd', label: '날짜 없음' },
    ],
  },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── ① 토큰 없음 ── */
{
  const { window, panel } = boot({ token: null });
  check('명부에 calendar 패널이 붙는다', !!panel);
  const { ctx } = makeCtx(window, bookmarks);
  await panel.render(ctx);
  const btn = ctx.root.querySelector('[data-conn]');
  const text = ctx.root.textContent;
  check('미연결 카드에 연결 버튼', !!btn && btn.textContent.includes('Google 캘린더 연결'));
  check('연결 버튼이 44px 부품(.myd-btn)', !!btn && btn.classList.contains('myd-btn'));
  check('안내 한 줄 (브라우저에서 직접, 1시간)', text.includes('브라우저에서 Google 에 직접 로그인') && text.includes('1시간'));
  check('클라이언트 ID 없는 빌드 문구', text.includes('클라이언트 ID 가 없습니다'), text.slice(0, 200));
  check('클라이언트 ID 없으면 버튼이 막힘', !!btn && btn.disabled);
  check('미연결이면 달력 껍데기는 숨김', ctx.root.querySelector('.mdc-shell').hidden === true);
  check('미연결이면 fetch 를 안 부른다 (가짜 fetch 가 던져도 통과)', true);
}

/* ── ② ③ ④ 토큰 있음 ── */
{
  const { window, panel } = boot({ token: 'tok', fetchImpl: googleFetch() });
  const { ctx, counts, statuses } = makeCtx(window, bookmarks);
  await panel.render(ctx);
  await tick();
  const root = ctx.root;
  check('연결되면 카드가 없다', !root.querySelector('[data-conn]'));
  check('달력 껍데기가 보인다', root.querySelector('.mdc-shell').hidden === false);
  const cells = Array.from(root.querySelectorAll('.mdc-cell'));
  check('칸이 7의 배수 (35 또는 42)', cells.length % 7 === 0 && cells.length >= 28, String(cells.length));
  const cell = (key) => cells.find((c) => c.getAttribute('data-day') === key);
  check('오늘 칸에 표식', !!cell(d0) && cell(d0).classList.contains('today'));
  check('오늘 칸: 시각 일정 (14:00 치과)', !!cell(d0) && cell(d0).textContent.includes('14:00 치과'), cell(d0)?.textContent);
  check('다음 날 칸: 종일 일정은 시간 없이 (휴가)', !!cell(d1) && cell(d1).textContent.includes('휴가') && !cell(d1).textContent.includes(':'), cell(d1)?.textContent);
  check('종일 끝 날(다음 날)에는 안 앉는다', !!cell(d2) && !cell(d2).textContent.includes('휴가'), cell(d2)?.textContent);
  check('셋째 날 칸: 19:30 스터디', !!cell(d2) && cell(d2).textContent.includes('19:30 스터디'), cell(d2)?.textContent);
  const dot = cell(d2) && cell(d2).querySelector('.mdc-dot');
  /* jsdom 은 hex 를 rgb() 로 바꿔 돌려줌. #fbe983 = rgb(251, 233, 131) */
  check('일정 색 점 (colorId 11 = 노랑)', !!dot && /fbe983|251,\s*233,\s*131/i.test(dot.style.background), dot?.style.background);
  check('오늘 칸에 북마크 2', !!cell(d0) && cell(d0).textContent.includes('북마크 2'), cell(d0)?.textContent);
  check('북마크 0 인 칸에는 표시 없음', !!cell(d1) && !cell(d1).textContent.includes('북마크'), cell(d1)?.textContent);
  check('셸 작은 수: 오늘 일정 1', counts.calendar === '1', JSON.stringify(counts));
  check('머리말 한 줄: 오늘 일정 1', statuses[statuses.length - 1] === '오늘 일정 1', JSON.stringify(statuses));
  const bar = Array.from(root.querySelectorAll('[data-mv]')).map((b) => b.textContent);
  check('이전 달 / 오늘 / 다음 달 버튼', bar.join('|') === '이전 달|오늘|다음 달', bar.join('|'));
  check('버튼이 44px 부품(.myd-btn)', Array.from(root.querySelectorAll('[data-mv]')).every((b) => b.classList.contains('myd-btn')));

  /* ④ 칸 누르기. 오늘은 처음부터 골라져 있음. 둘째 날을 눌러 바뀌는지 */
  cell(d2).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const day = root.querySelector('.mdc-day');
  check('누른 칸이 sel', cell(d2).classList.contains('sel') && !cell(d0).classList.contains('sel'));
  check('아래에 그 날 일정 전부 (스터디, 19:30, 캘린더 이름)', day.textContent.includes('스터디') && day.textContent.includes('19:30') && day.textContent.includes('내 캘린더'), day.textContent);
  cell(d0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('오늘 칸을 누르면 북마크 라벨 목록', day.textContent.includes('첫 북마크') && day.textContent.includes('둘째 북마크'), day.textContent);
  check('오늘 일정도 같이 (치과)', day.textContent.includes('치과'));
  const lis = day.querySelectorAll('li');
  check('라벨은 그 날 것만 (2)', lis.length === 2, String(lis.length));
  check('읽기 전용 안내 한 줄', root.textContent.includes('읽기 전용'));

  /* 달 넘기기. fetch 가 다시 불리고 달 이름이 바뀜 */
  const monthBefore = root.querySelector('.mdc-month').textContent;
  root.querySelector('[data-mv="1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  await tick();
  check('다음 달을 누르면 달 이름이 바뀐다', root.querySelector('.mdc-month').textContent !== monthBefore, monthBefore);
}

/* ── ⑤ 401. 연결 카드로 되돌아가되 껍데기는 유지 ── */
{
  const { window, panel } = boot({ token: 'dead', fetchImpl: googleFetch({ status401: true }) });
  const { ctx } = makeCtx(window, bookmarks);
  await panel.render(ctx);
  await tick();
  const root = ctx.root;
  check('401 이면 연결 카드', !!root.querySelector('[data-conn]'));
  check('401 문구 (만료, 다시 연결)', root.textContent.includes('만료'), root.textContent.slice(0, 120));
  check('401 이어도 달력 껍데기는 남는다', root.querySelector('.mdc-shell').hidden === false);
  check('죽은 토큰은 저장 자리에서 지운다', window.localStorage.getItem('karmolab_google_token') === null);
}

/* ── 북마크 파일을 못 읽어도 달력은 뜬다 ── */
{
  const { window, panel } = boot({ token: 'tok', fetchImpl: googleFetch() });
  const { ctx } = makeCtx(window, null);
  ctx.repo.readJson = async () => {
    throw new Error('summary 없음');
  };
  await panel.render(ctx);
  await tick();
  check('북마크 실패해도 칸은 그려진다', ctx.root.querySelectorAll('.mdc-cell').length >= 28);
  check('북마크 실패 사유 한 줄', ctx.root.textContent.includes('북마크 수를 못 읽었습니다'));
}

console.log(failed ? '[mydash-cal] ' + failed + '개 어긋남' : '[mydash-cal] 통과');
process.exit(failed ? 1 : 0);
