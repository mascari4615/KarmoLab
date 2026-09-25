/**
 * 패널: 머신 (기계 셋의 사양, 지금 상태, 30일 성능, 서버 조작).
 *
 * 정본: memo `changes/dash-machines.md` 의 MVP 1 계약과 화면 결정. 시안은
 * memo `notes/mydash/design/skill-bench/Z1-machines-columns-*.html` (개요) 와
 * `Zb-machine-onepage-*.html` (카드를 누른 상세).
 *
 * 읽는 것
 * - 저장소 `data/pc-vitals/<host>/summary.json` (봉투 `pc-vitals/1`). 30일 선, 일별, 판정, 마지막 표본.
 *   브랜치 `machines-data` (기계별 수집기가 10분마다) 먼저, 없으면 main
 * - 저장소 `data/machines/<host>/spec.json` (`machine-spec/1`) 과 `notes.json` (사람이 적는 메모). 둘 다 없어도 됨
 * - Mois2 만 laptop-ops `GET /dash/machine` 을 1분마다 (이 방이 화면에 있을 때만).
 *   본인 확인은 Dash 로그인 토큰 그대로 (`ctx.ghToken`). ops 토큰은 브라우저 밖
 *
 * ★ **없는 값은 하이픈.** 못 닿으면 "연결 안 됨", 지어낸 숫자 금지
 * Mois, Mois3 는 아직 상시 문이 없어 summary.json 의 마지막 표본이 15분 안이면 켜짐, 넘으면 꺼짐.
 *
 * 옛 PC 성능 패널 (`pc-vitals.ts`) 의 메모리 판정과 일별 표는 상세로 이관
 * 그림은 SVG polyline 으로 직접. 그래프 라이브러리 없음.
 */
import { dashRegistry, esc } from './kit';
import type { DashPanelCtx, DashRepoRead } from './kit';
import { createLocalServers } from './local-servers';

