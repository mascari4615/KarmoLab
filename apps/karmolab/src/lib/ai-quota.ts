/**
 * AI 구독 할당량 카드 (내 AI 의 현황). lab 도구 `my-ai` 와 dash AI 사용 방의 구독 탭이 같이 씀.
 *
 * lab 전역 (`Toolbox`, `Mdd`) 과 Tauri 다리를 직접 부르지 않음. dash 는 `lib/` 만 싣는 장이라서
 * (audit:site-boundary). 데스크톱 앱은 부르는 쪽이 다리 (`isDesktop`, `invoke`) 를 넘기고,
 * 없으면 브라우저 길 (노트북 laptop-ops `/ai-quota/api`). 정본: memo/changes/ai-quota-phone.md
 */
import { t } from './i18n';

/** 데스크톱 앱의 Tauri 호출. 브라우저 (dash, 폰) 에서는 없음 */
export type DesktopBridge = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
let bridge: DesktopBridge | null = null;
const isDesktop = (): boolean => !!bridge;
function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!bridge) return Promise.reject(new Error('desktop-only'));
  return bridge.invoke<T>(cmd, args);
}

/** 스타일 한 벌을 한 번만 머리에 */
function ensureCss(id: string, css: string): void {
  const sid = 'css-' + id;
  if (document.getElementById(sid)) return;
  const el = document.createElement('style');
  el.id = sid;
  el.textContent = css;
  document.head.appendChild(el);
}

type QuotaWindow = {
  key: string;
  used_percent: number | null;
  resets_at: number | null;
};

type QuotaCount = {
  key: string;
  remaining: number;
};

type VendorQuota = {
  live: boolean;
  observed_at: number | null;
  plan: string | null;
  windows: QuotaWindow[];
  counts: QuotaCount[];
  last_rate_limited_at: number | null;
  notes: string[];
};

/** 카드 한 장 = 벤더 하나. 목록, 순서, 색은 전부 백엔드가 정한다. */
type VendorCard = {
  id: string;
  label: string;
  accent: string;
  quota: VendorQuota | null;
  error: string | null;
};

/** 라이브 카드만 의미가 있는 주기. 스냅샷은 다시 읽어도 그대로다. */
const AUTO_REFRESH_MS = 60_000;

/** 브라우저 소스. 노트북 laptop-ops 주소와 비밀번호 열쇠. */
const LAPTOP_BASE = 'https://laptop.mascari4615.com';
const KEY_AT = 'laptop.pc.key';
const savedKey = (): string => { try { return localStorage.getItem(KEY_AT) ?? ''; } catch { return ''; } };
const keepKey = (v: string): void => { try { localStorage.setItem(KEY_AT, v); } catch { /* 막힌 브라우저 */ } };
const dropKey = (): void => { try { localStorage.removeItem(KEY_AT); } catch { /* 막힌 브라우저 */ } };

/**
 * 같은 수치를 남음으로 볼지 사용으로 볼지는 사람마다 갈린다. 한쪽으로
 * 고정하면 나머지 한쪽은 매번 100에서 빼는 셈. 선택은 이 컴퓨터에 저장
 */
type MeterMode = 'left' | 'used';
const METER_MODE_KEY = 'karmolab_myai_meter_mode';

function readMeterMode(): MeterMode {
  try {
    return localStorage.getItem(METER_MODE_KEY) === 'used' ? 'used' : 'left';
  } catch {
    return 'left';
  }
}

let meterMode: MeterMode = readMeterMode();

function writeMeterMode(mode: MeterMode): void {
  meterMode = mode;
  try {
    localStorage.setItem(METER_MODE_KEY, mode);
  } catch {
    /* 저장 못 해도 이번 세션 동안은 바뀐 대로 본다. */
  }
}

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const nowSecs = (): number => Math.floor(Date.now() / 1000);

