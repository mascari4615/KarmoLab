/**
 * 개인 대시보드 홈. 목록의 **오늘** 자리.
 *
 * 무엇인가: R3 폰 메뉴 결 (2026-11-11 사용자 통과, memo notes/mydash/design/redesign-20261111/). 욘 가운데 크게,
 * 오른쪽 세로 판에 시계, 방 칸 격자, 아래 수 셋. 왼쪽 위 작은 오늘 판. 옛 D2b 카드 일곱 (2026-09-23) 은 대체됨
 *
 * ★ **카드는 데이터를 기다리지 않는다.** 이름과 아이콘은 바로 그리고, 출처마다 따로 읽어
 * 칸 오른쪽 위 작은 수와 왼쪽 목록의 수를 채운다 (`ctx.setCount`). 읽기에 실패하면 **그 카드만** 못 읽음 한 줄.
 * 아직 안 구운 생성기 하나 때문에 홈 전체가 오류 카드가 되지 않게
 *
 * ★ **목록의 작은 수는 여기서 채운다.** 목록이 제 숫자를 따로 받아 오면 같은 파일을 두 번 읽고
 * 두 값이 갈리는 순간이 생긴다. 읽는 자리는 하나
 */
import { dashRegistry, esc, short, usd } from './kit';
import type { DashEntry, DashPanelCtx, DashRepoRead } from './kit';
import { t, loadNamespace } from '../../lib/i18n';
import { ensureToken } from '../planner/gauth';
import { fetchCalendars, fetchEvents } from '../planner/gcal';
import { applyLobbyLook } from './lobby-look';
import { ROOM_ICON_BASE, roomIcon } from './room-icons';
import { listTasks } from '../planner/local-store';

