/**
 * 패널: AI 사용 통계 (1단계, 읽기 전용).
 *
 * 왜 이게 첫 패널인가: 데이터가 **이미 커밋돼 있다**. `memo/data/ai-usage/<host>/` 를
 * `memo/scripts/ai-usage/*.mjs` 가 굽는 것. 새로 만들 생산자도, git 쓰기도 없음.
 * 셸이 진짜로 되는지(로그인 → private 읽기 → 폰에서 보임)만 이 패널로 판정.
 *
 * host 를 코드에 안 박는다. `data/ai-usage/` 를 훑어 폴더를 찾는다. 지금은 `mois` 하나지만
 * 노트북이 하나 늘면 그날 코드를 고치러 오고 싶지 않음.
 *
 * 그림은 Canvas 2D 로 직접 그린다 (memo-atlas 와 같은 손. 새 의존성 없음).
 */
import { dashRegistry, esc, hours, short, usd } from './kit';
import { buildQuota } from '../../lib/ai-quota';
import { loadNamespace } from '../../lib/i18n';
import type { DashPanelCtx } from './kit';

(function (): void {
  'use strict';

  type Usage = {
    input: number; output: number; cacheCreate: number; cacheRead: number;
    thinking: number; webSearch: number;
  };
  type Bucket = {
    sessions: number; prompts: number; requests: number; cost: number;
    usage: Usage; activeMs: number; toolCalls: number; edits: number; commits: number;
    models: Record<string, number>;
  };
  /**
   * 프롬프트 이력은 Bucket 과 소스가 다름. `byDay`, `byMonth` 는 transcript 남은
   * 세션만 포함, `promptsByDay`, `promptsByMonth` 는 셸 history 전량 포함.
   * 2026-09-09 실측: 1년 창에서 byDay 합 6347, promptsByDay 합 12619 (coverage.historyPrompts 와 일치).
   * 프롬프트 수는 언제나 promptsBy* 사용.
   */
  type PromptStat = { prompts: number; sessions: number; chars?: number; withTranscript?: number };
  type Rollups = {
    generatedAt: string;
    host: string;
    byDay: Record<string, Bucket>;
    byMonth: Record<string, Bucket>;
    byRepo: Record<string, Bucket>;
    byModel: Record<string, Bucket>;
    byHour: Record<string, Bucket>;
    promptsByDay?: Record<string, PromptStat>;
    promptsByMonth?: Record<string, PromptStat>;
    /**
     * 날짜별 저장소, 모델 쪼갬. 2026-09-10 mois 롤업에는 없음
     * (`byRepo`, `byModel` 은 ingest.mjs 의 전량 누적 전용).
     * 있으면 목록이 기간 칩 반영, 없으면 제목에 전체 기간 표기
     */
    byRepoByDay?: Record<string, Record<string, Bucket>>;
    byModelByDay?: Record<string, Record<string, Bucket>>;
    coverage?: {
      lastHistory?: string; firstHistory?: string; claudeTranscripts?: number; historyPrompts?: number;
      historySessions?: number;
    };
  };

  const ROOT_DIR = 'data/ai-usage';
  const ENV_DIR = 'data/ai-env';

  /** 보여 줄 것. 폰에서 한 화면에 넷이 한계다. */
  type MetricId = 'cost' | 'sessions' | 'prompts' | 'commits';
  const METRICS: Array<{ id: MetricId; label: string; get: (b: Bucket) => number; fmt: (n: number) => string }> = [
    { id: 'cost', label: '환산가', get: (b) => b.cost, fmt: usd },
    { id: 'sessions', label: '세션', get: (b) => b.sessions, fmt: (n) => short(n) },
    { id: 'prompts', label: '프롬프트', get: (b) => b.prompts, fmt: (n) => short(n) },
    { id: 'commits', label: '커밋', get: (b) => b.commits, fmt: (n) => short(n) },
  ];

  const STYLE_ID = 'mydash-aiusage-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = [
      '.au{display:flex;flex-direction:column;gap:14px}',
      /* 탭 (사용량, 구독, 환경). 플래너 세로줄 단추와 같은 결: 켜진 것만 먹색 */
      '.au-tabs{display:flex;gap:4px;margin-bottom:14px}',
      '.au-tab{min-height:36px;padding:0 16px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);font-weight:700;cursor:pointer}',
      '.au-tab[aria-selected="true"]{background:var(--text-primary);color:var(--bg-secondary);border-color:var(--text-primary)}',
      /* 폰이 기본. 두 칸이면 큰 숫자가 안 줄어든다. 넓어지면 넷. */
      '.au-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}',
      '@media(min-width:560px){.au-nums{grid-template-columns:repeat(4,1fr)}}',
      '.au-num{padding:10px 12px;border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.au-num b{display:block;font-size:1.25rem;line-height:1.3;font-variant-numeric:tabular-nums}',
      '.au-num span{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.au-chips{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch}',
      /* 손가락 최소 44px. 높이는 min-height 로 벌리고 세로 padding 은 줄여 글자 위치 유지. */
      '.au-chips button{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;',
      'min-height:44px;min-width:44px;padding:0 11px;font:inherit;font-size:var(--font-size-2xs);cursor:pointer;',
      'background:transparent;color:var(--text-secondary);border:1px solid currentColor;border-radius:var(--radius-pill)}',
      '.au-chips button.on{color:var(--text-primary);background:var(--bg-hover)}',
      '.au-chart{width:100%;height:150px;display:block;border-radius:var(--radius-lg);background:var(--bg-secondary);touch-action:pan-y}',
      '@media(min-width:560px){.au-chart{height:200px}}',
      '.au-sec{display:flex;flex-direction:column;gap:6px}',
      '.au-sec h4{margin:0;font-size:var(--font-size-2xs);color:var(--text-tertiary);font-weight:600}',
      /* 가로 넘침 방지. 2026-09-13 실측에서 .au-bar 가 29,375px 로 자라 가로 스크롤 24배 */
      '.au-sec{min-width:0;max-width:100%;overflow-x:hidden}',
      '.au-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;font-size:var(--font-size-2xs);min-width:0;max-width:100%}',
      '.au-line em{font-style:normal;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.au-line i{font-style:normal;font-variant-numeric:tabular-nums;color:var(--text-primary)}',
      '.au-bar{grid-column:1/-1;height:3px;max-width:100%;border-radius:var(--radius-pill);background:var(--accent);opacity:.45}',
      '.au-foot{font-size:var(--font-size-3xs);color:var(--text-tertiary);line-height:1.7}',
      '.au-env-scroll{overflow-x:auto}',
      '.au-env{width:100%;border-collapse:collapse;font-size:var(--font-size-2xs)}',
      '.au-env th,.au-env td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}',
      '.au-env thead th{color:var(--text-tertiary);font-weight:600}',
      '.au-env tbody th{width:28%}',
      '.au-env small{display:block;margin-top:3px;color:var(--text-tertiary)}',
      '.au-env-state{display:inline-block;border:1px solid var(--border);border-radius:var(--radius-pill);padding:1px 7px}',
      '.au-env-state--applied{color:var(--success);border-color:var(--success)}',
      '.au-env-state--partial{color:var(--warning);border-color:var(--warning)}',
      '.au-env-state--missing{color:var(--error);border-color:var(--error)}',
    ].join('');
    document.head.appendChild(el);
  }

  function sum(buckets: Bucket[]): Bucket {
    const zero: Bucket = {
      sessions: 0, prompts: 0, requests: 0, cost: 0, activeMs: 0, toolCalls: 0, edits: 0, commits: 0,
      usage: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, thinking: 0, webSearch: 0 },
      models: {},
    };
    for (const b of buckets) {
      zero.sessions += b.sessions || 0;
      zero.prompts += b.prompts || 0;
      zero.requests += b.requests || 0;
      zero.cost += b.cost || 0;
      zero.activeMs += b.activeMs || 0;
      zero.toolCalls += b.toolCalls || 0;
      zero.edits += b.edits || 0;
      zero.commits += b.commits || 0;
    }
    return zero;
  }

  function daysAgo(iso: string): string {
    const t = Date.parse(iso);
    if (!isFinite(t)) return '';
    const d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return '오늘 구움';
    if (d === 1) return '어제 구움';
    return d + '일 전에 구움';
  }

  /**
   * 막대 그림. **비어 있는 날도 자리를 차지한다**. 안 그러면 쉬었던 구간이 사라져
   * 매일 했던 것처럼 보임. 날짜를 채워 그리기.
   */
  function drawBars(canvas: HTMLCanvasElement, days: string[], vals: number[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 150;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!days.length) return;

    let max = 0;
    for (const v of vals) if (v > max) max = v;
    if (max <= 0) max = 1;

    const pad = 6;
    const inner = h - pad * 2;
    const step = (w - pad * 2) / days.length;
    const bw = Math.max(1, Math.min(step - 1, step * 0.8));

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#6ea8fe';
    const dim = css.getPropertyValue('--text-tertiary').trim() || '#888';

    /* 가운데 눈금 하나만. 폰에서 눈금 넷은 그림보다 눈금이 커진다. */
    ctx.strokeStyle = dim;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(pad, pad + inner / 2);
    ctx.lineTo(w - pad, pad + inner / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    for (let i = 0; i < days.length; i++) {
      const v = vals[i];
      if (v <= 0) continue;
      const bh = Math.max(1, (v / max) * inner);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(pad + i * step + (step - bw) / 2, pad + inner - bh, bw, bh);
    }
    ctx.globalAlpha = 1;
  }

  const KST_OFFSET_MS = 9 * 3600000;

  /** 롤업 날짜 키는 KST 고정. 기기 지역시로 만들면 시차만큼 창이 밀린다. */
  function kstDayKey(ms: number): string {
    const d = new Date(ms + KST_OFFSET_MS);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + m + '-' + day;
  }

  /** KST 오늘부터 거꾸로 n 일의 키. */
  function lastDays(n: number): string[] {
    const out: string[] = [];
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) out.push(kstDayKey(now - i * 86400000));
    return out;
  }

  /**
   * 날짜 키 하나의 지표 값. 프롬프트와 세션은 소스가 promptsByDay.
   * byDay 의 sessions 는 transcript 가 남은 세션만 센다. 2026-09-10 실측:
   * 1년 창에서 byDay 246, promptsByDay 702. 창이 넓을수록 과소 확대
   */
  function dayValue(roll: Rollups, id: MetricId, get: (b: Bucket) => number, key: string): number {
    if (id === 'prompts' && roll.promptsByDay) return roll.promptsByDay[key]?.prompts || 0;
    if (id === 'sessions' && roll.promptsByDay) return roll.promptsByDay[key]?.sessions || 0;
    const b = roll.byDay[key];
    return b ? get(b) || 0 : 0;
  }

  /** 달 키 하나의 지표 값. 위와 같은 이유로 프롬프트와 세션은 promptsByMonth. */
  function monthValue(roll: Rollups, id: MetricId, get: (b: Bucket) => number, key: string): number {
    if (id === 'prompts' && roll.promptsByMonth) return roll.promptsByMonth[key]?.prompts || 0;
    if (id === 'sessions' && roll.promptsByMonth) return roll.promptsByMonth[key]?.sessions || 0;
    const b = (roll.byMonth || {})[key];
    return b ? get(b) || 0 : 0;
  }

  /**
   * 창 안의 프롬프트 합. promptsByDay 없는 옛 롤업만 byDay 로 물러섬.
   * 소스를 byDay 로 바꾸지 말 것. history 가 정본, 1년 창 합 12,619 가
   * coverage.historyPrompts 와 일치. byDay 는 transcript 남은 세션만 담아
   * 30일 창 4,259, 90일 창 6,278 로 창이 좁을수록 오히려 부풀어 보임
   * (같은 창에서 promptsByDay 는 3,792 와 5,852). 줄어드는 쪽이 맞는 값
   */
  function promptsInWindow(roll: Rollups, days: string[]): number {
    let n = 0;
    for (const d of days) n += dayValue(roll, 'prompts', (b) => b.prompts, d);
    return n;
  }

  /**
   * 창 안의 세션 합. 프롬프트와 같은 소스.
   * promptsByDay 없는 옛 롤업은 dayValue 안에서 byDay 의 창 합으로 물러섬.
   * coverage.historySessions 는 창이 아니라 전량이라 여기서 제외.
   * 2026-09-10 실측: 30일 창에서 창 합 193, coverage 511. 창 무시 시 두 배 넘는 과대
   */
  function sessionsInWindow(roll: Rollups, days: string[]): number {
    let n = 0;
    for (const d of days) n += dayValue(roll, 'sessions', (b) => b.sessions, d);
    return n;
  }

  function topList(rec: Record<string, Bucket>, pick: (b: Bucket) => number, limit: number): Array<[string, number]> {
    const rows: Array<[string, number]> = [];
    for (const k of Object.keys(rec || {})) rows.push([k, pick(rec[k]) || 0]);
    rows.sort((a, b) => b[1] - a[1]);
    return rows.slice(0, limit);
  }

  /**
   * 창 안의 저장소, 모델 합. 날짜별 쪼갬 있을 때만 창 반영.
   * 없으면 null 반환, 호출부가 전량 목록과 전체 기간 제목으로 대체
   */
  function windowedTop(
    byDayRec: Record<string, Record<string, Bucket>> | undefined,
    days: string[],
    pick: (b: Bucket) => number,
    limit: number
  ): Array<[string, number]> | null {
    if (!byDayRec) return null;
    const acc: Record<string, number> = {};
    for (const d of days) {
      const per = byDayRec[d];
      if (!per) continue;
      for (const k of Object.keys(per)) acc[k] = (acc[k] || 0) + (pick(per[k]) || 0);
    }
    const rows: Array<[string, number]> = Object.keys(acc).map((k) => [k, acc[k]]);
    rows.sort((a, b) => b[1] - a[1]);
    return rows.slice(0, limit);
  }

  function listHtml(title: string, rows: Array<[string, number]>, fmt: (n: number) => string): string {
    if (!rows.length) return '';
    const max = rows[0][1] || 1;
    const body = rows
      .map(
        ([k, v]) =>
          '<div class="au-line"><em>' + esc(k) + '</em><i>' + esc(fmt(v)) + '</i>' +
          '<div class="au-bar" style="width:' + Math.max(2, Math.round((v / max) * 100)) + '%"></div></div>'
      )
      .join('');
    return '<div class="au-sec"><h4>' + esc(title) + '</h4>' + body + '</div>';
  }

  async function renderUsage(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    const { root, repo, status } = ctx;
    root.innerHTML = '<div class="au"><div class="au-foot">저장소에서 받는 중...</div></div>';

    /* host 찾기. 폴더가 여럿이면 첫 번째. 하나뿐인 지금은 고르는 UI 를 안 만듦
       (없는 선택지를 그리면 화면만 늘고 고를 것이 없다). 늘면 그때 칩을 붙인다. */
    const entries = await repo.list(ROOT_DIR);
    const dirs = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
    if (!dirs.length) throw new Error(ROOT_DIR + ' 아래에 host 폴더가 없다');
    const host = dirs[0];

    const roll = await repo.readJson<Rollups>(ROOT_DIR + '/' + host + '/rollups.json');
    status(host + ', ' + daysAgo(roll.generatedAt));

    const wrap = document.createElement('div');
    wrap.className = 'au';
    root.textContent = '';
    root.appendChild(wrap);

    let span = 30;
    let metric: MetricId = 'cost';

    const numsEl = document.createElement('div');
    numsEl.className = 'au-nums';
    const spanEl = document.createElement('div');
    spanEl.className = 'au-chips';
    const metricEl = document.createElement('div');
    metricEl.className = 'au-chips';
    const canvas = document.createElement('canvas');
    canvas.className = 'au-chart';
    const restEl = document.createElement('div');
    restEl.className = 'au';

    wrap.appendChild(spanEl);
    wrap.appendChild(numsEl);
    wrap.appendChild(metricEl);
    wrap.appendChild(canvas);
    wrap.appendChild(restEl);

    for (const s of [30, 90, 365]) {
      const b = document.createElement('button');
      b.textContent = s === 365 ? '1년' : s + '일';
      b.addEventListener('click', () => {
        span = s;
        paint();
      });
      spanEl.appendChild(b);
    }
    for (const m of METRICS) {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.addEventListener('click', () => {
        metric = m.id;
        paint();
      });
      metricEl.appendChild(b);
    }

    function paint(): void {
      const days = lastDays(span);
      const picked = days.filter((d) => roll.byDay[d]).map((d) => roll.byDay[d]);
      const total = sum(picked);
      const totalPrompts = promptsInWindow(roll, days);
      const totalSessions = sessionsInWindow(roll, days);
      const m = METRICS.filter((x) => x.id === metric)[0];

      const chips = Array.from(spanEl.querySelectorAll('button'));
      chips.forEach((b, i) => b.classList.toggle('on', [30, 90, 365][i] === span));
      Array.from(metricEl.querySelectorAll('button')).forEach((b, i) =>
        b.classList.toggle('on', METRICS[i].id === metric)
      );

      numsEl.innerHTML =
        '<div class="au-num"><b>' + esc(usd(total.cost)) + '</b><span>환산가</span></div>' +
        '<div class="au-num"><b>' + esc(short(totalSessions)) + '</b><span>세션</span></div>' +
        '<div class="au-num"><b>' + esc(short(totalPrompts)) + '</b><span>프롬프트</span></div>' +
        '<div class="au-num"><b>' + esc(hours(total.activeMs)) + '</b><span>붙어 있던 시간</span></div>';

      drawBars(canvas, days, days.map((d) => dayValue(roll, m.id, m.get, d)));

      /* 달 목록도 소스가 갈린다. 프롬프트만 있는 달이 빠지지 않게 키를 합집합으로 모은다. */
      const monthKeys: string[] = Object.keys(roll.byMonth || {});
      for (const k of Object.keys(roll.promptsByMonth || {})) {
        if (monthKeys.indexOf(k) < 0) monthKeys.push(k);
      }
      const months = monthKeys.sort().reverse().slice(0, 6);
      const monthRows: Array<[string, number]> = months.map((k) => [k, monthValue(roll, m.id, m.get, k)]);

      /* 저장소와 모델은 창별 자료가 있을 때만 칩을 따른다. 없으면 전량을 그대로 보이고
         제목에 전체 기간이라고 적는다. 창 제목에 전량 수치를 넣으면 거짓말이 된다. */
      const modelWin = windowedTop(roll.byModelByDay, days, (b) => b.sessions, 6);
      const repoWin = windowedTop(roll.byRepoByDay, days, m.get, 5);
      const modelRows = modelWin || topList(roll.byModel, (b) => b.sessions, 6);
      const repoRows = repoWin || topList(roll.byRepo, m.get, 5);
      const modelTitle = modelWin ? '모델 (세션)' : '모델 (세션, 전체 기간)';
      const repoTitle = repoWin ? '저장소 (' + m.label + ')' : '저장소 (' + m.label + ', 전체 기간)';

      restEl.innerHTML =
        listHtml('달마다 (' + m.label + ')', monthRows, m.fmt) +
        listHtml(modelTitle, modelRows, (n) => short(n) + '판') +
        listHtml(repoTitle, repoRows, m.fmt) +
        '<div class="au-foot">' +
        esc(
          '환산가는 실제 결제액이 아니라 토큰을 정가로 환산한 값이다. ' +
            host + ', ' + daysAgo(roll.generatedAt) +
            (roll.coverage && roll.coverage.lastHistory
              ? ', 마지막 기록 ' + roll.coverage.lastHistory.slice(0, 10)
              : '')
        ) +
        '</div>';
    }

    paint();

    /* 화면이 돌아가면 캔버스 폭이 바뀐다. 다시 안 그리면 늘어진 그림이 남는다. */
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => paint());
      ro.observe(canvas);
    } catch {
      ro = null;
    }
    ctx.onDispose(() => {
      try {
        ro?.disconnect();
      } catch {
        /* 이미 사라진 판 */
      }
    });
  }

  /* 탭 셋. 사용량 (rollups), 구독 (laptop-ops 카드), 환경 (하네스 표, data/ai-env).
     2026-09-26 사용자: 표는 Dash, KarmoLab 내 AI 는 목록에서 내림 */
  type Tab = 'usage' | 'quota' | 'env';
  const TAB_KEY = 'karmolab.dash.ai.tab';
  function savedTab(): Tab {
    try {
      const v = localStorage.getItem(TAB_KEY);
      if (v === 'quota' || v === 'env') return v;
      return 'usage';
    } catch {
      return 'usage';
    }
  }

  type EnvVendor = { vendor: string; status: string; reason: string; evidence: string[] };
  type EnvFeature = { id: string; label: string; description: string; vendors: EnvVendor[] };
  type EnvAudit = { checked_at: number; features: EnvFeature[] };

  function envStatusLabel(status: string): string {
    if (status === 'applied') return '적용';
    if (status === 'partial') return '일부';
    if (status === 'missing') return '미적용';
    return '확인 필요';
  }

  async function renderEnv(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    const { root, repo, status } = ctx;
    root.innerHTML = '<div class="au"><div class="au-foot">저장소에서 받는 중...</div></div>';
    const entries = await repo.list(ENV_DIR);
    const dirs = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
    if (!dirs.length) {
      root.innerHTML = '<div class="au"><div class="au-foot">하네스 표가 아직 없다. <code>node memo/scripts/ai-env/audit.mjs</code></div></div>';
      return;
    }
    const host = dirs[0];
    const audit = await repo.readJson<EnvAudit>(ENV_DIR + '/' + host + '/audit.json');
    const when = audit.checked_at ? agoSeconds(audit.checked_at) : '';
    status(host + (when ? ', ' + when : ''));
    const vendors = ['claude', 'codex', 'grok'] as const;
    const head = vendors.map((v) => '<th>' + v[0].toUpperCase() + v.slice(1) + '</th>').join('');
    const rows = (audit.features || []).map((feature) => {
      const cells = vendors.map((vendor) => {
        const found = feature.vendors.find((item) => item.vendor === vendor);
        if (!found) return '<td></td>';
        const evidence = (found.evidence || []).map(esc).join('\n');
        return '<td><span class="au-env-state au-env-state--' + esc(found.status) + '" title="' + evidence + '">' +
          esc(envStatusLabel(found.status)) + '</span><small>' + esc(found.reason) + '</small></td>';
      }).join('');
      return '<tr><th scope="row"><strong>' + esc(feature.label) + '</strong><small>' + esc(feature.description) + '</small></th>' + cells + '</tr>';
    }).join('');
    root.innerHTML =
      '<div class="au"><p class="au-foot">이 컴퓨터의 지침, 스킬, 훅이 벤더마다 깔려 있는지. 칸에 마우스를 올리면 근거 경로.</p>' +
      '<div class="au-env-scroll"><table class="au-env"><thead><tr><th>기능</th>' + head + '</tr></thead><tbody>' +
      rows + '</tbody></table></div></div>';
  }

  function agoSeconds(epoch: number): string {
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - epoch);
    if (diff < 90) return '방금 검사';
    const mins = Math.round(diff / 60);
    if (mins < 60) return mins + '분 전 검사';
    const hours = Math.round(mins / 60);
    if (hours < 48) return hours + '시간 전 검사';
    return Math.round(hours / 24) + '일 전 검사';
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    const shell = document.createElement('div');
    shell.className = 'au-tabs-wrap';
    shell.innerHTML =
      '<div class="au-tabs" role="tablist">' +
      '<button type="button" role="tab" class="au-tab" data-tab="usage">사용량</button>' +
      '<button type="button" role="tab" class="au-tab" data-tab="quota">구독</button>' +
      '<button type="button" role="tab" class="au-tab" data-tab="env">환경</button>' +
      '</div><div class="au-pane" data-pane="usage"></div><div class="au-pane" data-pane="quota" hidden></div><div class="au-pane" data-pane="env" hidden></div>';
    ctx.root.innerHTML = '';
    ctx.root.appendChild(shell);
    const pane = (id: Tab): HTMLElement => shell.querySelector('[data-pane="' + id + '"]') as HTMLElement;
    const built = new Set<Tab>();
    async function show(id: Tab): Promise<void> {
      try {
        localStorage.setItem(TAB_KEY, id);
      } catch {
        /* 못 적으면 다음에 사용량부터 */
      }
      shell.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      pane('usage').hidden = id !== 'usage';
      pane('quota').hidden = id !== 'quota';
      pane('env').hidden = id !== 'env';
      if (built.has(id)) return;
      built.add(id);
      if (id === 'usage') await renderUsage({ ...ctx, root: pane('usage') });
      else if (id === 'env') await renderEnv({ ...ctx, root: pane('env') });
      else {
        await loadNamespace('my-ai').catch(() => undefined);
        buildQuota(pane('quota'), (fn) => ctx.onDispose(fn), undefined, () => ctx.ghToken());
      }
    }
    shell.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => void show(b.dataset.tab as Tab))
    );
    await show(savedTab());
  }

  dashRegistry().register({
    id: 'ai-usage',
    title: 'AI 사용',
    access: 'read',
    paths: [ROOT_DIR + '/<host>/rollups.json', ENV_DIR + '/<host>/audit.json'],
    render,
  });
})();

export {};
