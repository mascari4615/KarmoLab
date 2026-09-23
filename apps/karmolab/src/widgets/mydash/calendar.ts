/**
 * 개인 대시보드 캘린더 패널. 목록의 **캘린더** 자리.
 *
 * 무엇인가: 구글 캘린더 **월 보기 하나**. 읽기만. 일정 만들기와 고치기는 플래너
 * (`planner/calendar-view.ts`) 몫이고 여기 안 붙임.
 *
 * ★ **한 칸에 두 출처.** 칸마다 그 날 일정(구글)과 그 날 담은 북마크 수(private 저장소의
 *   `data/bookmarks/summary.json`)가 같이 앉음. 실패는 따로임. 구글이 막히면 일정만 비고,
 *   북마크를 못 읽으면 수만 빔. 하나 때문에 다른 하나가 안 보이는 자리 없음.
 *
 * ★ **토큰은 플래너 것을 그대로 씀** (`planner/gauth`, 열쇠 `karmolab_google_token`).
 *   브라우저만으로는 갱신 토큰을 못 받아 한 시간짜리 접근 토큰 한 장이 전부. 그래서 만료나
 *   401 이면 연결 카드로 되돌아가되 **달력 껍데기는 그대로 둠**. 보던 자리를 잃지 않게.
 *
 * ★ **플래너 파일은 안 고침.** `gauth`, `gcal` 을 그대로 import. 달력 그리기
 *   (`calendar-view.ts`)는 안 씀. 그쪽은 FullCalendar 넷과 이 브라우저 캘린더 저장, 일기,
 *   만들기 화면이 한 덩이라 칸에 북마크 수를 얹을 자리가 없음. 여기 필요한 것은 읽기 전용 월 표.
 */
import { dashRegistry, esc } from './kit';
import type { DashPanelCtx, DashRepoRead } from './kit';
import { t, loadNamespace } from '../../lib/i18n';
import { GOOGLE_CLIENT_ID, ensureToken, forgetToken, requestToken } from '../planner/gauth';
import { fetchCalendars, fetchEvents, ymd } from '../planner/gcal';
import type { FcEvent, GoogleCalendar } from '../planner/gcal';