/** 창 key → 사람이 읽는 라벨. 백엔드가 모르는 창을 보내면 key 를 그대로 쓴다. */
function windowLabel(key: string): string {
  switch (key) {
    case 'five_hour':
      return t('my-ai.win.five_hour', undefined, '5시간');
    case 'seven_day':
      return t('my-ai.win.seven_day', undefined, '7일');
    case 'seven_day_opus':
      return t('my-ai.win.seven_day_opus', undefined, '7일, Opus');
    case 'seven_day_sonnet':
      return t('my-ai.win.seven_day_sonnet', undefined, '7일, Sonnet');
    case 'one_day':
      return t('my-ai.win.one_day', undefined, '1일');
    case 'primary':
      return t('my-ai.win.primary', undefined, '주 한도');
    case 'secondary':
      return t('my-ai.win.secondary', undefined, '보조 한도');
    default: {
      const m = /^minutes_(\d+)$/.exec(key);
      if (m) return t('my-ai.win.minutes', { n: m[1] }, `${m[1]}분 창`);
      return key;
    }
  }
}

/** 로그인으로 풀리는 실패 코드. */
function isLoginCode(code: string): boolean {
  return code === 'token-expired' || code === 'no-credentials' || code === 'no-oauth-block' || code === 'bad-credentials';
}

/** 스냅샷으로 강등된 카드는 error 대신 `why:<code>` 노트에 막힌 이유가 온다. */
function blockedBy(card: VendorCard): string | null {
  if (card.error) return card.error;
  const why = card.quota?.notes.find((n) => n.startsWith('why:'));
  return why ? why.slice(4) : null;
}

/** 카드에 로그인 버튼이 붙는 조건. 죽은 카드든 강등된 카드든 이유가 로그인이면. */
function needsLogin(card: VendorCard): boolean {
  const code = blockedBy(card);
  return code !== null && isLoginCode(code);
}

/** 백엔드가 주는 안정 코드 → 사용자가 뭘 해야 하는지. */
function errorText(code: string): string {
  if (code === 'token-expired')
    return t('my-ai.err.token_expired', undefined, '로그인이 만료됐다. 로그인을 누르면 터미널 창이 뜬다.');
  if (code === 'no-credentials' || code === 'no-oauth-block' || code === 'bad-credentials')
    return t('my-ai.err.no_credentials', undefined, '로그인 정보를 못 찾았다.');
  if (code === 'not-installed')
    return t('my-ai.err.not_installed', undefined, '이 컴퓨터에 설치돼 있지 않다.');
  if (code === 'no-sessions' || code === 'no-snapshot')
    return t('my-ai.err.no_snapshot', undefined, '최근 사용 기록이 없어 남은 양을 알 수 없다.');
  if (code === 'no-signal' || code === 'no-log')
    return t('my-ai.err.no_signal', undefined, '로그에 할당량 신호가 없다.');
  if (code.startsWith('http-'))
    return t('my-ai.err.http', { code }, `조회 실패 (${code})`);
  return code;
}

/** note 코드 → 왜 게이지가 없는지 한 줄. */
function noteText(code: string): string {
  if (code === 'live-failed')
    return t('my-ai.note.live_failed', undefined, '실시간 조회가 막혀서 로컬에 남은 마지막 기록을 보인다.');
  if (code === 'no-percent-api')
    return t('my-ai.note.no_percent_api', undefined, 'x.ai 에 잔량 조회 API 가 없어 퍼센트는 못 뽑는다. 아래는 로그에 남은 사실.');
  if (code.startsWith('why:'))
    return t('my-ai.note.why', { why: errorText(code.slice(4)) }, `막힌 이유: ${errorText(code.slice(4))}`);
  // 노트북이 직접 못 재고 다른 PC 가 밀어 둔 값. 어느 기계 것인지 표기
  if (code.startsWith('from:')) return t('my-ai.note.from', { host: code.slice(5) });
  return code;
}

