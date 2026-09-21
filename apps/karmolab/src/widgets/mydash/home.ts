/**
 * 개인 대시보드 홈. 목록의 **오늘** 자리.
 *
 * 무엇인가: 나머지 여섯 화면이 무엇을 들고 있는지 한 장으로. 카드마다 숫자 셋까지고,
 * 점수도 진행률도 없음. 판정은 사람, 화면은 재기만
 *
 * ★ **카드 하나가 출처 하나.** 카드마다 자기 summary 만 읽고 (캘린더만 저장소가 아니라
 * 구글에서 받는다), 실패하면 **그 카드만** 못 읽음 과 이유로 바뀐다. 하나가 없다고 홈 전체가
 * 오류 카드가 되면, 아직 안 구운 생성기 하나 때문에 다 있는 여섯을 못 보는 일 방지
 *
 * ★ **왼쪽 목록의 작은 수도 여기서 채운다** (`ctx.setCount`). 목록이 제 숫자를 따로 받아 오면
 * 같은 파일을 두 번 읽으면 두 값이 갈리는 순간 발생. 읽는 자리는 하나
 */
import { dashRegistry, esc, safeLinkUrl, short, usd } from './kit';
import type { DashPanelCtx, DashRepoRead } from './kit';
import { t, loadNamespace } from '../../lib/i18n';
import { storedToken } from '../planner/gauth';
import { fetchCalendars, fetchEvents } from '../planner/gcal';
import type { FcEvent } from '../planner/gcal';

