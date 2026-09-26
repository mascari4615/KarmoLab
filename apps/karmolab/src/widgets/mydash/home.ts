/**
 * 개인 대시보드 홈. 목록의 **오늘** 자리.
 *
 * 무엇인가: 다른 방으로 가는 카드 여섯. 카드는 아이콘과 이름만 (D2b 시안, 사용자 통과 2026-09-23.
 * memo notes/mydash/design/skill-bench/D2b-mydash-tight-{light,dark}.html). 수는 방 안에서
 *
 * ★ **카드는 데이터를 기다리지 않는다.** 이름과 아이콘은 바로 그리고, 출처마다 따로 읽어
 * 왼쪽 목록의 작은 수만 채운다 (`ctx.setCount`). 읽기에 실패하면 **그 카드만** 못 읽음 한 줄.
 * 아직 안 구운 생성기 하나 때문에 홈 전체가 오류 카드가 되지 않게
 *
 * ★ **목록의 작은 수는 여기서 채운다.** 목록이 제 숫자를 따로 받아 오면 같은 파일을 두 번 읽고
 * 두 값이 갈리는 순간이 생긴다. 읽는 자리는 하나
 */
import { dashRegistry, esc, short, usd } from './kit';
import type { DashPanelCtx, DashRepoRead } from './kit';
import { t, loadNamespace } from '../../lib/i18n';
import { ensureToken } from '../planner/gauth';
import { fetchCalendars, fetchEvents } from '../planner/gcal';