/** 과거 시각 → 3시간 전. 신선도 칩의 전부다. */
export function ago(epoch: number): string {
  const diff = Math.max(0, nowSecs() - epoch);
  if (diff < 90) return t('my-ai.time.just_now', undefined, '방금');
  const mins = Math.round(diff / 60);
  if (mins < 60) return t('my-ai.time.min_ago', { n: mins }, `${mins}분 전`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('my-ai.time.hour_ago', { n: hours }, `${hours}시간 전`);
  const days = Math.round(hours / 24);
  return t('my-ai.time.day_ago', { n: days }, `${days}일 전`);
}

/** 미래 시각 → 3시간 12분 뒤. 이미 지났으면 곧 리셋. */
function until(epoch: number): string {
  const diff = epoch - nowSecs();
  if (diff <= 0) return t('my-ai.time.resetting', undefined, '리셋 대기');
  const mins = Math.floor(diff / 60);
  if (mins < 60) return t('my-ai.time.in_min', { n: mins }, `${mins}분 뒤`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest > 0
      ? t('my-ai.time.in_hour_min', { h: hours, m: rest }, `${hours}시간 ${rest}분 뒤`)
      : t('my-ai.time.in_hour', { n: hours }, `${hours}시간 뒤`);
  }
  const days = Math.floor(hours / 24);
  return t('my-ai.time.in_day', { n: days }, `${days}일 뒤`);
}

/** 미래 시각 → 오늘 14:00. 상대 표현만 두면 몇 시인지 사람이 암산해야 한다. */
function resetClock(epoch: number): string {
  const at = new Date(epoch * 1000);
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (dayKey(at) === dayKey(today)) return t('my-ai.time.at_today', { hm }, `오늘 ${hm}`);
  if (dayKey(at) === dayKey(tomorrow)) return t('my-ai.time.at_tomorrow', { hm }, `내일 ${hm}`);
  return t(
    'my-ai.time.at_date',
    { m: at.getMonth() + 1, d: at.getDate(), hm },
    `${at.getMonth() + 1}월 ${at.getDate()}일 ${hm}`
  );
}

/** 리셋 표기 = 남은 시간 + 실제 시각. 7일 뒤만으로는 언제 풀리는지 안 잡힌다. */
function resetHtml(epoch: number): string {
  const full = new Date(epoch * 1000).toLocaleString();
  const text = t(
    'my-ai.time.reset_at',
    { rel: until(epoch), clock: resetClock(epoch) },
    `${until(epoch)}, ${resetClock(epoch)}`
  );
  return `<span class="myai-reset" title="${esc(full)}">${esc(text)}</span>`;
}

/** 게이지 색. 아직 여유 / 슬슬 / 곧 벽. 수치를 색으로 한 번 더 말한다. */
function gaugeTone(percent: number): string {
  if (percent >= 85) return 'danger';
  if (percent >= 60) return 'warn';
  return 'ok';
}

function gaugeHtml(w: QuotaWindow): string {
  const label = esc(windowLabel(w.key));
  const reset = w.resets_at ? resetHtml(w.resets_at) : '';
  if (w.used_percent === null || !Number.isFinite(w.used_percent)) {
    return `
      <div class="myai-gauge">
        <div class="myai-gauge-head"><span>${label}</span>${reset}</div>
        <div class="myai-gauge-unknown">${esc(t('my-ai.t10', undefined, '수치 없음'))}</div>
      </div>`;
  }
  const used = Math.round(Math.max(0, Math.min(100, w.used_percent)) * 10) / 10;
  const left = Math.round((100 - used) * 10) / 10;
  const usedText = t('my-ai.t12', { n: used }, `${used}% 사용`);
  const leftText = t('my-ai.t11', { n: left }, `${left}% 남음`);
  // 색은 언제나 얼마나 썼나 기준. 막대가 남은 쪽을 채워도 위험도의 뜻은 그대로
  const tone = gaugeTone(used);
  const headline = meterMode === 'used' ? usedText : leftText;
  const footline = meterMode === 'used' ? leftText : usedText;
  const fill = meterMode === 'used' ? used : left;
  return `
    <div class="myai-gauge">
      <div class="myai-gauge-head">
        <span>${label}</span>
        <strong class="myai-left">${esc(headline)}</strong>
      </div>
      <div class="myai-bar" role="img" aria-label="${esc(usedText)}">
        <span class="myai-bar-fill myai-bar-fill--${tone}" style="width:${fill}%"></span>
      </div>
      <div class="myai-gauge-foot">
        <span>${esc(footline)}</span>${reset}
      </div>
    </div>`;
}

function countHtml(c: QuotaCount): string {
  const label =
    c.key === 'images'
      ? t('my-ai.count.images', undefined, '이미지 생성 남은 장수')
      : c.key;
  return `
    <div class="myai-count">
      <span class="myai-count-label">${esc(label)}</span>
      <strong class="myai-count-value">${esc(String(c.remaining))}</strong>
    </div>`;
}

function cardBodyHtml(data: VendorQuota): string {
  const parts: string[] = [];
  parts.push(...data.notes.map((n) => `<p class="myai-note">${esc(noteText(n))}</p>`));
  parts.push(...data.windows.map(gaugeHtml));
  parts.push(...data.counts.map(countHtml));
  if (data.last_rate_limited_at) {
    parts.push(
      `<p class="myai-wall">${esc(
        t('my-ai.t13', { when: ago(data.last_rate_limited_at) }, `마지막으로 한도에 막힌 때: ${ago(data.last_rate_limited_at)}`)
      )}</p>`
    );
  }
  if (parts.length === 0) {
    parts.push(`<p class="myai-note">${esc(t('my-ai.t14', undefined, '표시할 값이 없다.'))}</p>`);
  }
  return parts.join('');
}

function freshnessHtml(data: VendorQuota): string {
  if (data.live) {
    return `<span class="myai-chip myai-chip--live">${esc(t('my-ai.t15', undefined, '라이브'))}</span>`;
  }
  const when = data.observed_at ? ago(data.observed_at) : t('my-ai.t16', undefined, '시점 불명');
  return `<span class="myai-chip myai-chip--stale" title="${esc(
    t('my-ai.t17', undefined, '마지막으로 그 도구를 썼을 때 남아 있던 값이다. 지금 값은 이보다 적을 수 있다.')
  )}">${esc(t('my-ai.t18', { when }, `${when} 관측`))}</span>`;
}

function renderCard(card: VendorCard): string {
  const chips: string[] = [];
  if (card.quota) {
    if (card.quota.plan) {
      chips.push(`<span class="myai-chip myai-chip--plan">${esc(card.quota.plan)}</span>`);
    }
    chips.push(freshnessHtml(card.quota));
  }
  // 로그인 창은 이 컴퓨터의 터미널을 띄우는 것. 브라우저에서는 노트북 값이라 무의미
  const login =
    isDesktop() && card.id === 'claude' && needsLogin(card)
      ? `<button type="button" class="myai-login" data-claude-login>${esc(t('my-ai.login.button', undefined, '로그인'))}</button>`
      : '';
  const body = card.error
    ? `<p class="myai-error">${esc(errorText(card.error))}</p>${login}`
    : card.quota
      ? cardBodyHtml(card.quota) + login
      : `<p class="myai-note">${esc(t('my-ai.t19', undefined, '읽는 중...'))}</p>`;

  return `
    <section class="myai-card${card.error ? ' myai-card--error' : ''}" style="--myai-accent:${esc(card.accent)}">
      <header class="myai-card-head">
        <h3 class="myai-vendor">${esc(card.label)}</h3>
        <div class="myai-chips">${chips.join('')}</div>
      </header>
      <div class="myai-card-body${card.quota && !card.quota.live ? ' myai-card-body--stale' : ''}">${body}</div>
    </section>`;
}

export function buildQuota(container: HTMLElement, onDispose: (fn: () => void) => void, desktopBridge?: DesktopBridge): void {
  bridge = desktopBridge || null;
  ensureCss(
    'my-ai',
    `
    .myai-wrap { display: flex; flex-direction: column; gap: 14px; }
    .myai-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .myai-lede { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); flex: 1 1 240px; }
    .myai-actions { display: flex; align-items: center; gap: 8px; }
    /* 남음 ⟷ 사용 = 같은 수치의 다른 표현. 새로고침 옆에 붙여 보기 묶음으로 읽히게. */
    .myai-modes { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-pill); overflow: hidden; }
    .myai-mode { appearance: none; background: transparent; border: 0; color: var(--text-secondary); font-size: var(--font-size-2xs); padding: 4px 11px; min-height: 24px; cursor: pointer; }
    .myai-mode + .myai-mode { border-left: 1px solid var(--border); }
    .myai-login { appearance: none; margin-top: 6px; border: 1px solid var(--myai-accent); border-radius: var(--radius-pill); background: transparent; color: var(--myai-accent); font-size: var(--font-size-xs); padding: 5px 14px; cursor: pointer; }
    .myai-login:disabled { opacity: .5; cursor: default; }
    .myai-mode--on { background: var(--accent); color: var(--accent-fg); font-weight: 600; }
    .myai-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; align-items: start; }
    .myai-card { border: 1px solid var(--border); border-left: 4px solid var(--myai-accent); border-radius: var(--radius-md); background: var(--bg-secondary); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .myai-card--error { border-left-color: var(--text-tertiary); }
    .myai-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .myai-vendor { margin: 0; font-size: var(--font-size-md); font-weight: 700; letter-spacing: 0.01em; }
    .myai-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .myai-chip { font-size: var(--font-size-2xs); padding: 2px 7px; border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-secondary); white-space: nowrap; }
    .myai-chip--live { border-color: var(--success); color: var(--success); }
    .myai-chip--stale { border-style: dashed; cursor: help; }
    .myai-chip--plan { text-transform: uppercase; letter-spacing: 0.04em; }
    .myai-card-body { display: flex; flex-direction: column; gap: 12px; }
    /* 스냅샷은 라이브보다 흐리게. 먼저 눈에 띄는 쪽이 라이브 */
    .myai-card-body--stale { opacity: 0.82; }
    .myai-gauge { display: flex; flex-direction: column; gap: 5px; }
    .myai-gauge-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
    .myai-left { font-variant-numeric: tabular-nums; }
    .myai-bar { position: relative; height: 8px; border-radius: var(--radius-pill); background: var(--bg-tertiary); overflow: hidden; }
    .myai-bar-fill { position: absolute; inset: 0 auto 0 0; border-radius: var(--radius-pill); transition: width 0.3s ease; }
    .myai-bar-fill--ok { background: var(--success); }
    .myai-bar-fill--warn { background: var(--warning); }
    .myai-bar-fill--danger { background: var(--error); }
    .myai-gauge-foot { display: flex; justify-content: space-between; gap: 8px; font-size: var(--font-size-2xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
    .myai-gauge-unknown { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
    .myai-reset { font-size: var(--font-size-2xs); color: var(--text-tertiary); white-space: nowrap; }
    .myai-count { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
    .myai-count-value { font-size: var(--font-size-lg); font-variant-numeric: tabular-nums; }
    .myai-note, .myai-wall, .myai-error { margin: 0; font-size: var(--font-size-2xs); color: var(--text-tertiary); line-height: 1.5; }
    .myai-error { color: var(--error); }
    .myai-updated { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
    .myai-keyrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .myai-key { flex: 1 1 160px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font: inherit; }
    `
  );

  const wrap = document.createElement('div');
  wrap.className = 'myai-wrap';

  const top = document.createElement('div');
  top.className = 'myai-top';
  const lede = document.createElement('p');
  lede.className = 'myai-lede';
  lede.textContent = t('my-ai.t01', undefined, '구독별 남은 양. 실시간으로 물어보고, 막히면 마지막으로 그 도구를 썼을 때의 값을 보인다.');

  const actions = document.createElement('div');
  actions.className = 'myai-actions';

  // 보기 전환은 같은 수치의 다른 표현. 새로고침 없이 다시 그리기만
  const modeGroup = document.createElement('div');
  modeGroup.className = 'myai-modes';
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', t('my-ai.mode.group', undefined, '게이지 보기'));
  const modeButtons: Array<{ mode: MeterMode; el: HTMLButtonElement }> = (
    [
      { mode: 'left' as MeterMode, label: t('my-ai.mode.left', undefined, '남음') },
      { mode: 'used' as MeterMode, label: t('my-ai.mode.used', undefined, '사용') }
    ]
  ).map(({ mode, label }) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'myai-mode';
    el.textContent = label;
    modeGroup.appendChild(el);
    return { mode, el };
  });

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-secondary btn-sm';
  refreshBtn.textContent = t('my-ai.t02', undefined, '새로고침');
  actions.append(modeGroup, refreshBtn);
  top.append(lede, actions);

  const cards = document.createElement('div');
  cards.className = 'myai-cards';

  const updated = document.createElement('div');
  updated.className = 'myai-updated';

  wrap.append(top, cards, updated);
  container.appendChild(wrap);

  let cards_data: VendorCard[] = [];
  let fatal = '';

  /* ── 브라우저 소스. 노트북에 비밀번호로 묻는다 ──
     열쇠는 이 브라우저에만 보관 (my-ai 와 같은 저장 자리). 없으면 카드
     대신 입력 줄, 401 이면 열쇠 폐기 후 다시 질문 */
  const keyRow = document.createElement('div');
  keyRow.className = 'myai-keyrow';
  keyRow.hidden = true;
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.className = 'myai-key';
  keyInput.autocomplete = 'current-password';
  keyInput.placeholder = t('my-ai.key.placeholder');
  const keyBtn = document.createElement('button');
  keyBtn.type = 'button';
  keyBtn.className = 'btn btn-primary btn-sm';
  keyBtn.textContent = t('my-ai.key.show');
  const forgetBtn = document.createElement('button');
  forgetBtn.type = 'button';
  forgetBtn.className = 'btn btn-secondary btn-sm';
  forgetBtn.textContent = t('my-ai.key.forget');
  const keyWhy = document.createElement('span');
  keyWhy.className = 'myai-note';
  keyRow.append(keyInput, keyBtn, forgetBtn, keyWhy);
  wrap.insertBefore(keyRow, cards);

  function askKey(why: string): void {
    keyRow.hidden = false;
    keyWhy.textContent = why;
    // `.btn` 의 display 가 hidden 속성을 이기므로 style 로 숨김 (실측 2026-09-16)
    forgetBtn.style.display = savedKey() === '' ? 'none' : '';
  }

  async function loadFromLaptop(): Promise<VendorCard[]> {
    const key = savedKey() || keyInput.value.trim();
    if (!key) {
      askKey(t('my-ai.key.need'));
      return [];
    }
    const res = await fetch(`${LAPTOP_BASE}/ai-quota/api?k=${encodeURIComponent(key)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) {
      dropKey();
      askKey(t('my-ai.key.wrong'));
      return [];
    }
    if (!res.ok) throw new Error(`http-${res.status}`);
    const body = (await res.json()) as { ok?: boolean; cards?: VendorCard[] };
    if (body.ok !== true || !Array.isArray(body.cards)) throw new Error('bad-response');
    keepKey(key);
    keyRow.hidden = true;
    return body.cards;
  }

  const load = (): Promise<VendorCard[]> =>
    isDesktop() ? invoke<VendorCard[]>('ai_quota_all') : loadFromLaptop();

  keyBtn.addEventListener('click', () => {
    if (keyInput.value.trim() !== '') refresh();
  });
  keyInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') keyBtn.click();
  });
  forgetBtn.addEventListener('click', () => {
    dropKey();
    keyInput.value = '';
    cards_data = [];
    paint();
    askKey(t('my-ai.key.need'));
  });

  function syncModeButtons(): void {
    for (const { mode, el } of modeButtons) {
      const on = mode === meterMode;
      el.classList.toggle('myai-mode--on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function paint(): void {
    syncModeButtons();
    if (fatal) {
      cards.innerHTML = `<p class="myai-error">${esc(errorText(fatal))}</p>`;
      return;
    }
    cards.innerHTML = cards_data.map(renderCard).join('');
    cards.querySelector<HTMLButtonElement>('[data-claude-login]')?.addEventListener('click', startLogin);
  }

  /**
   * 로그인은 브라우저 OAuth, 사람이 끝냄. 창을 띄운 뒤 몇 초 간격 재조회,
   * 카드가 살아나면 정지. 3분 넘으면 60초 자동 갱신에 위임.
   */
  const LOGIN_POLL_MS = 5_000;
  const LOGIN_POLL_MAX = 36;
  let loginPoll = 0;
  let loginPollLeft = 0;

  function stopLoginPoll(): void {
    if (!loginPoll) return;
    window.clearInterval(loginPoll);
    loginPoll = 0;
  }

  function claudeStillLocked(): boolean {
    const claude = cards_data.find((c) => c.id === 'claude');
    return !!claude && needsLogin(claude);
  }

  function startLogin(ev: Event): void {
    const btn = ev.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    void invoke<void>('ai_quota_claude_login')
      .then(() => {
        updated.textContent = t('my-ai.login.opened', undefined, '터미널 창에서 로그인을 마치면 여기가 다시 읽는다.');
        stopLoginPoll();
        loginPollLeft = LOGIN_POLL_MAX;
        loginPoll = window.setInterval(() => {
          loginPollLeft -= 1;
          if (!claudeStillLocked() || loginPollLeft <= 0) {
            stopLoginPoll();
            return;
          }
          refresh();
        }, LOGIN_POLL_MS);
      })
      .catch((e: unknown) => {
        btn.disabled = false;
        const why = e instanceof Error ? e.message : String(e);
        updated.textContent = t('my-ai.login.failed', { why }, `로그인 창을 못 띄웠다 (${why})`);
      });
  }

  for (const { mode, el } of modeButtons) {
    el.addEventListener('click', () => {
      if (meterMode === mode) return;
      writeMeterMode(mode);
      paint();
    });
  }

  let inFlight = false;

  function refresh(): void {
    if (inFlight) return;
    inFlight = true;
    refreshBtn.disabled = true;
    void load()
      .then((list) => {
        cards_data = list;
        fatal = '';
      })
      .catch((e: unknown) => {
        fatal = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        inFlight = false;
        refreshBtn.disabled = false;
        paint();
        updated.textContent = cards_data.length ? t('my-ai.t04', undefined, '방금 읽음') : '';
      });
  }

  refreshBtn.addEventListener('click', refresh);
  paint();
  refresh();

  // 자동 갱신은 **보이는 동안만** 돈다. 숨은 탭에서 60초마다 깨우면 배터리만
  // 태운다(audit:hidden-tab). 돌아오면 곧바로 한 번 읽고 다시 건다: 숨어 있던
  // 사이에 5시간 창이 리셋됐을 수 있어 낡은 숫자를 그대로 두지 않음
  let timer = 0;
  function startTimer(): void {
    if (timer) return;
    timer = window.setInterval(refresh, AUTO_REFRESH_MS);
  }
  function stopTimer(): void {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  }
  function onVisibility(): void {
    if (document.hidden) {
      stopTimer();
      return;
    }
    refresh();
    startTimer();
  }
  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) startTimer();

  // 핫리로드로 위젯을 갈아 끼울 때 타이머, 리스너 쌓임 방지
  // (blog CLAUDE.md § KarmoLab 화면 작업).
  onDispose(() => {
    stopTimer();
    stopLoginPoll();
    document.removeEventListener('visibilitychange', onVisibility);
  });
}