(function (): void {
  'use strict';

  /* ── 자료 모양. 전부 선택 필드. 받은 쪽이 모자라도 그린다 ── */

  type Latest = {
    at?: string;
    memUsedPct?: number | null;
    memUnexplainedPct?: number | null;
    cpuPct?: number | null;
    diskFreeGb?: number | null;
    netKbps?: number | null;
    uptimeH?: number | null;
  };
  type Day = {
    day?: string;
    samples?: number;
    memUsedPctAvg?: number | null;
    memUsedPctMax?: number | null;
    cpuPctAvg?: number | null;
    diskFreeGbMin?: number | null;
  };
  type Verdict = { day?: string; kind?: string; text?: string };
  type Basis = { totalMB?: number | null; from?: string };
  type Summary = {
    schema?: string;
    generatedAt?: string;
    basis?: Basis;
    data?: { host?: string; latest?: Latest; days?: Day[]; verdicts?: Verdict[]; basis?: Basis };
  };
  type Spec = {
    schema?: string;
    host?: string;
    at?: string;
    cpu?: { name?: string; cores?: number; threads?: number } | null;
    ramGb?: number | null;
    gpus?: string[] | null;
    disks?: Array<{ name?: string; media?: string; sizeGb?: number }> | null;
    board?: string | null;
    model?: string | null;
    os?: string | null;
  };
  type Notes = { purchase?: string; warranty?: string; memo?: string };
  /** laptop-ops `Vitals` (memo `laptop-ops/src/routes/vitals-read.ts`). 모르는 값은 -1 로 온다 */
  type Vitals = {
    totalMB?: number;
    availMB?: number;
    usedPct?: number;
    commitMB?: number;
    commitLimitMB?: number;
    poolNonpagedMB?: number;
    unexplainedMB?: number;
    cpuPct?: number;
    netRecvKBs?: number;
    netSentKBs?: number;
    disks?: Array<{ drive?: string; totalMB?: number; freeMB?: number; usedPct?: number }>;
    bootUp?: string;
    verdict?: string;
    /** 아직 laptop-ops 가 안 준다. 오면 그린다 */
    tempC?: number;
  };
  type SvcState = 'running' | 'stopped' | 'paused' | 'unknown';
  type Service = { name: string; state: SvcState };
  type Live = { at: string; vitals: Vitals | null; services: Service[]; spec: Spec | null };

  type Host = { id: string; role: string; live: boolean };
  type Machine = Host & {
    summary: Summary | null;
    spec: Spec | null;
    notes: Notes | null;
    now: Live | null;
    /** 마지막 시도가 실패한 까닭. 빈 글자면 실패 아님 */
    nowErr: string;
    nowTried: boolean;
  };

  /** 기계 셋. 순서와 역할은 고정 (사용자 2026-09-25) */
  const HOSTS: Host[] = [
    { id: 'Mois', role: '데스크톱', live: false },
    { id: 'Mois2', role: '서버', live: true },
    { id: 'Mois3', role: '노트북', live: false },
  ];
  const LAPTOP = 'https://laptop.mascari4615.com';
  const VITALS_DIR = 'data/pc-vitals';
  /** 기계별 수집기 (memo scripts/machines) 가 부모 없는 커밋으로 덮어쓰는 브랜치 */
  const VITALS_BRANCH = 'machines-data';
  const MACHINES_DIR = 'data/machines';
  const LIVE_MS = 60000;
  const LOG_MS = 5000;
  const LOG_LINES = 200;
  const FETCH_MS = 10000;
  /** 마지막 표본이 이보다 오래면 꺼진 것으로 본다 (상시 문이 없는 기계) */
  const FRESH_MS = 15 * 60000;
  const DAYS = 30;
  const DAY_MS = 86400000;
  const KST_MS = 9 * 3600000;
  const ARM_MS = 4000;
  const DASH = '-';

  const STYLE_ID = 'mydash-machines-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색은 전부 dash 토큰 (dash.css 의 머신 방 줄). 여기는 자리와 크기만 */
    el.textContent = [
      '.mc{display:flex;flex-direction:column;gap:12px}',
      '.mc-paper{background:var(--dash-paper);border:1px solid var(--border);box-shadow:var(--dash-shadow);',
      'color:var(--text-primary);min-width:0}',
      '.mc-cols{display:grid;grid-template-columns:1fr;gap:16px}',
      '@media(min-width:900px){.mc{height:100%;min-height:0}',
      '.mc-cols{grid-template-columns:repeat(3,1fr);flex:1;min-height:0}',
      '.mc-col{overflow:auto;min-height:0}}',
      '.mc-col{padding:24px 24px 16px;display:flex;flex-direction:column;cursor:pointer;',
      'transition:border-color var(--transition)}',
      '.mc-col:hover,.mc-col:focus-visible{border-color:var(--text-primary);outline:0}',
      '.mc-col.mc-off>*{opacity:.62}',
      '.mc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}',
      '.mc-name{margin:0 0 2px;font:500 32px/1 var(--font-display);letter-spacing:.01em}',
      '.mc-lab{font-size:var(--font-size-xs);font-weight:700;color:var(--text-secondary)}',
      '.mc-st{text-align:right;font-size:var(--font-size-xs);font-weight:700}',
      '.mc-seen{color:var(--text-tertiary);font-weight:500;font-size:var(--font-size-2xs)}',
      '.mc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dash-ok);',
      'margin-right:6px;vertical-align:1px;flex:none}',
      '.mc-dot.off{background:var(--dash-off)}.mc-dot.warn{background:var(--accent)}',
      '.mc-grid4{display:grid;grid-template-columns:1fr 1fr;gap:18px 12px;margin:26px 0 22px}',
      '.mc-big{font:400 44px/1 var(--font-display);font-variant-numeric:tabular-nums}',
      '.mc-big small{font-size:var(--font-size-md);color:var(--text-tertiary);margin-left:2px}',
      '.mc-big.none{color:var(--text-tertiary)}',
      '.mc-trend{display:flex;flex-direction:column;gap:8px;margin-bottom:20px}',
      '.mc-ln{display:block;width:100%;height:56px}',
      '.mc-ln.tall{height:140px}',
      '.mc-ln polyline{fill:none;stroke:var(--dash-ok);stroke-width:1.5;vector-effect:non-scaling-stroke}',
      '.mc-ln.ram polyline{stroke:var(--accent)}',
      '.mc-ln line{stroke:var(--pl-line2);stroke-width:1;vector-effect:non-scaling-stroke}',
      '.mc-axis{display:flex;justify-content:space-between;font-size:var(--font-size-3xs);color:var(--text-tertiary);margin-top:-4px}',
      '.mc-empty{color:var(--text-tertiary);font-size:var(--font-size-xs);padding:6px 0}',
      '.mc-row{display:flex;align-items:center;gap:10px;min-height:44px;border-top:1px solid var(--pl-line2);font-size:var(--font-size-xs)}',
      '.mc-row b{font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-row .btn{margin-left:auto;min-height:30px;padding:0 12px;background:var(--dash-paper)}',
      '.mc-row .btn.arm{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}',
      '.mc-msg{font-size:var(--font-size-2xs);color:var(--text-tertiary);white-space:nowrap}',
      '.mc-msg.err{color:var(--error)}',
      '.mc-svc{margin-bottom:12px}',
      '.mc-spec{display:grid;grid-template-columns:64px 1fr;row-gap:6px;column-gap:8px;margin:0;font-size:var(--font-size-xs)}',
      '.mc-spec dt{color:var(--text-tertiary);font-weight:700}.mc-spec dd{margin:0;word-break:break-word}',
      '.mc-spec dd.hint{color:var(--text-tertiary)}',
      '.mc-colspec{margin-top:auto;padding-top:14px;border-top:1px solid var(--pl-line2)}',
      /* 상세 */
      '.mc-back{align-self:flex-start;border:0;background:none;padding:4px 0;font:inherit;font-size:var(--font-size-sm);',
      'font-weight:700;color:var(--text-primary);cursor:pointer}',
      '.mc-back:hover{color:var(--accent-ink)}',
      '.mc-dcols{display:grid;grid-template-columns:1fr;gap:16px}',
      '@media(min-width:900px){.mc-dcols{grid-template-columns:400px minmax(0,1fr) 330px;flex:1;min-height:0}',
      '.mc-c{overflow:auto}}',
      '.mc-c{padding:22px 24px;display:flex;flex-direction:column;gap:16px;min-height:0}',
      '.mc-c .mc-sec{border-top:1px solid var(--pl-line2);padding-top:14px;display:flex;flex-direction:column;gap:8px}',
      '.mc-nums{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px}',
      '.mc-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
      '.mc-mem{display:grid;grid-template-columns:1fr auto;row-gap:8px;font-size:var(--font-size-xs)}',
      '.mc-mem>span:nth-child(even){font:16px var(--font-display);text-align:right;font-variant-numeric:tabular-nums}',
      '.mc-mem small{color:var(--text-tertiary);font-size:var(--font-size-2xs);margin-left:3px}',
      '.mc-vrow{display:grid;grid-template-columns:auto 1fr;gap:8px;font-size:var(--font-size-2xs)}',
      '.mc-vrow em{font-style:normal;color:var(--text-tertiary);font-variant-numeric:tabular-nums}',
      '.mc-foot{font-size:var(--font-size-2xs);color:var(--text-tertiary);line-height:1.6}',
      '.mc-thead{display:flex;align-items:center;gap:8px}',
      '.mc-thead .btn{margin-left:auto;min-height:30px;padding:0 12px;background:var(--dash-paper)}',
      '.mc-thead .btn[aria-pressed="true"]{background:var(--text-primary);color:var(--dash-paper);',
      'border-color:var(--text-primary)}',
      '.mc-pick{border:0;background:none;padding:0;font:inherit;font-weight:700;color:inherit;cursor:pointer;',
      'text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-row.sel{box-shadow:inset 3px 0 0 var(--accent);padding-left:8px}',
      '.mc-term{background:var(--dash-term);color:var(--dash-term-ink);font:12.5px/1.75 var(--font-mono);',
      'padding:14px 16px;overflow:auto;min-height:260px;flex:1;white-space:pre-wrap;word-break:break-all}',
      '@media(min-width:900px){.mc-term{min-height:120px}}',
      '.mc-term .dim{color:var(--dash-term-dim)}',
      '.mc-tbl{width:100%;border-collapse:collapse;font-size:var(--font-size-xs)}',
      '.mc-tbl th{font-weight:700;color:var(--text-tertiary);text-align:left;padding:6px 0;',
      'border-bottom:1px solid var(--border)}',
      '.mc-tbl td{padding:7px 0;border-bottom:1px solid var(--pl-line2);font:15px var(--font-display);',
      'font-variant-numeric:tabular-nums}',
      '.mc-tbl td:first-child{color:var(--text-secondary)}',
    ].join('');
    document.head.appendChild(el);
  }

  /* ── 값 다듬기 ── */

  function numOf(v: unknown): number | null {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  /** laptop-ops 는 모르는 값을 -1 로 준다. 음수는 없는 값 */
  function known(v: unknown): number | null {
    const n = numOf(v);
    return n === null || n < 0 ? null : n;
  }
  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }
  function num1(n: number): string {
    return String(Math.round(n * 10) / 10);
  }
  function comma(n: number): string {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  /** 시각 글자를 ms 로. 시간대가 없으면 KST 로 읽는다 (laptop-ops bootUp 은 기계 지역시) */
  function timeMs(iso: string): number {
    if (!iso) return NaN;
    const zoned = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + '+09:00';
    return Date.parse(zoned);
  }
  function agoText(ms: number): string {
    const gap = Date.now() - ms;
    if (!isFinite(gap)) return '';
    if (gap < 60000) return '방금';
    const min = Math.floor(gap / 60000);
    if (min < 60) return min + '분 전';
    const hour = Math.floor(min / 60);
    if (hour < 24) return hour + '시간 전';
    return Math.floor(hour / 24) + '일 전';
  }
  function spanText(ms: number): string {
    const min = Math.floor(ms / 60000);
    if (min < 60) return Math.max(min, 0) + '분';
    const hour = Math.floor(min / 60);
    if (hour < 48) return hour + '시간';
    return Math.floor(hour / 24) + '일';
  }
  function kstKey(ms: number): string {
    return new Date(ms + KST_MS).toISOString().slice(0, 10);
  }
  function kindLabel(kind: string): string {
    if (kind === 'unexplained') return '설명 안 되는 메모리';
    if (kind === 'nonpaged') return '비페이지 풀';
    if (kind === 'lowfree') return '여유 메모리';
    if (kind === 'commit') return '커밋';
    return kind;
  }

  /** `12th Gen Intel(R) Core(TM) i9-12900F` 를 `i9-12900F` 로. 줄일 것이 없으면 그대로 */
  function cpuName(name: string): string {
    const s = name
      .replace(/\((R|TM)\)/gi, '')
      .replace(/\b\d+(st|nd|rd|th) Gen\b/i, '')
      .replace(/\bIntel\s+Core\b/i, '')
      .replace(/\bCPU\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s || name;
  }
  function gpuName(name: string): string {
    const s = name.replace(/\((R|TM)\)/gi, '').replace(/^(NVIDIA\s+GeForce|NVIDIA|Intel|AMD)\s+/i, '').trim();
    return s || name;
  }

  /* ── 기계 하나를 지금 어떻게 보이나 ── */

  type Look = {
    state: 'on' | 'off' | 'none' | 'wait';
    stateText: string;
    seen: string;
    cpu: number | null;
    ram: number | null;
    disk: number | null;
    diskUnit: '%' | 'GB';
    temp: number | null;
    /** 못 닿은 까닭. 상태 글자에 올리면 보인다 */
    why?: string;
  };

  function latestOf(m: Machine): Latest {
    return (m.summary && m.summary.data && m.summary.data.latest) || {};
  }
  function daysOf(m: Machine): Day[] {
    const d = m.summary && m.summary.data && m.summary.data.days;
    return Array.isArray(d) ? d.filter((x) => !!x) : [];
  }
  function verdictsOf(m: Machine): Verdict[] {
    const v = m.summary && m.summary.data && m.summary.data.verdicts;
    return Array.isArray(v) ? v.filter((x) => !!x) : [];
  }
  /** 시스템 드라이브 (C:) 가 있으면 그것, 없으면 가장 찬 것 */
  function mainDiskPct(v: Vitals): number | null {
    const disks = Array.isArray(v.disks) ? v.disks : [];
    const c = disks.filter((d) => /^c:?$/i.test(text(d.drive)))[0];
    if (c) return known(c.usedPct);
    let top: number | null = null;
    for (const d of disks) {
      const p = known(d.usedPct);
      if (p !== null && (top === null || p > top)) top = p;
    }
    return top;
  }

  function look(m: Machine): Look {
    const blank: Look = {
      state: 'none', stateText: '연결 안 됨', seen: '', cpu: null, ram: null, disk: null, diskUnit: '%', temp: null,
    };
    const latest = latestOf(m);
    const lastMs = timeMs(text(latest.at));
    if (m.live) {
      const v = m.now && m.now.vitals;
      if (v) {
        const boot = timeMs(text(v.bootUp));
        return {
          state: 'on',
          stateText: '켜짐',
          seen: isFinite(boot) ? '켜진 지 ' + spanText(Date.now() - boot) : '',
          cpu: known(v.cpuPct),
          ram: known(v.usedPct),
          disk: mainDiskPct(v),
          diskUnit: '%',
          temp: known(v.tempC),
        };
      }
      if (!m.nowTried) return { ...blank, state: 'wait', stateText: '확인 중' };
      return { ...blank, seen: isFinite(lastMs) ? '마지막 기록 ' + agoText(lastMs) : m.nowErr, why: m.nowErr };
    }
    if (!isFinite(lastMs)) return { ...blank, seen: '성능 기록 없음' };
    const disk = known(latest.diskFreeGb);
    if (Date.now() - lastMs <= FRESH_MS) {
      const up = known(latest.uptimeH);
      return {
        state: 'on',
        stateText: '켜짐',
        seen: up !== null ? '켜진 지 ' + spanText(up * 3600000) : '기록 ' + agoText(lastMs),
        cpu: known(latest.cpuPct),
        ram: known(latest.memUsedPct),
        disk,
        diskUnit: 'GB',
        temp: null,
      };
    }
    /* 꺼진 기계. 디스크 여유만 마지막 표본 그대로 (꺼져 있는 동안 안 바뀐다) */
    return { ...blank, state: 'off', stateText: '꺼짐', seen: '마지막 ' + agoText(lastMs), disk, diskUnit: 'GB' };
  }

  function specOf(m: Machine): Spec | null {
    return (m.now && m.now.spec) || m.spec;
  }

  /* ── 그리기 조각 ── */

  function stateHtml(lk: Look, inline: boolean): string {
    const dot = lk.state === 'on' ? '' : ' off';
    const why = lk.why ? ' title="' + esc(lk.why) + '"' : '';
    if (inline) {
      return (
        '<span class="mc-st"' + why + '><span class="mc-dot' + dot + '"></span>' + esc(lk.stateText) +
        (lk.seen ? '<span class="mc-seen">, ' + esc(lk.seen) + '</span>' : '') + '</span>'
      );
    }
    return (
      '<div class="mc-st"' + why + '><span class="mc-dot' + dot + '"></span>' + esc(lk.stateText) +
      '<br><span class="mc-seen">' + esc(lk.seen) + '</span></div>'
    );
  }

  function bigHtml(label: string, v: number | null, unit: string): string {
    const body = v === null ? '<div class="mc-big none">' + DASH + '</div>'
      : '<div class="mc-big">' + esc(comma(v)) + '<small>' + esc(unit) + '</small></div>';
    return '<div><span class="mc-lab">' + esc(label) + '</span>' + body + '</div>';
  }

  function numsHtml(lk: Look, cls: string): string {
    return (
      '<div class="' + cls + '">' +
      bigHtml('CPU', lk.cpu, '%') +
      bigHtml('RAM', lk.ram, '%') +
      bigHtml(lk.diskUnit === 'GB' ? '디스크 여유' : '디스크', lk.disk, lk.diskUnit) +
      bigHtml('온도', lk.temp, '°C') +
      '</div>'
    );
  }

  /** 최근 30일 (KST, 오늘 포함). 기록 없는 날도 자리를 차지한다. 꺼져 있던 구간이 선의 빈칸으로 보이게 */
  function axis(): string[] {
    const out: string[] = [];
    const now = Date.now();
    for (let i = DAYS - 1; i >= 0; i--) out.push(kstKey(now - i * DAY_MS));
    return out;
  }

  function series(m: Machine, pick: (d: Day) => number | null): Array<number | null> {
    const by: Record<string, number | null> = {};
    for (const d of daysOf(m)) {
      const k = text(d.day);
      if (k) by[k] = pick(d);
    }
    return axis().map((k) => (k in by ? by[k] : null));
  }

  /** 0 에서 100 까지 고정 눈금. 빈 날은 선을 끊는다. 값이 하나도 없으면 빈 글자 */
  function lineSvg(vals: Array<number | null>, cls: string): string {
    const w = 300;
    const h = 60;
    const step = vals.length > 1 ? w / (vals.length - 1) : w;
    const segs: string[] = [];
    let cur: string[] = [];
    let any = false;
    vals.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segs.push(cur.join(' '));
        cur = [];
        return;
      }
      any = true;
      const x = i * step;
      const y = h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
      cur.push(x.toFixed(1) + ',' + y.toFixed(1));
    });
    if (cur.length) segs.push(cur.join(' '));
    if (!any) return '';
    const lines = segs
      .map((s) => {
        /* 점 하나뿐인 구간도 보이게 짧은 획으로 */
        const pts = s.indexOf(' ') < 0 ? s + ' ' + (parseFloat(s) + 2).toFixed(1) + ',' + s.split(',')[1] : s;
        return '<polyline points="' + pts + '"/>';
      })
      .join('');
    return (
      '<svg class="mc-ln ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '"/>' + lines + '</svg>'
    );
  }

  function trendHtml(m: Machine, which: 'cpu' | 'ram', tall: boolean): string {
    const vals = which === 'cpu' ? series(m, (d) => known(d.cpuPctAvg)) : series(m, (d) => known(d.memUsedPctAvg));
    const svg = lineSvg(vals, (which === 'ram' ? 'ram' : '') + (tall ? ' tall' : ''));
    return (
      '<span class="mc-lab">' + (which === 'cpu' ? 'CPU' : 'RAM') + ' 30일</span>' +
      (svg ? svg + '<div class="mc-axis"><span>30일 전</span><span>오늘</span></div>' : '<div class="mc-empty">30일 안에 기록 없음</div>')
    );
  }

  function diskText(s: Spec): string {
    const disks = Array.isArray(s.disks) ? s.disks : [];
    return disks
      .map((d) => {
        const size = numOf(d.sizeGb);
        return [text(d.media), size === null ? '' : comma(size) + 'GB'].filter(Boolean).join(' ') || text(d.name);
      })
      .filter(Boolean)
      .join(', ');
  }

  function specRows(s: Spec | null, full: boolean): Array<[string, string]> {
    if (!s) return [];
    const rows: Array<[string, string]> = [];
    const cpu = s.cpu || null;
    if (cpu && text(cpu.name)) {
      const cores = numOf(cpu.cores);
      const threads = numOf(cpu.threads);
      const extra = [cores !== null ? cores + '코어' : '', threads !== null ? threads + '스레드' : ''].filter(Boolean).join(' ');
      rows.push(['CPU', cpuName(text(cpu.name)) + (extra ? ', ' + extra : '')]);
    }
    const ram = numOf(s.ramGb);
    if (ram !== null) rows.push(['RAM', num1(ram) + 'GB']);
    const gpus = Array.isArray(s.gpus) ? s.gpus.map((g) => gpuName(text(g))).filter(Boolean) : [];
    if (gpus.length) rows.push(['GPU', gpus.join(', ')]);
    const disks = diskText(s);
    if (disks) rows.push(['디스크', disks]);
    if (full) {
      if (text(s.board)) rows.push(['보드', text(s.board)]);
      if (text(s.model)) rows.push(['모델', text(s.model)]);
      if (text(s.os)) rows.push(['OS', text(s.os).replace(/^Microsoft\s+/i, '')]);
    }
    return rows;
  }

  function specHtml(m: Machine, full: boolean): string {
    const rows = specRows(specOf(m), full);
    if (!rows.length) return '<div class="mc-empty">사양 기록 없음</div>';
    return (
      '<dl class="mc-spec">' +
      rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
      '</dl>'
    );
  }

  /* ── 패널 ── */

  async function render(ctx: DashPanelCtx<DashRepoRead>): Promise<void> {
    ensureStyle();
    const { root, repo, status } = ctx;

    const machines: Machine[] = HOSTS.map((h) => ({
      ...h, summary: null, spec: null, notes: null, now: null, nowErr: '', nowTried: false,
    }));
    const byId = (id: string): Machine | null => machines.filter((m) => m.id === id)[0] || null;
    /* 로컬 dev 서버 칸 (옛 lab 서버 모니터). 자리만 비워 두고 DOM 은 local-servers.ts 가 그림 */
    const ls = createLocalServers({ isCurrent: ctx.isCurrent });

    /** 서비스 재시작. 첫 누름은 확인 대기, 같은 단추를 한 번 더 눌러야 보낸다 */
    const armed: Record<string, number> = {};
    const svcMsg: Record<string, { text: string; err: boolean }> = {};
    const busy: Record<string, boolean> = {};

    /** 상세의 로그 칸 */
    let logSvc = '';
    let logLines: string[] = [];
    let logNote = '';
    let logTimer = 0;
    let following = false;

    /** 지금 상세로 보는 기계. 주소 `#machines/<host>` 에서 읽는다 */
    function hostFromUrl(): string {
      try {
        const h = decodeURIComponent(location.hash.replace(/^#/, ''));
        const sub = h.split('/')[1] || '';
        return byId(sub) ? sub : '';
      } catch {
        return '';
      }
    }
    function setUrl(host: string): void {
      try {
        history.replaceState({}, '', location.pathname + '#machines' + (host ? '/' + encodeURIComponent(host) : ''));
      } catch {
        /* 주소를 못 고쳐도 화면은 바뀐다 */
      }
    }
    let detail = hostFromUrl();
    ls.setDetail(!!detail);

    /* ── laptop-ops 부르기 ── */

    async function callLaptop(path: string, method: 'GET' | 'POST'): Promise<Response> {
      const token = await ctx.ghToken();
      if (!token) throw new Error('로그인이 풀림');
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), FETCH_MS);
      try {
        return await fetch(LAPTOP + path, {
          method,
          headers: { authorization: 'Bearer ' + token },
          cache: 'no-store',
          signal: ac.signal,
        });
      } catch {
        throw new Error('노트북에 못 닿음');
      } finally {
        window.clearTimeout(timer);
      }
    }

    function failText(res: Response): string {
      if (res.status === 401 || res.status === 403) return '본인 확인 거절 (' + res.status + ')';
      return '노트북이 ' + res.status + ' 를 줌';
    }

    function parseLive(raw: unknown): Live {
      const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const v = o.vitals && typeof o.vitals === 'object' ? (o.vitals as Vitals) : null;
      const list = Array.isArray(o.services) ? o.services : [];
      const services: Service[] = [];
      for (const s of list) {
        const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        const name = text(r.name);
        if (!name) continue;
        const st = text(r.state);
        services.push({
          name,
          state: st === 'running' || st === 'stopped' || st === 'paused' ? st : 'unknown',
        });
      }
      const spec = o.spec && typeof o.spec === 'object' ? (o.spec as Spec) : null;
      return { at: text(o.at), vitals: v, services, spec };
    }

    async function pullLive(): Promise<void> {
      for (const m of machines) {
        if (!m.live) continue;
        try {
          const res = await callLaptop('/dash/machine', 'GET');
          if (!res.ok) throw new Error(failText(res));
          m.now = parseLive(await res.json());
          m.nowErr = '';
        } catch (e) {
          m.now = null;
          m.nowErr = e instanceof Error ? e.message : String(e);
        }
        m.nowTried = true;
      }
      if (!ctx.isCurrent()) return;
      paint();
    }

    async function restart(name: string): Promise<void> {
      busy[name] = true;
      svcMsg[name] = { text: '보내는 중', err: false };
      paint();
      try {
        const res = await callLaptop('/dash/service/' + encodeURIComponent(name) + '/restart', 'POST');
        if (res.ok) {
          svcMsg[name] = { text: '재시작함', err: false };
        } else {
          let why = '';
          try {
            const j = (await res.json()) as { error?: unknown; message?: unknown };
            why = text(j.error) || text(j.message);
          } catch {
            why = '';
          }
          svcMsg[name] = { text: why || failText(res), err: true };
        }
      } catch (e) {
        svcMsg[name] = { text: e instanceof Error ? e.message : String(e), err: true };
      }
      busy[name] = false;
      if (!ctx.isCurrent()) return;
      paint();
      /* 서비스가 다시 뜨는 데 몇 초. 그 뒤 상태를 한 번 더 읽는다 */
      window.setTimeout(() => {
        if (ctx.isCurrent()) void pullLive();
      }, 4000);
    }

    async function pullLog(): Promise<void> {
      if (!logSvc) return;
      const name = logSvc;
      try {
        const res = await callLaptop('/dash/service/' + encodeURIComponent(name) + '/log?lines=' + LOG_LINES, 'GET');
        if (!res.ok) throw new Error(failText(res));
        const j = (await res.json()) as { lines?: unknown; path?: unknown };
        if (name !== logSvc) return;
        logLines = Array.isArray(j.lines) ? j.lines.map((l) => text(l)) : [];
        logNote = text(j.path);
      } catch (e) {
        if (name !== logSvc) return;
        logLines = [];
        logNote = e instanceof Error ? e.message : String(e);
      }
      if (ctx.isCurrent()) paintLog();
    }

    function stopFollow(): void {
      following = false;
      if (logTimer) window.clearInterval(logTimer);
      logTimer = 0;
    }
    function startFollow(): void {
      stopFollow();
      following = true;
      logTimer = window.setInterval(() => {
        if (!ctx.isCurrent()) return stopFollow();
        if (!document.hidden) void pullLog();
      }, LOG_MS);
    }

    /* ── 화면 ── */

    function servicesOf(m: Machine): Service[] {
      return (m.now && m.now.services) || [];
    }

    function svcRowHtml(s: Service, pickable: boolean): string {
      const dot = s.state === 'running' ? '' : s.state === 'stopped' ? ' off' : ' warn';
      const msg = svcMsg[s.name];
      const isArmed = !!armed[s.name];
      const label = busy[s.name] ? '보내는 중' : isArmed ? '확인' : '재시작';
      const stateWord = s.state === 'running' ? '' : s.state === 'stopped' ? '멈춤' : s.state === 'paused' ? '일시 정지' : '모름';
      return (
        '<div class="mc-row' + (pickable && s.name === logSvc ? ' sel' : '') + '">' +
        '<span class="mc-dot' + dot + '"></span>' +
        (pickable
          ? '<button type="button" class="mc-pick" data-log="' + esc(s.name) + '" title="로그 보기">' + esc(s.name) + '</button>'
          : '<b>' + esc(s.name) + '</b>') +
        (stateWord ? '<span class="mc-msg">' + esc(stateWord) + '</span>' : '') +
        (msg ? '<span class="mc-msg' + (msg.err ? ' err' : '') + '">' + esc(msg.text) + '</span>' : '') +
        '<button type="button" class="btn' + (isArmed ? ' arm' : '') + '" data-restart="' + esc(s.name) + '"' +
        (busy[s.name] ? ' disabled' : '') + '>' + esc(label) + '</button>' +
        '</div>'
      );
    }

    function overviewHtml(): string {
      const cols = machines.map((m) => {
        const lk = look(m);
        const svcs = servicesOf(m);
        const svcBlock = m.live && svcs.length
          ? '<div class="mc-svc"><span class="mc-lab">서비스</span>' + svcs.map((s) => svcRowHtml(s, false)).join('') + '</div>'
          : '';
        return (
          '<section class="mc-paper mc-col' + (lk.state === 'off' || lk.state === 'none' ? ' mc-off' : '') + '"' +
          ' data-open="' + esc(m.id) + '" tabindex="0" role="button" aria-label="' + esc(m.id + ' 자세히') + '">' +
          '<div class="mc-top"><div><h2 class="mc-name">' + esc(m.id) + '</h2><span class="mc-lab">' + esc(m.role) + '</span></div>' +
          stateHtml(lk, false) + '</div>' +
          numsHtml(lk, 'mc-grid4') +
          '<div class="mc-trend">' + trendHtml(m, 'cpu', false) + '</div>' +
          svcBlock +
          (ls.owns(m.id) ? '<div data-ls-slot="overview"></div>' : '') +
          '<div class="mc-colspec">' + specHtml(m, false) + '</div>' +
          '</section>'
        );
      });
      return '<div class="mc-cols">' + cols.join('') + '</div>';
    }

    function memRows(m: Machine): { head: string; rows: Array<[string, string, string]> } {
      const v = m.now && m.now.vitals;
      const gbOf = (mb: number | null): string => (mb === null ? DASH : num1(mb / 1024));
      if (v) {
        const disks = Array.isArray(v.disks) ? v.disks : [];
        let free: number | null = null;
        for (const d of disks) {
          const f = known(d.freeMB);
          if (f !== null) free = (free || 0) + f;
        }
        const recv = known(v.netRecvKBs);
        const sent = known(v.netSentKBs);
        const net = recv === null && sent === null ? null : (recv || 0) + (sent || 0);
        const commit = known(v.commitMB);
        const limit = known(v.commitLimitMB);
        return {
          head: '지금',
          rows: [
            ['여유 메모리', gbOf(known(v.availMB)), 'GB'],
            ['설명 안 되는 메모리', gbOf(known(v.unexplainedMB)), 'GB'],
            ['비페이지 풀', gbOf(known(v.poolNonpagedMB)), 'GB'],
            ['커밋', commit === null ? DASH : gbOf(commit) + ' / ' + gbOf(limit), 'GB'],
            ['디스크 여유', free === null ? DASH : comma(free / 1024), 'GB'],
            ['네트워크', net === null ? DASH : comma(net), 'KB/s'],
          ],
        };
      }
      const latest = latestOf(m);
      const at = timeMs(text(latest.at));
      const unexpl = known(latest.memUnexplainedPct);
      const disk = known(latest.diskFreeGb);
      const net = known(latest.netKbps);
      return {
        head: isFinite(at) ? '마지막 표본 ' + agoText(at) : '기록 없음',
        rows: [
          ['여유 메모리', DASH, ''],
          ['설명 안 되는 메모리', unexpl === null ? DASH : num1(unexpl), '%'],
          ['비페이지 풀', DASH, ''],
          ['커밋', DASH, ''],
          ['디스크 여유', disk === null ? DASH : comma(disk), 'GB'],
          ['네트워크', net === null ? DASH : comma(net), 'KB/s'],
        ],
      };
    }

    function verdictHtml(m: Machine): string {
      const rows: string[] = [];
      const nowVerdict = text(m.now && m.now.vitals && m.now.vitals.verdict);
      if (nowVerdict) rows.push('<div class="mc-vrow"><em>지금</em><span>' + esc(nowVerdict) + '</span></div>');
      for (const v of verdictsOf(m).slice(-10).reverse()) {
        rows.push(
          '<div class="mc-vrow"><em>' + esc(text(v.day)) + '</em><span>' + esc(kindLabel(text(v.kind))) +
          (text(v.text) ? ', ' + esc(text(v.text)) : '') + '</span></div>'
        );
      }
      return '<span class="mc-lab">판정</span>' + (rows.length ? rows.join('') : '<div class="mc-empty">걸린 판정 없음</div>');
    }

    function dailyHtml(m: Machine): string {
      const days = daysOf(m).slice(-7).reverse();
      if (!days.length) return '<span class="mc-lab">일별</span><div class="mc-empty">기록 없음</div>';
      const verdictCount: Record<string, number> = {};
      for (const v of verdictsOf(m)) {
        const k = text(v.day);
        if (k) verdictCount[k] = (verdictCount[k] || 0) + 1;
      }
      const pct = (n: number | null): string => (n === null ? DASH : Math.round(n) + '%');
      return (
        '<span class="mc-lab">일별</span><table class="mc-tbl"><thead><tr><th>날짜</th><th>CPU</th><th>RAM</th><th>판정</th></tr></thead><tbody>' +
        days
          .map((d) => {
            const k = text(d.day);
            return (
              '<tr><td>' + esc(k.slice(5)) + '</td><td>' + esc(pct(known(d.cpuPctAvg))) + '</td><td>' +
              esc(pct(known(d.memUsedPctAvg))) + '</td><td>' + (verdictCount[k] || 0) + '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table>'
      );
    }

    function notesHtml(m: Machine): string {
      const n = m.notes;
      const cell = (v: unknown): string => {
        const s = text(v).trim();
        return s ? '<dd>' + esc(s) + '</dd>' : '<dd class="hint">' + DASH + '</dd>';
      };
      return (
        '<span class="mc-lab">메모</span>' +
        '<dl class="mc-spec"><dt>구입</dt>' + cell(n && n.purchase) + '<dt>보증</dt>' + cell(n && n.warranty) +
        '<dt>메모</dt>' + cell(n && n.memo) + '</dl>' +
        (n ? '' : '<div class="mc-foot">' + esc(MACHINES_DIR + '/' + m.id + '/notes.json') + ' 에 적기</div>')
      );
    }

    function basisHtml(m: Machine): string {
      const s = m.summary;
      const b: Basis = (s && (s.basis || (s.data && s.data.basis))) || {};
      const total = numOf(b.totalMB);
      if (total === null) return '';
      return '<div class="mc-foot">메모리 % 는 총량 ' + esc(num1(total / 1024)) + ' GB 기준</div>';
    }

    function detailHtml(m: Machine): string {
      const lk = look(m);
      const svcs = servicesOf(m);
      const hasSvc = m.live && svcs.length > 0;
      const hasLocal = !hasSvc && ls.owns(m.id);
      if (hasSvc && !svcs.some((s) => s.name === logSvc)) {
        logSvc = svcs[0].name;
        logLines = [];
        logNote = '';
      }
      const mem = memRows(m);
      const left =
        '<section class="mc-paper mc-c">' +
        '<div class="mc-head"><h2 class="mc-name">' + esc(m.id) + '</h2>' + stateHtml(lk, true) + '</div>' +
        '<span class="mc-lab">' + esc(m.role) + '</span>' +
        numsHtml(lk, 'mc-nums') +
        (hasSvc || hasLocal ? '<div class="mc-sec">' + trendHtml(m, 'cpu', false) + trendHtml(m, 'ram', false) + '</div>' : '') +
        '<div class="mc-sec"><span class="mc-lab">메모리, ' + esc(mem.head) + '</span><div class="mc-mem">' +
        mem.rows
          .map(([k, v, u]) => '<span>' + esc(k) + '</span><span>' + esc(v) + (v !== DASH && u ? '<small>' + esc(u) + '</small>' : '') + '</span>')
          .join('') +
        '</div>' + basisHtml(m) + '</div>' +
        '<div class="mc-sec">' + verdictHtml(m) + '</div>' +
        '</section>';
      const mid = hasSvc
        ? '<section class="mc-paper mc-c">' +
          '<div><span class="mc-lab">서비스</span>' + svcs.map((s) => svcRowHtml(s, true)).join('') + '</div>' +
          '<div class="mc-thead"><span class="mc-lab">' + esc(logSvc) + ' 로그</span>' +
          '<button type="button" class="btn" data-follow="1" aria-pressed="' + (following ? 'true' : 'false') + '">따라보기</button></div>' +
          '<div class="mc-term" data-logbox="1"></div>' +
          '</section>'
        : hasLocal
        ? '<section class="mc-paper mc-c" data-ls-slot="detail"></section>'
        : '<section class="mc-paper mc-c">' +
          '<div class="mc-sec" style="border:0;padding:0">' + trendHtml(m, 'cpu', true) + '</div>' +
          '<div class="mc-sec">' + trendHtml(m, 'ram', true) + '</div>' +
          '</section>';
      const right =
        '<section class="mc-paper mc-c">' +
        '<div><span class="mc-lab">사양</span></div>' + specHtml(m, true) +
        '<div class="mc-sec">' + notesHtml(m) + '</div>' +
        '<div class="mc-sec">' + dailyHtml(m) + '</div>' +
        '</section>';
      return (
        '<button type="button" class="mc-back" data-back="1">&lsaquo; 머신</button>' +
        '<div class="mc-dcols">' + left + mid + right + '</div>'
      );
    }

    function paintLog(): void {
      const box = root.querySelector('[data-logbox]') as HTMLElement | null;
      if (!box) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
      if (!logLines.length) {
        box.innerHTML = '<span class="dim">' + esc(logNote || '읽는 중') + '</span>';
      } else {
        box.textContent = logLines.join('\n');
      }
      if (logNote) box.title = logNote;
      if (atBottom || !following) box.scrollTop = box.scrollHeight;
    }

    function paintStatus(): void {
      const on = machines.filter((m) => look(m).state === 'on').length;
      status('켜짐 ' + on + ' / ' + machines.length);
    }

    let wrap: HTMLElement | null = null;
    function paint(): void {
      if (!ctx.isCurrent()) return;
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'mc';
        root.textContent = '';
        root.appendChild(wrap);
        wrap.addEventListener('click', onClick);
        wrap.addEventListener('keydown', onKey);
      }
      const m = detail ? byId(detail) : null;
      ls.beforeRepaint();
      if (m) {
        const box = wrap.querySelector('[data-logbox]') as HTMLElement | null;
        const keepScroll = box ? box.scrollTop : -1;
        wrap.innerHTML = detailHtml(m);
        paintLog();
        const again = wrap.querySelector('[data-logbox]') as HTMLElement | null;
        if (again && keepScroll >= 0 && !following) again.scrollTop = keepScroll;
      } else {
        wrap.innerHTML = overviewHtml();
      }
      ls.attach(wrap);
      paintStatus();
    }

    function openDetail(id: string): void {
      detail = id;
      setUrl(id);
      stopFollow();
      ls.setDetail(true);
      logSvc = '';
      logLines = [];
      logNote = '';
      paint();
      if (logSvc) void pullLog();
      window.scrollTo(0, 0);
    }
    function closeDetail(): void {
      detail = '';
      setUrl('');
      stopFollow();
      ls.setDetail(false);
      paint();
    }

    function onRestart(name: string): void {
      if (busy[name]) return;
      if (armed[name]) {
        window.clearTimeout(armed[name]);
        delete armed[name];
        void restart(name);
        return;
      }
      armed[name] = window.setTimeout(() => {
        delete armed[name];
        if (ctx.isCurrent()) paint();
      }, ARM_MS);
      delete svcMsg[name];
      paint();
    }

    function onClick(e: Event): void {
      const t = e.target as HTMLElement;
      const rs = t.closest('[data-restart]') as HTMLElement | null;
      if (rs) {
        e.stopPropagation();
        onRestart(rs.getAttribute('data-restart') || '');
        return;
      }
      if (t.closest('[data-back]')) {
        closeDetail();
        return;
      }
      const lg = t.closest('[data-log]') as HTMLElement | null;
      if (lg) {
        const name = lg.getAttribute('data-log') || '';
        if (name && name !== logSvc) {
          logSvc = name;
          logLines = [];
          logNote = '';
          paint();
          void pullLog();
        }
        return;
      }
      if (t.closest('[data-follow]')) {
        if (following) stopFollow();
        else {
          startFollow();
          void pullLog();
        }
        paint();
        return;
      }
      const card = t.closest('[data-open]') as HTMLElement | null;
      if (card) openDetail(card.getAttribute('data-open') || '');
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target as HTMLElement;
      if (t.matches('[data-open]')) {
        e.preventDefault();
        openDetail(t.getAttribute('data-open') || '');
      }
    }

    /* ── 받기 ── */

    root.innerHTML = '<div class="tool-status">저장소에서 받는 중...</div>';
    status('받는 중');

    /* 없는 파일은 없는 것. 한 파일 실패가 방 전체를 막지 않게 하나씩 */
    async function readOpt<T>(path: string, ref?: string): Promise<T | null> {
      try {
        return await repo.readJson<T>(path, ref ? { ref } : undefined);
      } catch (e) {
        const kind = (e as { kind?: string }).kind;
        if (kind === 'auth') throw e;
        return null;
      }
    }
    /* 폴더 목록을 먼저 본다. 없는 파일을 바로 읽으면 GitHub 404 가 콘솔에 빨간 줄로 남는다 (kit.ts tree 설명) */
    const dirNames = async (path: string, ref?: string): Promise<Set<string>> => {
      try {
        return new Set((await repo.list(path, ref ? { ref } : undefined)).map((e) => e.name));
      } catch (e) {
        if ((e as { kind?: string }).kind === 'auth') throw e;
        return new Set();
      }
    };
    /* 성능 요약은 수집기가 10분마다 올리는 브랜치가 먼저, 없는 기계만 main (옛 Mois2 손 생성본) */
    const [liveHosts, vitalsHosts, specHosts] = await Promise.all([
      dirNames(VITALS_DIR, VITALS_BRANCH),
      dirNames(VITALS_DIR),
      dirNames(MACHINES_DIR),
    ]);
    await Promise.all(
      machines.map(async (m) => {
        const files = specHosts.has(m.id) ? await dirNames(MACHINES_DIR + '/' + m.id) : new Set<string>();
        const summaryPath = VITALS_DIR + '/' + m.id + '/summary.json';
        const [summary, spec, notes] = await Promise.all([
          liveHosts.has(m.id)
            ? readOpt<Summary>(summaryPath, VITALS_BRANCH).then((s) =>
                s || !vitalsHosts.has(m.id) ? s : readOpt<Summary>(summaryPath)
              )
            : vitalsHosts.has(m.id)
              ? readOpt<Summary>(summaryPath)
              : null,
          files.has('spec.json') ? readOpt<Spec>(MACHINES_DIR + '/' + m.id + '/spec.json') : null,
          files.has('notes.json') ? readOpt<Notes>(MACHINES_DIR + '/' + m.id + '/notes.json') : null,
        ]);
        m.summary = summary;
        m.spec = spec;
        m.notes = notes;
      })
    );
    if (!ctx.isCurrent()) return;
    paint();
    if (detail) {
      /* 새로고침으로 상세에 바로 들어온 판. 로그는 서비스 목록이 온 뒤 */
      void pullLive().then(() => {
        if (ctx.isCurrent() && logSvc) void pullLog();
      });
    } else {
      void pullLive();
    }

    const liveTimer = window.setInterval(() => {
      if (!ctx.isCurrent() || document.hidden) return;
      void pullLive();
    }, LIVE_MS);
    ctx.onDispose(() => {
      window.clearInterval(liveTimer);
      stopFollow();
      ls.dispose();
      for (const k of Object.keys(armed)) window.clearTimeout(armed[k]);
    });
  }

  dashRegistry().register({
    id: 'machines',
    title: '머신',
    access: 'read',
    paths: [VITALS_DIR + '/<host>/summary.json', MACHINES_DIR + '/<host>/spec.json', MACHINES_DIR + '/<host>/notes.json'],
    render,
  });
})();

export {};