(function (): void {
  'use strict';

  const BOOKMARKS_PATH = 'data/bookmarks/summary.json';
  const GOALS_PATH = 'data/goals/goals.json';
  const AI_DIR = 'data/ai-usage';
  const PC_DIR = 'data/pc-vitals';
  /** 아이콘은 ESC 메뉴와 같은 그림 (Codex image_gen 자작). CSS mask 로 글자색을 입힌다 */
  const ICON_BASE = '/apps/karmolab/img/shell/menu/';

  /** 카드 한 장. 목록 항목 하나로 간다 */
  type Tile = {
    item: string;
    title: string;
    icon: string;
    /** 큰 카드. 두 칸, 주황. 화면에서 주황은 이것 하나 (북마크) */
    hero?: boolean;
    /** 목록 오른쪽 작은 수를 읽어 온다. 캘린더는 저장소가 아니라 구글 */
    count: (repo: DashRepoRead) => Promise<string | null>;
  };

  /* ── 날짜 셈. 전부 KST 기준 ── */
  const KST_OFFSET_MS = 9 * 3600000;
  function kstNow(): Date {
    return new Date(Date.now() + KST_OFFSET_MS);
  }
  /** 날짜 하나까지 며칠 남았나. 지났으면 음수 */
  function daysUntil(date: unknown): number | null {
    if (typeof date !== 'string' || !date) return null;
    const ms = Date.parse(date + 'T00:00:00+09:00');
    if (!Number.isFinite(ms)) return null;
    return Math.ceil((ms - Date.now()) / 86400000);
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

  type Counts = Record<string, unknown>;

  /* ── 방마다 목록 수 하나. 던지면 부르는 쪽이 그 카드에 못 읽음 을 단다 ── */

  /** 북마크 summary 는 판정과 북마크 두 카드가 같이 쓴다. 한 번만 읽는다 */
  let bmOnce: Promise<{ counts?: Counts }> | null = null;
  function bmCounts(repo: DashRepoRead): Promise<Counts> {
    if (!bmOnce) bmOnce = repo.readJson<{ counts?: Counts }>(BOOKMARKS_PATH);
    return bmOnce.then((j) => j.counts || {});
  }

  /** 목표 방의 작은 수는 가장 가까운 D-day (가지의 due 중 오늘 이후 첫 날) */
  async function goalsCount(repo: DashRepoRead): Promise<string> {
    const j = await repo.readJson<{ branches?: Array<{ due?: string | null }> }>(GOALS_PATH);
    const left = (j.branches || [])
      .map((b) => daysUntil(b.due || undefined))
      .filter((n): n is number => n !== null && n >= 0)
      .sort((a, b) => a - b)[0];
    return left === undefined ? '-' : 'D-' + left;
  }

  async function aiCount(repo: DashRepoRead): Promise<string> {
    const hosts = (await repo.list(AI_DIR)).filter((e) => e.type === 'dir');
    if (!hosts.length) throw new Error(AI_DIR + ' 아래에 host 폴더가 없다');
    const roll = await repo.readJson<{ byDay?: Record<string, { cost?: number }> }>(
      AI_DIR + '/' + hosts[0].name + '/rollups.json'
    );
    const byDay = roll.byDay || {};
    let cost = 0;
    for (const d of lastDays(30)) cost += num(byDay[d] && byDay[d].cost);
    return usd(cost);
  }

  /** 머신 방의 작은 수는 서버 (Mois2) 의 마지막 메모리. 폴더가 늘어도 가리키는 기계는 그대로 */
  async function pcCount(repo: DashRepoRead): Promise<string> {
    type PcSummary = { data?: { latest?: { memUsedPct?: number } } };
    const path = PC_DIR + '/Mois2/summary.json';
    /* 수집기 브랜치 먼저 (머신 방과 같은 순서), 없으면 main */
    const j = await repo
      .readJson<PcSummary>(path, { ref: 'machines-data' })
      .catch((e: { kind?: string }) => {
        if (e && e.kind === 'auth') throw e;
        return repo.readJson<PcSummary>(path);
      });
    return num(j.data && j.data.latest && j.data.latest.memUsedPct) + '%';
  }

  /**
   * 캘린더. 토큰은 캘린더 패널과 플래너가 같이 쓰는 그것 (`planner/gauth`). 없거나 죽었으면
   * 수 없음. 홈에서 로그인 창은 안 띄운다 (카드 일곱이 한 번에 뜨는 자리)
   */
  async function calendarCount(): Promise<string | null> {
    const token = await ensureToken();
    if (!token) return null;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 86400000);
    try {
      return String((await fetchEvents(token, await fetchCalendars(token), from, to)).length);
    } catch (e) {
      if (/\b401\b/.test((e as Error).message || '')) return null;
      throw e;
    }
  }

  function tiles(): Tile[] {
    return [
      /* 판정 대기와 북마크는 한 방 (사용자 2026-09-23). 방이 판정 대기부터 열려 목록 수도 대기 수 */
      {
        item: 'bookmarks',
        title: t('mydash.nav.bookmarks', undefined, '북마크'),
        icon: 'book',
        hero: true,
        count: async (r) => short(num((await bmCounts(r)).pending)),
      },
      { item: 'goals', title: t('mydash.nav.goals', undefined, '목표'), icon: 'me', count: goalsCount },
      { item: 'ai', title: t('mydash.nav.ai', undefined, 'AI 사용'), icon: 'stat', count: aiCount },
      { item: 'machines', title: t('mydash.nav.machines', undefined, '머신'), icon: 'dash', count: pcCount },
      { item: 'planner', title: t('widgets.planner.title', undefined, '플래너'), icon: 'cal', count: calendarCount },
    ];
  }

  /* ── 그리기 ─────────────────────────────────────────────────── */

  function tileHtml(c: Tile): string {
    return (
      '<button type="button" data-open="' + esc(c.item) + '" class="mydh-card' + (c.hero ? ' mydh-card--hero' : '') + '" data-item="' + esc(c.item) + '"' +
      ' style="--mydh-icon:url(' + ICON_BASE + esc(c.icon) + '.png)">' +
      '<span class="mydh-ic" aria-hidden="true"></span>' +
      '<b>' + esc(c.title) + '</b>' +
      '</button>'
    );
  }

  /** 오른쪽 위 날짜. `TUE 2026` 위, `9 / 23` 아래. 요일은 영문 석 자 (표시 글꼴이 대문자와 숫자만) */
  function dateHtml(): string {
    const d = kstNow();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return (
      '<p class="mydh-date"><span>' + days[d.getUTCDay()] + ' ' + d.getUTCFullYear() + '</span>' +
      '<b>' + (d.getUTCMonth() + 1) + ' / ' + d.getUTCDate() + '</b></p>'
    );
  }

  function frameHtml(): string {
    return (
      '<div class="mydh-bg"></div>' +
      '<img class="mydh-yawn" src="/apps/karmolab/img/widgets/mydash/yawn-stand.webp" alt="" aria-hidden="true">' +
      dateHtml() +
      '<div class="mydh-grid">' + tiles().map(tileHtml).join('') + '</div>'
    );
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo } = ctx;
    bmOnce = null;

    root.className += ' mydh';
    root.innerHTML = frameHtml();
    root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-open]') as HTMLElement | null;
      if (el) ctx.openItem(el.getAttribute('data-open') || '');
    });

    /* 방마다 따로 읽는다. **하나가 죽어도 나머지는 산다** */
    const jobs: Array<{ item: string; count: () => Promise<string | null> }> = tiles().map((c) => ({
      item: c.item,
      count: () => c.count(repo),
    }));

    const results = await Promise.all(
      jobs.map(async (j) => {
        try {
          return { item: j.item, ok: true as const, value: await j.count() };
        } catch (e) {
          return { item: j.item, ok: false as const, why: (e as Error).message || '' };
        }
      })
    );
    if (!ctx.isCurrent()) return;

    for (const r of results) {
      if (r.ok) {
        /* 못 읽은 자리와 수가 없는 자리는 빈칸 (0 이 아니다) */
        if (r.value) ctx.setCount(r.item, r.value);
        continue;
      }
      const card = root.querySelector('[data-item="' + r.item + '"]');
      if (!card) continue;
      const bad = document.createElement('span');
      bad.className = 'mydh-bad';
      bad.textContent = t('mydash.home.bad', undefined, '못 읽음');
      if (r.why) bad.title = r.why;
      card.appendChild(bad);
    }
    const alive = results.filter((r) => r.ok).length;
    ctx.setCount('today', alive + '/' + results.length);
  }

  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'home',
    get title(): string {
      return t('mydash.nav.home', undefined, '홈');
    },
    access: 'read',
    paths: [BOOKMARKS_PATH, GOALS_PATH, AI_DIR + '/<host>/rollups.json', PC_DIR + '/<host>/summary.json'],
    render,
  });
})();

export {};