(function (): void {
  'use strict';

  const BOOKMARKS_PATH = 'data/bookmarks/summary.json';
  const ME_PATH = 'data/me/summary.json';
  const CAREER_PATH = 'data/career/summary.json';
  const AI_DIR = 'data/ai-usage';
  const PC_DIR = 'data/pc-vitals';

  /** 카드 한 장이 내놓는 것. `lines` 는 위에서부터 그대로 */
  type Card = {
    /** 목록 항목 id. 열기 가 여기로 간다 */
    item: string;
    title: string;
    /** 제목 위 작은 영문. W3 시안의 두 언어 라벨 */
    en: string;
    /** 큰 카드 (판정 대기). 두 칸 차지, 어두운 바탕, 주황 수 */
    hero?: boolean;
    /** 큰 카드 오른쪽 아래 작은 그림 셋. 최근 판정 대기 것 */
    pics?: string[];
    /** 큰 값과 그 옆의 작은 이름. 없으면 안 그린다 */
    big?: { value: string; unit: string };
    lines: string[];
    /** 작은 글씨 한 줄 */
    quiet?: string;
    /** 목록 오른쪽 작은 수 */
    count?: string;
    /** 열기 를 그릴까. 준비 중 자리는 안 그린다 */
    open?: boolean;
  };

  /* ── 날짜 셈. 전부 KST 기준 ── */
  const KST_OFFSET_MS = 9 * 3600000;
  function kstNow(): Date {
    return new Date(Date.now() + KST_OFFSET_MS);
  }
  /** 오늘이 속한 달 (`YYYY-MM`) */
  function thisMonth(): string {
    return kstNow().toISOString().slice(0, 7);
  }
  /** ISO 시각에서 오늘까지 며칠. 못 읽으면 null */
  function daysSince(iso: unknown): number | null {
    if (typeof iso !== 'string' || !iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return Math.floor((Date.now() - ms) / 86400000);
  }
  /** 날짜 하나까지 며칠 남았나. 지났으면 음수 */
  function daysUntil(date: unknown): number | null {
    if (typeof date !== 'string' || !date) return null;
    const ms = Date.parse(date + 'T00:00:00+09:00');
    if (!Number.isFinite(ms)) return null;
    return Math.ceil((ms - Date.now()) / 86400000);
  }
  function minutesSince(iso: unknown): number | null {
    if (typeof iso !== 'string' || !iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return Math.floor((Date.now() - ms) / 60000);
  }
  /** 최근 n 일의 `YYYY-MM-DD` (KST). 오늘 포함 */
  function lastDays(n: number): string[] {
    const out: string[] = [];
    const base = kstNow().getTime();
    for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
    return out;
  }

  function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  function n(v: unknown): string {
    return short(num(v));
  }
  /** 큰 수는 줄이지 않고 쉼표. 표시 글꼴에 한글 단위 (천, 만) 가 없다 */
  function full(v: unknown): string {
    return num(v).toLocaleString('en-US');
  }

  /* ── 카드 하나씩 ────────────────────────────────────────────────
     전부 은은 모양이다. 자기 파일을 읽고 Card 를 내놓는다. 던지면 부르는 쪽이 잡아
     그 카드 자리에 못 읽음 을 그린다. */

  type Counts = Record<string, unknown>;

  type BmItem = {
    recordedAt?: string | null;
    pending?: string | null;
    media?: { photos?: Array<{ url?: string }> | null; video?: { poster?: string } | null; image?: string | null } | null;
  };
  type BmSummary = { counts?: Counts; data?: { items?: BmItem[] } };

  /** 북마크 summary 는 두 카드가 같이 쓴다. 한 번만 읽고 나눠 준다 */
  function bmSummary(repo: DashRepoRead): Promise<BmSummary> {
    return repo.readJson<BmSummary>(BOOKMARKS_PATH);
  }

  /** 작은 그림 주소. 트윗 첫 장, 영상 포스터, 페이지 대표 그림 순. 북마크 패널의 thumbOf 와 같은 규칙 */
  function thumbOf(it: BmItem): string {
    const m = it.media;
    if (!m) return '';
    const first = m.photos && m.photos.length ? m.photos[0] : null;
    const raw = (first && first.url) || (m.video && m.video.poster) || m.image || '';
    const u = safeLinkUrl(raw);
    if (!u) return '';
    return /^https:\/\/pbs\.twimg\.com\//.test(u) ? u + (u.indexOf('?') >= 0 ? '&' : '?') + 'name=thumb' : u;
  }

  /** 판정 대기. 큰 카드. 최근 담긴 대기 것 셋의 그림을 같이 */
  function judgeCard(j: BmSummary): Card {
    const c = j.counts || {};
    const month = thisMonth();
    const items = (j.data && j.data.items) || [];
    let fresh = 0;
    const waiting: BmItem[] = [];
    for (const it of items) {
      if (typeof it.recordedAt === 'string' && it.recordedAt.slice(0, 7) === month) fresh++;
      if (it.pending) waiting.push(it);
    }
    waiting.sort((a, b) => (String(b.recordedAt || '') > String(a.recordedAt || '') ? 1 : -1));
    const pics: string[] = [];
    for (const it of waiting) {
      const u = thumbOf(it);
      if (u) pics.push(u);
      if (pics.length >= 3) break;
    }
    return {
      item: 'judge',
      en: 'JUDGE',
      hero: true,
      pics,
      title: t('mydash.home.judge.title', undefined, '판정 기다리는 북마크'),
      big: { value: full(c.pending), unit: t('mydash.home.judge.unit', undefined, '건') },
      lines: [t('mydash.home.bm.fresh', { n: short(fresh) }, '이번 달 {n}건 들어옴')],
      count: n(c.pending),
      open: true,
    };
  }

  function bookmarksCard(j: BmSummary): Card {
    const c = j.counts || {};
    return {
      item: 'bookmarks',
      en: 'BOOKMARKS',
      title: t('mydash.nav.bookmarks', undefined, '북마크'),
      big: { value: full(c.items), unit: '' },
      lines: [t('mydash.home.bm.unit', undefined, '담아 둔 것')],
      count: n(c.items),
      open: true,
    };
  }

  async function meCard(repo: DashRepoRead): Promise<Card> {
    const j = await repo.readJson<{
      counts?: Counts;
      data?: { onThisDay?: Array<{ window?: string; traces?: Array<{ text?: string; at?: string }> }> };
    }>(ME_PATH);
    const c = j.counts || {};
    const windows = (j.data && j.data.onThisDay) || [];
    let trace = '';
    for (const w of windows) {
      const first = (w.traces || [])[0];
      if (first && typeof first.text === 'string' && first.text) {
        trace = (w.window ? w.window + ', ' : '') + first.text;
        break;
      }
    }
    return {
      item: 'me',
      en: '1Y AGO',
      title: t('mydash.nav.me', undefined, '나'),
      big: { value: n(c.eraCandidates), unit: t('mydash.home.me.unit', undefined, '시기 후보') },
      lines: [t('mydash.home.me.events', { n: short(num(c.eventCandidates)) }, '사건 후보 {n}')],
      quiet: trace || t('mydash.home.me.noTrace', undefined, '이맘때 흔적 없음'),
      count: n(c.eraCandidates),
      open: true,
    };
  }

  async function careerCard(repo: DashRepoRead): Promise<Card> {
    const j = await repo.readJson<{
      data?: {
        target?: { name?: string; date?: string };
        milestones?: Array<{ name?: string; date?: string }>;
        gauge?: { lastMeasureAt?: string };
      };
    }>(CAREER_PATH);
    const d = j.data || {};
    const target = d.target || {};
    const left = daysUntil(target.date);
    const dday = left === null ? '-' : left >= 0 ? 'D-' + left : 'D+' + -left;
    /* 다음 마일스톤은 **아직 안 지난 것 중 가장 가까운 것**. 지난 것을 다음이라고 부르면 거짓말 */
    let next = '';
    let bestLeft = Number.POSITIVE_INFINITY;
    for (const m of d.milestones || []) {
      const gap = daysUntil(m.date);
      if (gap === null || gap < 0 || gap >= bestLeft) continue;
      bestLeft = gap;
      next = (m.name || '') + ' ' + gap + '일 뒤';
    }
    const last = d.gauge && typeof d.gauge.lastMeasureAt === 'string' ? d.gauge.lastMeasureAt : '';
    return {
      item: 'career',
      en: 'CAREER',
      title: t('mydash.nav.career', undefined, '커리어'),
      big: { value: dday, unit: target.name || t('mydash.home.career.unit', undefined, '목표') },
      lines: [next || t('mydash.home.career.noNext', undefined, '다음 마일스톤 없음')],
      quiet: last
        ? t('mydash.home.career.last', { d: last }, '마지막 측정 {d}')
        : t('mydash.home.career.noLast', undefined, '측정 기록 없음'),
      count: dday,
      open: true,
    };
  }

  async function aiCard(repo: DashRepoRead): Promise<Card> {
    const hosts = (await repo.list(AI_DIR)).filter((e) => e.type === 'dir');
    if (!hosts.length) throw new Error(AI_DIR + ' 아래에 host 폴더가 없다');
    const host = hosts[0].name;
    const roll = await repo.readJson<{
      byDay?: Record<string, { cost?: number; sessions?: number }>;
    }>(AI_DIR + '/' + host + '/rollups.json');
    const byDay = roll.byDay || {};
    let cost = 0;
    let sessions = 0;
    let filled = 0;
    for (const d of lastDays(30)) {
      const b = byDay[d];
      if (!b) continue;
      filled++;
      cost += num(b.cost);
      sessions += num(b.sessions);
    }
    return {
      item: 'ai',
      en: 'AI 30 DAYS',
      title: t('mydash.nav.ai', undefined, 'AI 사용'),
      big: { value: usd(cost), unit: t('mydash.home.ai.unit', undefined, '30일 환산가') },
      lines: [t('mydash.home.ai.sessions', { n: short(sessions) }, '세션 {n}')],
      quiet: t('mydash.home.ai.days', { n: filled }, '30일 중 기록 있는 날 {n}'),
      count: usd(cost),
      open: true,
    };
  }

  async function pcCard(repo: DashRepoRead): Promise<Card> {
    const hosts = (await repo.list(PC_DIR)).filter((e) => e.type === 'dir');
    if (!hosts.length) throw new Error(PC_DIR + ' 아래에 host 폴더가 없다');
    const host = hosts[0].name;
    const j = await repo.readJson<{
      data?: { latest?: { at?: string; memUsedPct?: number } };
    }>(PC_DIR + '/' + host + '/summary.json');
    const latest = (j.data && j.data.latest) || {};
    const mem = num(latest.memUsedPct);
    const mins = minutesSince(latest.at);
    return {
      item: 'pc',
      en: 'PC',
      title: t('mydash.nav.pc', undefined, 'PC 성능'),
      big: { value: mem + '%', unit: t('mydash.home.pc.unit', undefined, '메모리') },
      lines: [
        mins === null
          ? t('mydash.home.pc.noSample', undefined, '표본 시각 없음')
          : t('mydash.home.pc.ago', { n: short(mins) }, '마지막 표본 {n}분 전'),
      ],
      quiet: host,
      count: mem + '%',
      open: true,
    };
  }

  async function kakaoCard(repo: DashRepoRead): Promise<Card> {
    const j = await repo.readJson<{
      counts?: Counts;
      data?: { hourHistogram?: { byMonth?: Record<string, number[]> } };
    }>(ME_PATH);
    const c = j.counts || {};
    const byMonth = (j.data && j.data.hourHistogram && j.data.hourHistogram.byMonth) || {};
    const bag = byMonth[thisMonth()] || [];
    let month = 0;
    for (const v of bag) month += num(v);
    return {
      item: 'kakao',
      en: 'MEMO',
      title: t('mydash.nav.kakao', undefined, '카톡 메모'),
      big: { value: full(c.kakaoMemos), unit: t('mydash.home.kakao.unit', undefined, '메모') },
      lines: [t('mydash.home.kakao.month', { n: short(month) }, '이번 달 {n}건')],
      quiet: t('mydash.shell.soon', undefined, '아직 준비 중입니다. 자리만 잡아 뒀습니다.'),
      count: n(c.kakaoMemos),
    };
  }

  /**
   * 캘린더. **저장소가 아니라 구글에서** 받는 카드 하나.
   *
   * 토큰은 캘린더 패널과 플래너가 같이 쓰는 그것(`planner/gauth`). 없으면 연결 필요 와 열기만
   * 그린다. 여기서 로그인 창은 안 띄움. 홈은 여섯 카드를 한 번에 그리는 자리, 하나가 팝업을
   * 열면 어느 카드가 누른 것인지 구분 불가.
   */
  async function calendarCard(): Promise<Card> {
    const title = t('mydash.nav.calendar', undefined, '캘린더');
    const needAuth: Card = {
      item: 'calendar',
      en: 'CALENDAR',
      title,
      lines: [t('mydash.cal.needAuth', undefined, '연결 필요')],
      quiet: t(
        'mydash.cal.connectNote',
        undefined,
        '브라우저에서 Google 에 직접 로그인. 토큰은 이 브라우저에만, 1시간 뒤 다시 누름'
      ),
      open: true,
    };
    const token = storedToken();
    if (!token) return needAuth;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 86400000);
    let items: FcEvent[];
    try {
      items = await fetchEvents(token, await fetchCalendars(token), from, to);
    } catch (e) {
      /* 401 은 토큰이 죽은 것. 못 읽음 이 아니라 연결 필요 다. 그 밖은 그대로 던져
         카드 자리에 못 읽음 과 이유가 뜨게 한다 */
      if (/\b401\b/.test((e as Error).message || '')) return needAuth;
      throw e;
    }
    /* 종일이 먼저, 그 다음 시작 시각 순. 패널의 칸 순서와 같은 규칙 */
    const sorted = items.slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
    });
    const first = sorted[0];
    let line = t('mydash.cal.homeNone', undefined, '오늘 일정 없음');
    if (first) {
      const at = new Date(first.start);
      const time = first.allDay
        ? t('mydash.cal.allDay', undefined, '종일')
        : Number.isFinite(at.getTime())
          ? String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
          : '';
      const name = first.title || t('mydash.cal.noTitle', undefined, '제목 없음');
      line = t('mydash.cal.homeFirst', { time, title: name }, '{time} {title}');
    }
    return {
      item: 'calendar',
      en: 'CALENDAR',
      title,
      big: { value: String(sorted.length), unit: t('mydash.cal.homeUnit', undefined, '오늘 일정') },
      lines: [line],
      count: String(sorted.length),
      open: true,
    };
  }

  /* ── 그리기 ─────────────────────────────────────────────────── */

  function cardHtml(c: Card): string {
    return (
      '<div class="mydh-card' + (c.open ? ' is-open' : '') + (c.hero ? ' mydh-card--hero' : '') + '"' +
      (c.open ? ' data-open="' + esc(c.item) + '"' : '') + '>' +
      '<span class="mydh-en">' + esc(c.en) + '</span>' +
      '<h3>' + esc(c.title) + '</h3>' +
      (c.big
        ? '<p class="mydh-big">' + esc(c.big.value) + (c.big.unit ? '<small>' + esc(c.big.unit) + '</small>' : '') + '</p>'
        : '') +
      c.lines.map((l) => '<p>' + esc(l) + '</p>').join('') +
      (c.quiet ? '<p class="mydh-quiet">' + esc(c.quiet) + '</p>' : '') +
      (c.pics && c.pics.length
        ? '<div class="mydh-pics">' + c.pics.map((u) => '<img src="' + esc(u) + '" alt="" loading="lazy">').join('') + '</div>'
        : '') +
      (c.open
        ? '<div class="mydh-open"><button type="button" data-open="' + esc(c.item) + '" class="sr-only">' +
          esc(t('mydash.home.open', undefined, '열기')) + '</button></div>'
        : '') +
      '</div>'
    );
  }

  /** 나 카드는 격자가 아니라 아래 띠 한 줄. 1년 전 이맘때 흔적 하나 */
  function agoHtml(c: Card): string {
    return (
      '<button type="button" class="mydh-ago" data-open="' + esc(c.item) + '">' +
      '<span class="mydh-en">' + esc(c.en) + '</span>' +
      '<b>' + esc(c.quiet || '') + '</b>' +
      '<span>' + esc(c.lines[0] || '') + '</span>' +
      '</button>'
    );
  }

  /** 위 줄의 날짜. `SUN 9 / 20` 꼴. 요일은 영문 석 자 (표시 글꼴이 대문자와 숫자만 있다) */
  function dateLine(): string {
    const d = kstNow();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[d.getUTCDay()] + ' ' + (d.getUTCMonth() + 1) + ' / ' + d.getUTCDate();
  }

  function frameHtml(inner: string): string {
    return (
      '<div class="mydh-bg"></div>' +
      '<img class="mydh-yawn" src="/apps/karmolab/img/widgets/mydash/yawn-stand.webp" alt="" aria-hidden="true">' +
      '<p class="mydh-date">' + esc(dateLine()) + '</p>' +
      inner
    );
  }

  /** 로그인 전. 같은 배치, 값은 하이픈. 열기 없음 (눌러도 읽을 것이 없다) */
  function emptyHtml(title: string): string {
    return (
      '<div class="mydh-card mydh-card--empty">' +
      '<span class="mydh-en">&nbsp;</span>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="mydh-big">-</p>' +
      '<p class="mydh-quiet">' + esc(t('mydash.home.needLogin', undefined, '로그인 뒤 채워진다')) + '</p>' +
      '</div>'
    );
  }

  function renderEmpty(root: HTMLElement): void {
    const titles = [
      t('mydash.nav.judge', undefined, '판정 대기'),
      t('mydash.nav.bookmarks', undefined, '북마크'),
      t('mydash.nav.career', undefined, '커리어'),
      t('mydash.nav.kakao', undefined, '카톡 메모'),
      t('mydash.nav.ai', undefined, 'AI 사용'),
      t('mydash.nav.pc', undefined, 'PC 성능'),
      t('mydash.nav.calendar', undefined, '캘린더'),
    ];
    root.className += ' mydh';
    root.innerHTML = frameHtml(
      '<div class="mydh-grid">' + titles.map(emptyHtml).join('') + '</div>'
    );
    const first = root.querySelector('.mydh-card');
    if (first) first.classList.add('mydh-card--hero');
  }

  function failHtml(item: string, title: string, why: string): string {
    return (
      '<div class="mydh-card" data-fail="' + esc(item) + '">' +
      '<span class="mydh-en">&nbsp;</span>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="mydh-bad">' + esc(t('mydash.home.bad', undefined, '못 읽음')) + '</p>' +
      '<p class="mydh-quiet">' + esc(why) + '</p>' +
      '</div>'
    );
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo } = ctx;

    root.className += ' mydh';
    root.innerHTML = frameHtml('<div class="mydh-grid"></div><div class="mydh-foot"></div>');
    const grid = root.querySelector('.mydh-grid') as HTMLElement;
    const foot = root.querySelector('.mydh-foot') as HTMLElement;

    /* 북마크 summary 는 판정과 북마크 두 카드가 같이 읽는다. 실패도 같이 (둘 다 못 읽음) */
    const bm = bmSummary(repo);
    bm.catch(() => undefined);

    /* 카드 여덟. **하나가 죽어도 나머지는 산다.** 순서 고정, 자리 안 흔들림.
       판정 대기가 큰 카드로 먼저, 나 는 격자 아래 띠 */
    const makers: Array<{ item: string; title: string; make: () => Promise<Card> | Card }> = [
      { item: 'judge', title: t('mydash.nav.judge', undefined, '판정 대기'), make: async () => judgeCard(await bm) },
      { item: 'bookmarks', title: t('mydash.nav.bookmarks', undefined, '북마크'), make: async () => bookmarksCard(await bm) },
      { item: 'career', title: t('mydash.nav.career', undefined, '커리어'), make: () => careerCard(repo) },
      { item: 'kakao', title: t('mydash.nav.kakao', undefined, '카톡 메모'), make: () => kakaoCard(repo) },
      { item: 'ai', title: t('mydash.nav.ai', undefined, 'AI 사용'), make: () => aiCard(repo) },
      { item: 'pc', title: t('mydash.nav.pc', undefined, 'PC 성능'), make: () => pcCard(repo) },
      { item: 'calendar', title: t('mydash.nav.calendar', undefined, '캘린더'), make: () => calendarCard() },
      { item: 'me', title: t('mydash.nav.me', undefined, '나'), make: () => meCard(repo) },
    ];

    const parts = await Promise.all(
      makers.map(async (m) => {
        try {
          const card = await m.make();
          return { ok: true as const, item: m.item, card };
        } catch (e) {
          const msg = (e as Error).message || t('mydash.home.badUnknown', undefined, '알 수 없는 실패');
          return { ok: false as const, item: m.item, title: m.title, why: msg };
        }
      })
    );
    if (!ctx.isCurrent()) return;

    grid.innerHTML = parts
      .filter((p) => p.item !== 'me' && !(p.ok && p.card.item === 'me'))
      .map((p) => (p.ok ? cardHtml(p.card) : failHtml(p.item, p.title, p.why)))
      .join('');
    const me = parts.find((p) => (p.ok ? p.card.item === 'me' : p.item === 'me'));
    foot.innerHTML = me ? (me.ok ? agoHtml(me.card) : failHtml(me.item, me.title, me.why)) : '';

    /* 왼쪽 목록의 작은 수. 읽힌 카드 것만. 못 읽은 자리는 빈칸으로 둔다 (0 이 아니다) */
    for (const p of parts) {
      if (p.ok && p.card.count) ctx.setCount(p.card.item, p.card.count);
    }
    /* 오늘 자리는 몇 장이 살아 있나 */
    const alive = parts.filter((p) => p.ok).length;
    ctx.setCount('today', alive + '/' + parts.length);

    root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-open]') as HTMLElement | null;
      if (!el) return;
      ctx.openItem(el.getAttribute('data-open') || '');
    });
  }

  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'home',
    get title(): string {
      return t('mydash.nav.today', undefined, '오늘');
    },
    access: 'read',
    paths: [BOOKMARKS_PATH, ME_PATH, CAREER_PATH, AI_DIR + '/<host>/rollups.json', PC_DIR + '/<host>/summary.json'],
    render,
    renderEmpty,
  });
})();

export {};