(function (): void {
  'use strict';

  const BOOKMARKS_PATH = 'data/bookmarks/summary.json';
  /** 한 칸에 보이는 일정 줄 수. 넘는 것은 `+n` 한 줄로 접고, 칸을 누르면 아래에 전부 */
  const CELL_MAX = 3;
  /** 일정 하나가 걸칠 수 있는 날 수 상한. 잘못된 end 로 무한 루프 도는 것 막는 자리 */
  const SPAN_MAX = 400;

  const STYLE_ID = 'mydash-calendar-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색, 둥글기, 글자 크기는 전부 스킨 토큰. 여기 직접 적는 것은 손가락 표적과 칸 높이뿐.
       `--myd-tap` 은 셸(`mydash.css`)이 정함. 셸 없이 이 패널만 뜬 자리에서는 44px */
    el.textContent = [
      '.mdc{--mdc-tap:var(--myd-tap,44px);display:flex;flex-direction:column;gap:var(--space-md)}',
      '.mdc-bar{display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap}',
      '.mdc-month{font-size:var(--font-size-md);font-weight:600}',
      '.mdc-week,.mdc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}',
      '.mdc-week span{padding:var(--space-xs) 0;text-align:center;',
      'font-size:var(--font-size-2xs);color:var(--text-tertiary)}',
      '.mdc-cell{display:flex;flex-direction:column;gap:2px;min-height:calc(var(--mdc-tap) * 1.6);',
      'padding:var(--space-xs);border:1px solid var(--border);border-radius:var(--radius-md);',
      'background:var(--bg-secondary);color:var(--text-primary);font:inherit;text-align:left;',
      'cursor:pointer;overflow:hidden}',
      '.mdc-cell.out{background:var(--bg-primary);color:var(--text-tertiary)}',
      '.mdc-cell.today{border-color:var(--accent)}',
      '.mdc-cell.sel{background:var(--bg-hover)}',
      '.mdc-num{font-size:var(--font-size-xs);font-variant-numeric:tabular-nums}',
      '.mdc-cell.today .mdc-num{font-weight:700;color:var(--accent-ink)}',
      '.mdc-ev{display:flex;align-items:center;gap:3px;font-size:var(--font-size-3xs);',
      'line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.mdc-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--accent)}',
      '.mdc-more,.mdc-bm{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.mdc-bm{margin-top:auto}',
      '.mdc-day{display:flex;flex-direction:column;gap:var(--space-xs);padding:var(--space-md);',
      'border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-secondary)}',
      '.mdc-day h3{margin:0;font-size:var(--font-size-md);font-weight:600}',
      '.mdc-day h4{margin:var(--space-xs) 0 0;font-size:var(--font-size-xs);font-weight:600;',
      'color:var(--text-tertiary)}',
      '.mdc-day ul{margin:0;padding-left:1.2em;font-size:var(--font-size-sm);line-height:1.7;',
      'color:var(--text-secondary)}',
      '.mdc-row{display:flex;align-items:baseline;gap:var(--space-xs);',
      'font-size:var(--font-size-sm);line-height:1.7}',
      '.mdc-row em{font-style:normal;font-variant-numeric:tabular-nums;',
      'color:var(--text-tertiary);font-size:var(--font-size-xs)}',
      '.mdc-row i{font-style:normal;color:var(--text-tertiary);font-size:var(--font-size-2xs)}',
      '.mdc-quiet{font-size:var(--font-size-xs);color:var(--text-tertiary)}',
      /* 폰. 칸이 좁아 일정 줄이 글자 하나만 남기보다 날짜와 점이 보이는 편이 읽힘 */
      '@media(max-width:520px){.mdc-cell{min-height:calc(var(--mdc-tap) * 1.2)}}',
    ].join('');
    document.head.appendChild(el);
  }

  /* ── 날짜 셈. 전부 **보는 사람의 지역 시간** 기준.
     구글이 주는 것도 지역 시간으로 받아 그림. UTC 로 자르면 새벽에 하루가 밀림 ── */

  function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }
  /** `YYYY-MM-DD` 를 그 날 0시로 */
  function parseDay(key: string): Date {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    const d = Number(key.slice(8, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function dayStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function hhmm(d: Date): string {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /**
   * 일정 하나가 앉는 날 목록.
   *
   * ★ **종일 일정의 끝은 다음 날** (구글과 `gcal` 의 규약). 그래서 끝 날은 안 셈. 여기서 하루를
   *   손으로 더하거나 빼면 그것이 곧 버그 (`gcal.ts` 머리말과 같은 자리).
   *   시각 일정은 자정 정각에 끝나는 것만 그 날을 안 셈. 23:00~00:00 이 다음 날 칸에 얼룩으로
   *   남는 것 방지.
   */
  function eventDays(ev: FcEvent): string[] {
    const out: string[] = [];
    if (ev.allDay) {
      const from = (ev.start || '').slice(0, 10);
      if (!from) return out;
      const to = (ev.end || '').slice(0, 10);
      const limit = to > from ? parseDay(to) : addDays(parseDay(from), 1);
      let cur = parseDay(from);
      for (let i = 0; i < SPAN_MAX && cur.getTime() < limit.getTime(); i++) {
        out.push(ymd(cur));
        cur = addDays(cur, 1);
      }
      return out;
    }
    const s = new Date(ev.start);
    if (!isFinite(s.getTime())) return out;
    const e = new Date(ev.end || ev.start);
    const last = isFinite(e.getTime()) && e.getTime() > s.getTime() ? e : s;
    const midnight = last.getHours() === 0 && last.getMinutes() === 0 && last.getTime() > s.getTime();
    const stop = midnight ? addDays(dayStart(last), -1) : dayStart(last);
    let cur = dayStart(s);
    for (let i = 0; i < SPAN_MAX && cur.getTime() <= stop.getTime(); i++) {
      out.push(ymd(cur));
      cur = addDays(cur, 1);
    }
    if (!out.length) out.push(ymd(s));
    return out;
  }

  /** 종일이 먼저, 그 다음 시작 시각 순. 같은 칸의 줄 순서가 새로고침마다 안 바뀌게 */
  function sortEvents(list: FcEvent[]): FcEvent[] {
    return list.slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
  }

  function byDayOf(list: FcEvent[]): Record<string, FcEvent[]> {
    const out: Record<string, FcEvent[]> = {};
    for (const ev of list) {
      for (const key of eventDays(ev)) {
        if (!out[key]) out[key] = [];
        out[key].push(ev);
      }
    }
    for (const key of Object.keys(out)) out[key] = sortEvents(out[key]);
    return out;
  }

  function timeLabel(ev: FcEvent): string {
    if (ev.allDay) return t('mydash.cal.allDay', undefined, '종일');
    const d = new Date(ev.start);
    return isFinite(d.getTime()) ? hhmm(d) : '';
  }

  function evTitle(ev: FcEvent): string {
    return ev.title || t('mydash.cal.noTitle', undefined, '제목 없음');
  }

  /* ── 북마크. 날짜별 라벨 목록.
     `recordedAt` 의 앞 10자가 그 날. 같은 파일을 홈 카드도 읽지만 쓰는 값이 달라 따로 셈 ── */

  type BmItem = { label?: string | null; recordedAt?: string | null };
  type BmFile = { data?: { items?: BmItem[] }; items?: BmItem[] };

  function bookmarkDays(file: BmFile): Record<string, string[]> {
    const items = (file.data && file.data.items) || file.items || [];
    const out: Record<string, string[]> = {};
    for (const it of items) {
      const day = typeof it.recordedAt === 'string' ? it.recordedAt.slice(0, 10) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (!out[day]) out[day] = [];
      const label = typeof it.label === 'string' && it.label ? it.label : t('mydash.cal.noTitle', undefined, '제목 없음');
      out[day].push(label);
    }
    return out;
  }

  /** 401 인가. `gcal` 이 던지는 것은 `calendarList 401` 같은 글자뿐 */
  function isAuthFail(e: unknown): boolean {
    return /\b401\b/.test(String((e as Error)?.message || ''));
  }

  /* ── 그리기 ──────────────────────────────────────────────── */

  async function render(ctx: DashPanelCtx<DashRepoRead>): Promise<void> {
    await loadNamespace('mydash').catch(() => undefined);
    ensureStyle();
    const { root, repo } = ctx;

    root.innerHTML =
      '<div class="mdc">' +
      '<div class="mdc-auth"></div>' +
      '<div class="mdc-shell" hidden>' +
      '<div class="mdc-bar">' +
      '<button type="button" class="myd-btn ghost" data-mv="-1"></button>' +
      '<button type="button" class="myd-btn ghost" data-mv="0"></button>' +
      '<button type="button" class="myd-btn ghost" data-mv="1"></button>' +
      '<strong class="mdc-month"></strong>' +
      '</div>' +
      '<div class="mdc-week"></div>' +
      '<div class="mdc-grid"></div>' +
      '<div class="mdc-day"></div>' +
      '<p class="mdc-quiet"></p>' +
      '</div>' +
      '</div>';

    const authEl = root.querySelector('.mdc-auth') as HTMLElement;
    const shellEl = root.querySelector('.mdc-shell') as HTMLElement;
    const monthEl = root.querySelector('.mdc-month') as HTMLElement;
    const weekEl = root.querySelector('.mdc-week') as HTMLElement;
    const gridEl = root.querySelector('.mdc-grid') as HTMLElement;
    const dayEl = root.querySelector('.mdc-day') as HTMLElement;
    const footEl = root.querySelector('.mdc-quiet') as HTMLElement;

    const mvLabel: Record<string, string> = {
      '-1': t('mydash.cal.prev', undefined, '이전 달'),
      '0': t('mydash.cal.today', undefined, '오늘'),
      '1': t('mydash.cal.next', undefined, '다음 달'),
    };
    for (const b of Array.from(root.querySelectorAll('[data-mv]'))) {
      b.textContent = mvLabel[b.getAttribute('data-mv') || '0'] || '';
    }

    const today = ymd(new Date());
    let view = dayStart(new Date());
    let picked = today;
    let calendars: GoogleCalendar[] = [];
    let byDay: Record<string, FcEvent[]> = {};
    let bmDays: Record<string, string[]> = {};
    /** 북마크 파일을 못 읽은 이유. 칸의 빈 수를 0 으로 착각하지 않게 아래 한 줄로 밝힘 */
    let bmWhy = '';

    /* 북마크는 구글과 무관. 먼저 받아 두고, 실패하면 그 사실만 적고 달력은 그대로 감 */
    try {
      bmDays = bookmarkDays(await repo.readJson<BmFile>(BOOKMARKS_PATH));
    } catch (e) {
      bmWhy = (e as Error).message || t('mydash.cal.bmBad', undefined, '북마크 수를 못 읽었습니다');
    }
    if (!ctx.isCurrent()) return;

    function paintFoot(extra?: string): void {
      const bits = [t('mydash.cal.readonly', undefined, '읽기 전용. 일정 만들기와 고치기는 플래너에서')];
      if (bmWhy) bits.push(t('mydash.cal.bmBad', undefined, '북마크 수를 못 읽었습니다') + ' (' + bmWhy + ')');
      if (extra) bits.push(extra);
      footEl.textContent = bits.join(' / ');
    }

    /* ── 연결 카드 ──
       클라이언트 id 가 빈 빌드(로컬 dev)에서는 누를 자리가 없음. 그 사실을 문장으로 적고
       버튼을 막음. 안 막으면 눌러도 `no-client-id` 하나만 돌아옴 */
    function paintAuth(why?: string): void {
      authEl.innerHTML =
        '<div class="myd-card">' +
        (why ? '<div class="myd-warn">' + esc(why) + '</div>' : '') +
        '<div class="myd-row"><button type="button" class="myd-btn" data-conn="1">' +
        esc(t('mydash.cal.connect', undefined, 'Google 캘린더 연결')) +
        '</button></div>' +
        '<div class="myd-note">' +
        esc(
          t(
            'mydash.cal.connectNote',
            undefined,
            '브라우저에서 Google 에 직접 로그인. 토큰은 이 브라우저에만, 1시간 뒤 다시 누름'
          )
        ) +
        '</div>' +
        (GOOGLE_CLIENT_ID
          ? ''
          : '<div class="myd-note">' +
            esc(
              t(
                'mydash.cal.noClientId',
                undefined,
                '이 빌드에는 Google 클라이언트 ID 가 없습니다. 로컬 dev 빌드에서는 연결 못 합니다'
              )
            ) +
            '</div>') +
        '</div>';
      const btn = authEl.querySelector('[data-conn]') as HTMLButtonElement;
      btn.disabled = !GOOGLE_CLIENT_ID;
      btn.addEventListener('click', () => void connect(btn));
    }

    async function connect(btn: HTMLButtonElement): Promise<void> {
      btn.disabled = true;
      let token: string | null = null;
      try {
        token = await requestToken();
      } catch (e) {
        const why =
          (e as Error).message === 'no-client-id'
            ? t(
                'mydash.cal.noClientId',
                undefined,
                '이 빌드에는 Google 클라이언트 ID 가 없습니다. 로컬 dev 빌드에서는 연결 못 합니다'
              )
            : t('mydash.cal.authBad', undefined, '연결 창을 못 열었습니다');
        if (ctx.isCurrent()) paintAuth(why);
        return;
      }
      if (!ctx.isCurrent()) return;
      if (!token) {
        /* 창을 닫은 것. 실패가 아니라 안 하겠다 */
        paintAuth(t('mydash.cal.denied', undefined, '연결을 취소했습니다'));
        return;
      }
      authEl.textContent = '';
      await start(token);
    }

    /** 토큰이 죽음. 연결 카드로 되돌아가되 **달력 껍데기는 그대로** */
    function authLost(): void {
      /* 죽은 토큰을 저장 자리에 두면 `requestToken` 이 그것을 그대로 다시 줌 (5분 규칙) */
      forgetToken();
      ctx.status('');
      paintAuth(t('mydash.cal.expired', undefined, '토큰이 만료됐습니다. 다시 연결하세요'));
    }

    async function start(token: string): Promise<void> {
      shellEl.hidden = false;
      paintFoot();
      try {
        calendars = await fetchCalendars(token);
      } catch (e) {
        if (!ctx.isCurrent()) return;
        if (isAuthFail(e)) {
          authLost();
          return;
        }
        paintMonth();
        paintFoot(t('mydash.cal.fetchBad', { why: (e as Error).message || '' }, '일정을 못 받았습니다 ({why})'));
        return;
      }
      await loadMonth();
    }

    /** 화면에 보이는 주의 첫 날과 주 수. 앞뒤 달의 날도 칸을 채움 (여느 달력과 같은 손) */
    function gridInfo(): { from: Date; weeks: number } {
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      return { from: addDays(first, -first.getDay()), weeks: Math.ceil((first.getDay() + days) / 7) };
    }

    async function loadMonth(): Promise<void> {
      /* 한 시간이 지난 토큰은 갱신 토큰으로 창 없이 새로. 갱신도 안 되면 다시 연결 */
      const token = await ensureToken();
      if (!token) {
        authLost();
        return;
      }
      const { from, weeks } = gridInfo();
      const to = addDays(from, weeks * 7);
      ctx.status(t('mydash.cal.loading', undefined, '일정을 받는 중...'));
      let list: FcEvent[];
      try {
        list = await fetchEvents(token, calendars, from, to);
      } catch (e) {
        if (!ctx.isCurrent()) return;
        if (isAuthFail(e)) {
          authLost();
          return;
        }
        ctx.status('');
        paintMonth();
        paintFoot(t('mydash.cal.fetchBad', { why: (e as Error).message || '' }, '일정을 못 받았습니다 ({why})'));
        return;
      }
      if (!ctx.isCurrent()) return;
      byDay = byDayOf(list);
      paintMonth();
      paintFoot();
      const n = (byDay[today] || []).length;
      /* 왼쪽 목록의 작은 수와 머리말은 같은 값 하나. 오늘 일정 수 */
      ctx.setCount('calendar', String(n));
      ctx.status(t('mydash.cal.status', { n }, '오늘 일정 {n}'));
    }

    function paintWeekHead(): void {
      if (weekEl.childElementCount) return;
      const names = t('mydash.cal.week', undefined, '일,월,화,수,목,금,토').split(',');
      for (const name of names) {
        const s = document.createElement('span');
        s.textContent = name;
        weekEl.appendChild(s);
      }
    }

    function cellOf(day: Date): HTMLButtonElement {
      const key = ymd(day);
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'mdc-cell' +
        (day.getMonth() === view.getMonth() ? '' : ' out') +
        (key === today ? ' today' : '') +
        (key === picked ? ' sel' : '');
      b.setAttribute('data-day', key);
      b.setAttribute('aria-pressed', key === picked ? 'true' : 'false');

      const num = document.createElement('span');
      num.className = 'mdc-num';
      num.textContent = String(day.getDate());
      b.appendChild(num);

      const list = byDay[key] || [];
      for (const ev of list.slice(0, CELL_MAX)) {
        const row = document.createElement('span');
        row.className = 'mdc-ev';
        const dot = document.createElement('span');
        dot.className = 'mdc-dot';
        /* 색은 구글이 주는 값. 스킨 토큰이 아니라 남의 값이라 그 자리에서 직접 */
        if (ev.backgroundColor) dot.style.background = ev.backgroundColor;
        row.appendChild(dot);
        const label = document.createElement('span');
        const time = timeLabel(ev);
        label.textContent = (ev.allDay || !time ? '' : time + ' ') + evTitle(ev);
        row.appendChild(label);
        b.appendChild(row);
      }
      if (list.length > CELL_MAX) {
        const more = document.createElement('span');
        more.className = 'mdc-more';
        more.textContent = t('mydash.cal.more', { n: list.length - CELL_MAX }, '+{n}');
        b.appendChild(more);
      }
      /* 0 이면 아무것도 안 그림. 모든 칸에 북마크 0 이 붙으면 있는 날이 안 보임 */
      const bm = (bmDays[key] || []).length;
      if (bm) {
        const s = document.createElement('span');
        s.className = 'mdc-bm';
        s.textContent = t('mydash.cal.bm', { n: bm }, '북마크 {n}');
        b.appendChild(s);
      }
      return b;
    }

    function paintMonth(): void {
      paintWeekHead();
      monthEl.textContent = t(
        'mydash.cal.month',
        { y: view.getFullYear(), m: view.getMonth() + 1 },
        '{y}년 {m}월'
      );
      const { from, weeks } = gridInfo();
      gridEl.textContent = '';
      for (let i = 0; i < weeks * 7; i++) gridEl.appendChild(cellOf(addDays(from, i)));
      paintDay();
    }

    /** 고른 날의 일정 전부와 북마크 라벨. **읽기 전용** */
    function paintDay(): void {
      const d = parseDay(picked);
      const list = byDay[picked] || [];
      const labels = bmDays[picked] || [];
      const parts: string[] = [
        '<h3>' + esc(t('mydash.cal.dayHead', { m: d.getMonth() + 1, d: d.getDate() }, '{m}월 {d}일')) + '</h3>',
      ];
      if (!list.length && !labels.length) {
        parts.push(
          '<p class="mdc-quiet">' +
            esc(t('mydash.cal.dayNone', undefined, '이 날은 일정과 북마크가 없습니다')) +
            '</p>'
        );
      }
      if (list.length) {
        parts.push('<h4>' + esc(t('mydash.cal.dayEvents', undefined, '일정')) + '</h4>');
        for (const ev of list) {
          const cal = ev.extendedProps ? ev.extendedProps.calendarName : '';
          parts.push(
            '<div class="mdc-row">' +
              '<span class="mdc-dot" data-color="' + esc(ev.backgroundColor || '') + '"></span>' +
              '<em>' + esc(timeLabel(ev)) + '</em>' +
              '<span>' + esc(evTitle(ev)) + '</span>' +
              (cal ? '<i>' + esc(cal) + '</i>' : '') +
              '</div>'
          );
        }
      }
      if (labels.length) {
        parts.push(
          '<h4>' +
            esc(t('mydash.cal.dayBookmarks', undefined, '북마크')) +
            ' ' +
            esc(t('mydash.cal.bm', { n: labels.length }, '북마크 {n}')) +
            '</h4><ul>' +
            labels.map((l) => '<li>' + esc(l) + '</li>').join('') +
            '</ul>'
        );
      }
      dayEl.innerHTML = parts.join('');
      /* 점 색은 속성으로 실어 두고 여기서 옮김. 남의 값을 style 글자로 엮지 않게 */
      for (const dot of Array.from(dayEl.querySelectorAll('.mdc-dot'))) {
        const color = dot.getAttribute('data-color');
        if (color) (dot as HTMLElement).style.background = color;
      }
    }

    gridEl.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-day]') as HTMLElement | null;
      if (!el) return;
      picked = el.getAttribute('data-day') || picked;
      for (const b of Array.from(gridEl.querySelectorAll('.mdc-cell'))) {
        const on = b.getAttribute('data-day') === picked;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      paintDay();
    });

    root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-mv]') as HTMLElement | null;
      if (!el) return;
      const mv = Number(el.getAttribute('data-mv'));
      view = mv === 0 ? dayStart(new Date()) : new Date(view.getFullYear(), view.getMonth() + mv, 1);
      if (mv === 0) picked = today;
      paintMonth();
      void loadMonth();
    });

    const token = await ensureToken();
    if (!token) {
      paintAuth();
      return;
    }
    await start(token);
  }

  /* 목록의 이름은 셸이 그리는 순간에 정해짐. 묶음을 미리 받아 둠 (다른 패널과 같은 손) */
  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'calendar',
    get title(): string {
      return t('mydash.cal.title', undefined, '캘린더');
    },
    access: 'read',
    /* 구글에서 받는 것은 저장소 경로가 아니라 여기 안 적음. 셸의 로그인 전 화면은
       저장소에서 무엇을 읽나만 밝히는 자리 */
    paths: [BOOKMARKS_PATH],
    render,
  });
})();

export {};