(function (): void {
  'use strict';

  const BOOKMARKS_PATH = 'data/bookmarks/summary.json';
  const GOALS_PATH = 'data/goals/goals.json';
  const AI_DIR = 'data/ai-usage';
  const PC_DIR = 'data/pc-vitals';
  /** 수집기가 올리는 브랜치. 머신 방 VITALS_BRANCH, AI 방 DATA_BRANCH 와 같은 것 */
  const DATA_BRANCH = 'machines-data';
  /** 캘린더 수 상한. 구글 중계가 늦어도 그 카드만 비고 끝남 */
  const CAL_TIMEOUT_MS = 10000;
  const CAREER_PATH = 'data/career/applications.json';

  /** 카드 한 장. 목록 항목 하나로 간다 */
  type Tile = {
    item: string;
    title: string;
    /** 주황 수. 화면에서 주황은 이것 하나 (커리어 마감) */
    accent?: boolean;
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

  /** AI 방과 같은 순서. 수집기 브랜치 (매시) 먼저, 비었거나 못 읽으면 main. auth 는 그대로 던짐 */
  async function aiCount(repo: DashRepoRead): Promise<string> {
    type Roll = { byDay?: Record<string, { cost?: number }> };
    const isAuth = (e: unknown): boolean => (e as { kind?: string } | null)?.kind === 'auth';
    const dirsOf = (entries: DashEntry[]): string[] =>
      entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
    let hosts: string[] = [];
    try {
      hosts = dirsOf(await repo.list(AI_DIR, { ref: DATA_BRANCH }));
    } catch (e) {
      if (isAuth(e)) throw e;
    }
    if (!hosts.length) hosts = dirsOf(await repo.list(AI_DIR));
    if (!hosts.length) throw new Error(AI_DIR + ' 아래에 host 폴더가 없다');
    /* 기계 전부의 30일 합 (AI 사용 방의 전체 칩과 같은 값). 못 읽은 기계는 뺌 */
    const rolls = await Promise.all(
      hosts.map((h) => {
        const path = AI_DIR + '/' + h + '/rollups.json';
        return repo
          .readJson<Roll>(path, { ref: DATA_BRANCH })
          .catch((e: unknown) => {
            if (isAuth(e)) throw e;
            return repo.readJson<Roll>(path);
          })
          .catch((e: unknown) => {
            if (isAuth(e)) throw e;
            return null;
          });
      })
    );
    let cost = 0;
    for (const roll of rolls) {
      const byDay = (roll && roll.byDay) || {};
      for (const d of lastDays(30)) cost += num(byDay[d] && byDay[d].cost);
    }
    return usd(cost);
  }

  /** 머신 방의 작은 수는 서버 (Mois2) 의 마지막 메모리. 폴더가 늘어도 가리키는 기계는 그대로 */
  /**
   * 머신 카드의 작은 수. 사흘 넘게 성능 기록이 안 온 기계가 있으면 그 기계와 날 수 (`Mois3 8일`),
   * 없으면 서버 (Mois2) 의 마지막 메모리. 2026-10-07 Mois3 가 8일 끊긴 것을 아무도 못 봄.
   * 기준은 memo scripts/machines/freshness.mjs (세션 시작 알림) 와 같은 72시간
   */
  async function pcCount(repo: DashRepoRead): Promise<string> {
    type PcSummary = { generatedAt?: string; data?: { latest?: { memUsedPct?: number; at?: string } } };
    const isAuth = (e: unknown): boolean => (e as { kind?: string } | null)?.kind === 'auth';
    /* 수집기 브랜치 먼저 (머신 방과 같은 순서), 없으면 main */
    const read = (host: string): Promise<PcSummary | null> => {
      const path = PC_DIR + '/' + host + '/summary.json';
      return repo
        .readJson<PcSummary>(path, { ref: 'machines-data' })
        .catch((e: unknown) => {
          if (isAuth(e)) throw e;
          return repo.readJson<PcSummary>(path);
        })
        .catch((e: unknown) => {
          if (isAuth(e)) throw e;
          return null;
        });
    };
    const hosts = ['Mois', 'Mois2', 'Mois3'];
    const sums = await Promise.all(hosts.map(read));
    const STALE_MS = 72 * 3600000;
    let worst: { host: string; ms: number } | null = null;
    sums.forEach((j, i) => {
      if (!j) return;
      const at = Date.parse((j.data && j.data.latest && j.data.latest.at) || j.generatedAt || '');
      const ms = Date.now() - at;
      if (Number.isFinite(ms) && ms > STALE_MS && (!worst || ms > worst.ms)) worst = { host: hosts[i], ms };
    });
    const w = worst as { host: string; ms: number } | null;
    if (w) return w.host + ' ' + Math.floor(w.ms / 86400000) + '일';
    const j = sums[1];
    if (!j) throw new Error(PC_DIR + '/Mois2 를 못 읽었다');
    return num(j.data && j.data.latest && j.data.latest.memUsedPct) + '%';
  }

  /**
   * 캘린더. 토큰은 캘린더 패널과 플래너가 같이 쓰는 그것 (`planner/gauth`). 없거나 죽었으면
   * 수 없음. 홈에서 로그인 창은 안 띄운다 (카드 일곱이 한 번에 뜨는 자리)
   */
  async function calendarCountRaw(): Promise<string | null> {
    const token = await ensureToken();
    if (!token) return null;
    /* 오늘은 KST 하루. 기기 지역시 자정을 쓰면 해외 기기에서 다른 방과 날이 갈림 */
    const dayMs = 86400000;
    const fromMs = Math.floor((Date.now() + KST_OFFSET_MS) / dayMs) * dayMs - KST_OFFSET_MS;
    const from = new Date(fromMs);
    const to = new Date(fromMs + dayMs);
    try {
      return String((await fetchEvents(token, await fetchCalendars(token), from, to)).length);
    } catch (e) {
      if (/\b401\b/.test((e as Error).message || '')) return null;
      throw e;
    }
  }

  /** 시간 상한을 건 캘린더 수. 넘기면 던져 그 카드에 못 읽음 */
  function calendarCount(): Promise<string | null> {
    let timer = 0;
    const late = new Promise<never>((_, rej) => {
      timer = window.setTimeout(() => rej(new Error('캘린더 응답 없음 (' + CAL_TIMEOUT_MS / 1000 + '초)')), CAL_TIMEOUT_MS);
    });
    return Promise.race([calendarCountRaw(), late]).finally(() => window.clearTimeout(timer));
  }

  /** 커리어 방의 작은 수는 작성 중이거나 제출한 지원서 중 가장 가까운 마감 D-day */
  type CareerApp = { company?: string; status?: string; deadline?: string };
  async function careerNext(repo: DashRepoRead): Promise<{ left: number; company: string } | null> {
    const j = await repo.readJson<{ applications?: CareerApp[] }>(CAREER_PATH);
    let best: { left: number; company: string } | null = null;
    for (const a of j.applications || []) {
      if (a.status !== 'drafting' && a.status !== 'submitted') continue;
      const end = Date.parse(a.deadline || '');
      if (!Number.isFinite(end) || end < Date.now()) continue;
      const left = Math.floor((end - Date.now()) / 86400000);
      if (!best || left < best.left) best = { left, company: a.company || '' };
    }
    return best;
  }
  async function careerCount(repo: DashRepoRead): Promise<string | null> {
    const n = await careerNext(repo);
    return n ? 'D-' + n.left : null;
  }

  /** 홈 칸 순서. R3 시안 (memo notes/mydash/design/redesign-20261111/drafts/R3-phone.html, 2026-11-11 통과) */
  function tiles(): Tile[] {
    const none = async (): Promise<string | null> => null;
    return [
      { item: 'daily', title: '오늘', count: none },
      { item: 'planner', title: t('widgets.planner.title', undefined, '플래너'), count: calendarCount },
      { item: 'career', title: '커리어', accent: true, count: careerCount },
      { item: 'goals', title: t('mydash.nav.goals', undefined, '목표'), count: goalsCount },
      /* 판정 대기와 북마크는 한 방 (사용자 2026-09-23). 방이 판정 대기부터 열려 목록 수도 대기 수 */
      { item: 'bookmarks', title: t('mydash.nav.bookmarks', undefined, '북마크'), count: async (r) => short(num((await bmCounts(r)).pending)) },
      { item: 'kakao-daily', title: '카톡 정리', count: none },
      { item: 'discord-channels', title: '디코 채널', count: none },
      { item: 'discovery', title: '행사와 AI 소식', count: none },
      { item: 'machines', title: t('mydash.nav.machines', undefined, '머신'), count: pcCount },
      { item: 'ai', title: t('mydash.nav.ai', undefined, 'AI 사용'), count: aiCount },
      { item: 'automations', title: '자동화', count: none },
      { item: 'byeoru', title: '벼루 관리', count: none },
      { item: 'user-presence', title: '내 상태', count: none },
      { item: 'appearance', title: '꾸미기', count: none },
    ];
  }

  /* ── 그리기 ─────────────────────────────────────────────────── */

  function tileHtml(c: Tile): string {
    return (
      '<button type="button" data-open="' + esc(c.item) + '" class="mydh-cell" data-item="' + esc(c.item) + '"' +
      ' style="--mydh-icon:url(' + ROOM_ICON_BASE + esc(roomIcon(c.item)) + '.png)">' +
      '<em class="mydh-n' + (c.accent ? ' mydh-n--acc' : '') + '"></em>' +
      '<span class="mydh-ic" aria-hidden="true"></span>' +
      '<b>' + esc(c.title) + '</b>' +
      '</button>'
    );
  }

  const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  function clockText(): { time: string; date: string; day: string } {
    const d = kstNow();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return { time: hh + ':' + mm, date: d.getUTCMonth() + 1 + '월 ' + d.getUTCDate() + '일', day: WEEKDAYS[d.getUTCDay()] };
  }

  function frameHtml(): string {
    const c = clockText();
    return (
      '<div class="mydh-bg"></div>' +
      '<img class="mydh-yawn" src="/apps/karmolab/img/widgets/mydash/yawn-stand.webp" alt="" aria-hidden="true">' +
      '<section class="mydh-today" aria-label="오늘 할 일"><h2>오늘</h2><ul class="mydh-tasks"></ul></section>' +
      '<aside class="mydh-side">' +
      '<div class="mydh-hd"><b class="mydh-clock">' + c.time + '</b><span class="mydh-day">' + c.date + '<br>' + c.day + '</span></div>' +
      '<div class="mydh-cells">' + tiles().map(tileHtml).join('') + '</div>' +
      '<div class="mydh-ft">' +
      '<div data-foot="tasks"><b>-</b><span>오늘 할 일</span></div>' +
      '<div data-foot="career"><b class="mydh-acc">-</b><span>지원 마감</span></div>' +
      '<div data-foot="bookmarks"><b>-</b><span>북마크 판정 대기</span></div>' +
      '</div></aside>'
    );
  }

  /** 왼쪽 위 오늘 판. 플래너 할 일 (기기 저장) 중 아직 안 한 것 넷까지. 오늘 방과 같은 원본 */
  function paintTasks(root: HTMLElement): void {
    let open: Array<{ title: string }> = [];
    try {
      const local = listTasks();
      open = [...local.inProgress, ...local.todo];
    } catch {
      open = [];
    }
    const ul = root.querySelector('.mydh-tasks');
    if (ul) {
      ul.innerHTML = open.length
        ? open.slice(0, 4).map((x) => '<li>' + esc(x.title) + '</li>').join('')
        : '<li class="mydh-empty">남은 할 일이 없어요</li>';
    }
    const foot = root.querySelector('[data-foot="tasks"] b');
    if (foot) foot.textContent = String(open.length);
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo } = ctx;
    bmOnce = null;

    root.className += ' mydh';
    root.innerHTML = frameHtml();
    applyLobbyLook();
    const changedLook = (): void => { if (ctx.isCurrent()) applyLobbyLook(); };
    window.addEventListener('dash-lobby-change', changedLook);
    window.addEventListener('storage', changedLook);
    ctx.onDispose(() => {
      window.removeEventListener('dash-lobby-change', changedLook);
      window.removeEventListener('storage', changedLook);
    });
    root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-open]') as HTMLElement | null;
      if (el) ctx.openItem(el.getAttribute('data-open') || '');
    });

    /* 왼쪽 위 오늘 판과 아래 할 일 수. 다른 탭이나 오늘 방에서 바뀌면 다시 */
    const repaintTasks = (): void => { if (ctx.isCurrent()) paintTasks(root); };
    repaintTasks();
    window.addEventListener('planner-local-change', repaintTasks);
    window.addEventListener('planner-remote-change', repaintTasks);
    window.addEventListener('storage', repaintTasks);
    /* 시계. 분이 바뀌는 것만 보이면 되니 20초마다 */
    const tick = window.setInterval(() => {
      if (!ctx.isCurrent()) return;
      const c = clockText();
      const clock = root.querySelector('.mydh-clock');
      const day = root.querySelector('.mydh-day');
      if (clock) clock.textContent = c.time;
      if (day) day.innerHTML = esc(c.date) + '<br>' + esc(c.day);
    }, 20000);
    ctx.onDispose(() => {
      window.clearInterval(tick);
      window.removeEventListener('planner-local-change', repaintTasks);
      window.removeEventListener('planner-remote-change', repaintTasks);
      window.removeEventListener('storage', repaintTasks);
    });
    /* 아래 줄 지원 마감은 회사 이름까지 */
    void careerNext(repo)
      .then((n) => {
        if (!ctx.isCurrent()) return;
        const box = root.querySelector('[data-foot="career"]');
        if (!box) return;
        box.querySelector('b')!.textContent = n ? 'D-' + n.left : '-';
        box.querySelector('span')!.textContent = n && n.company ? n.company + ' 마감' : '지원 마감';
      })
      .catch(() => undefined);

    /* 방마다 따로 읽는다. **하나가 죽어도 나머지는 산다** */
    const jobs: Array<{ item: string; count: () => Promise<string | null> }> = tiles().map((c) => ({
      item: c.item,
      count: () => c.count(repo),
    }));

    /* 오는 대로 하나씩 채운다. 느린 출처 하나가 나머지 수를 붙잡지 않게 */
    await Promise.all(
      jobs.map(async (j): Promise<boolean> => {
        let value: string | null;
        try {
          value = await j.count();
        } catch (e) {
          if (!ctx.isCurrent()) return false;
          const card = root.querySelector('[data-item="' + j.item + '"]');
          if (card) {
            const bad = document.createElement('span');
            bad.className = 'mydh-bad';
            bad.textContent = t('mydash.home.bad', undefined, '못 읽음');
            const why = (e as Error)?.message || '';
            if (why) bad.title = why;
            card.appendChild(bad);
          }
          return false;
        }
        /* 못 읽은 자리와 수가 없는 자리는 빈칸 (0 이 아니다) */
        if (ctx.isCurrent() && value) {
          ctx.setCount(j.item, value);
          const n = root.querySelector('[data-item="' + j.item + '"] .mydh-n');
          if (n) n.textContent = value;
          if (j.item === 'bookmarks') {
            const foot = root.querySelector('[data-foot="bookmarks"] b');
            if (foot) foot.textContent = value;
          }
        }
        return true;
      })
    );
  }

  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'home',
    get title(): string {
      return t('mydash.nav.home', undefined, '홈');
    },
    access: 'read',
    paths: [BOOKMARKS_PATH, GOALS_PATH, CAREER_PATH, AI_DIR + '/<host>/rollups.json', PC_DIR + '/<host>/summary.json'],
    render,
  });
})();

export {};
