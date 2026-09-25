/**
 * 머신 방의 로컬 서버 (옛 KarmoLab 서버 모니터 카드). change.dash-machines MVP 2.
 *
 * 조작 길: 이 PC 의 KarmoLab 앱 (Tauri) 이 여는 `http://127.0.0.1:8766/dash/*`.
 * - 브라우저의 loopback 권한 창 한 번 (Local Network Access, Edge 153 실측)
 * - 첫 연결은 앱 창에서 사람이 허용해야 토큰이 나온다 (짝 맺기). 에이전트용 토큰은 여기 안 옴
 * - 토큰은 이 브라우저의 localStorage 에만. 다른 PC, 폰, 앱이 꺼진 판은 목록만 보이고 상태는 "모름"
 *
 * ★ 지어낸 상태 금지. 앱에 못 닿으면 점은 회색, 글자는 모름.
 * 목록 원본은 앱이 읽어 준 저장소의 `servermonitor-config.json`. 못 닿으면 이 번들에 구운 같은 파일.
 *
 * 머신 방 (`machines.ts`) 은 자리만 비워 둔다 (`data-ls-slot`). 그 자리의 DOM 은 여기서만 그림.
 * 1분마다 방 전체를 다시 그려도 입력 칸과 로그 스크롤이 안 날아가게.
 */
import { esc } from './kit';
import bundledConfig from '../../../data/servermonitor-config.json';

/* ── 자료 모양 ── */

type DevProfile = {
  id: string;
  label?: string;
  app?: string;
  script?: string;
  deployScript?: string;
  cwd?: string;
  program?: string;
  args?: string[];
  healthUrl?: string;
  npmInstall?: boolean;
};
type LocalMonitor = { id: string; title?: string; label?: string; subtitle?: string; url?: string };
type EnvFile = { id: string; label?: string; relPath: string; hint?: string };
type Config = { devProfiles?: DevProfile[]; localMonitors?: LocalMonitor[]; envFiles?: EnvFile[] };
type Tracked = { id: string; pid: number; alive: boolean };
type State = {
  repoRoot: string | null;
  config: Config | null;
  tracked: Tracked[];
  external: Record<string, number[]>;
  externalError: string | null;
  listening: Record<string, boolean>;
};
type Hello = { app: string; version: string; host: string; paired: boolean };

type Conn =
  | 'idle' /* 아직 안 봄 */
  | 'ask' /* 이 브라우저는 아직 연결 안 함. 버튼을 눌러야 물음 */
  | 'blocked' /* 브라우저 권한이 거절 */
  | 'noapp' /* 앱에 못 닿음 */
  | 'unpaired' /* 앱은 있음, 짝 없음 */
  | 'pairing'
  | 'on';

type RowState = 'on' | 'held' | 'port' | 'off' | 'unknown';
type Row = {
  id: string;
  label: string;
  sub: string;
  port: string;
  profile: DevProfile | null;
  state: RowState;
  pid: number | null;
  externalPids: number[];
};

export type LocalServers = {
  /** 이 기계 칸에 로컬 서버를 붙이나 */
  owns(machineId: string): boolean;
  /** 방이 innerHTML 을 새로 쓰기 직전. 입력 칸 포커스를 기억 */
  beforeRepaint(): void;
  /** 방이 innerHTML 을 새로 쓴 뒤. 빈 자리에 이쪽 DOM 을 옮겨 심음 */
  attach(wrap: HTMLElement): void;
  /** 상세에 들어감, 나감. 로그 따라보기를 멈추는 자리 */
  setDetail(open: boolean): void;
  dispose(): void;
};

const BASE = 'http://127.0.0.1:8766';
const STORE_KEY = 'karmo.dash.localdev.v1';
const STATE_MS = 10000;
const LOG_MS = 2000;
const LOG_TAIL = 200;
const FETCH_MS = 8000;
const PAIR_MS = 120000;
const ARM_MS = 4000;
const DEFAULT_HOST = 'Mois';
const OFF_HINT = '이 PC 에서 KarmoLab 앱이 켜져 있을 때만 조작';

const STYLE_ID = 'mydash-local-servers-style';
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  /* 색은 dash 토큰. 줄 모양은 머신 방의 mc-row 를 따름 */
  el.textContent = [
    '.ls{display:flex;flex-direction:column;min-height:0}',
    '.ls-ov{margin-bottom:12px}',
    '.ls-det{gap:12px;flex:1;min-height:0}',
    '.ls-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.ls-head .mc-lab{margin-right:auto}',
    '.ls .btn{min-height:30px;padding:0 12px;background:var(--dash-paper);white-space:nowrap}',
    '.ls .btn.arm{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}',
    '.ls .btn[aria-pressed="true"]{background:var(--text-primary);color:var(--dash-paper);border-color:var(--text-primary)}',
    '.ls .btn.dim{color:var(--text-tertiary)}',
    '.ls-row{display:flex;align-items:center;gap:10px;min-height:44px;border-top:1px solid var(--pl-line2);font-size:var(--font-size-xs)}',
    '.ls-row.sel{box-shadow:inset 3px 0 0 var(--accent);padding-left:8px}',
    '.ls-name{border:0;background:none;padding:0;font:inherit;font-weight:700;color:inherit;cursor:pointer;text-align:left;',
    'min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'b.ls-name{cursor:default}',
    '.ls-port{font:14px var(--font-display);color:var(--text-tertiary);font-variant-numeric:tabular-nums;min-width:40px}',
    '.ls-ov .ls-name{flex:1 1 auto}.ls-ov .ls-port{text-align:right}.ls-ov .btn{min-width:56px}',
    '.ls-sel{min-height:30px;border:1px solid var(--border);background:var(--dash-paper);color:var(--text-secondary);',
    'font:12.5px var(--font-mono);padding:0 6px;max-width:170px}',
    '.ls-held{font-size:var(--font-size-2xs);font-weight:700;color:var(--accent-ink);white-space:nowrap}',
    '.ls-msg{font-size:var(--font-size-2xs);color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.ls-msg.err{color:var(--error)}',
    '.ls-push{margin-left:auto}',
    '.ls-note{font-size:var(--font-size-2xs);color:var(--text-tertiary);line-height:1.6;padding:6px 0}',
    '.ls-note .btn{margin-top:6px}',
    '.ls-panel{border:1px solid var(--pl-line2);padding:10px 12px;display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-xs)}',
    '.ls-panel input[type=text],.ls-panel textarea,.ls-panel select{font:12.5px var(--font-mono);border:1px solid var(--border);',
    'background:var(--dash-paper);color:var(--text-primary);padding:6px 8px;min-width:0}',
    '.ls-panel textarea{min-height:160px;resize:vertical}',
    '.ls-line{display:flex;gap:8px;align-items:center}',
    '.ls-line>input,.ls-line>select{flex:1}',
    '.ls-term{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--dash-term)}',
    '.ls-term .mc-term{min-height:200px}',
    '.ls-in{display:flex;gap:8px;align-items:center;border-top:1px solid color-mix(in srgb,var(--dash-term-dim) 35%,transparent);padding:8px 16px;color:var(--dash-term-dim);',
    'font:12.5px var(--font-mono)}',
    '.ls-term .ls-in input{box-shadow:none;padding:0;flex:1;min-width:0;background:transparent;border:0;color:var(--dash-term-ink);font:inherit;outline:0}',
    '.ls-in input:disabled{color:var(--dash-term-dim)}',
    '.ls-in button{border:1px solid color-mix(in srgb,var(--dash-term-dim) 50%,transparent);background:transparent;color:var(--dash-term-ink);font:inherit;padding:2px 8px;cursor:pointer}',
    '.ls-in button:disabled{opacity:.5;cursor:default}',
  ].join('');
  document.head.appendChild(el);
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function portOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).port;
  } catch {
    return '';
  }
}

function loadStore(): { token: string } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const o = raw ? (JSON.parse(raw) as { token?: unknown }) : null;
    return o && typeof o.token === 'string' && o.token ? { token: o.token } : null;
  } catch {
    return null;
  }
}
function saveStore(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORE_KEY, JSON.stringify({ token }));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* 저장을 못 해도 이번 판은 계속 */
  }
}

/** loopback 권한 상태. 이름이 브라우저 판마다 다름 (145 부터 loopback-network, 전에는 local-network-access) */
async function loopbackPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
  const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (!perms || typeof perms.query !== 'function') return 'unknown';
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      const st = await perms.query({ name } as unknown as PermissionDescriptor);
      return st.state;
    } catch {
      /* 이 이름은 모르는 브라우저. 다음 이름 */
    }
  }
  return 'unknown';
}

/** 목록 한 벌. devProfiles 순서, 그 뒤에 프로필 없는 모니터 */
function rowsOf(cfg: Config, st: State | null): Row[] {
  const monitors = Array.isArray(cfg.localMonitors) ? cfg.localMonitors : [];
  const profiles = Array.isArray(cfg.devProfiles) ? cfg.devProfiles : [];
  const monById: Record<string, LocalMonitor> = {};
  for (const m of monitors) if (m && m.id) monById[m.id] = m;
  const out: Row[] = [];
  const add = (id: string, p: DevProfile | null, m: LocalMonitor | null): void => {
    const port = portOf(p ? p.healthUrl : undefined) || portOf(m ? m.url : undefined);
    const label = text(p && p.label) || text(m && (m.title || m.label)) || id;
    let state: RowState = 'unknown';
    let pid: number | null = null;
    let externalPids: number[] = [];
    if (st) {
      const tr = st.tracked.filter((t) => t.id === id)[0];
      externalPids = Array.isArray(st.external[id]) ? st.external[id] : [];
      const listening = port ? st.listening[port] === true : false;
      if (tr && tr.alive) {
        state = 'on';
        pid = tr.pid;
      } else if (externalPids.length) {
        state = 'held';
      } else if (listening) {
        state = 'port';
      } else {
        state = 'off';
      }
    }
    out.push({ id, label, sub: text(m && m.subtitle), port, profile: p, state, pid, externalPids });
  };
  const seen: Record<string, boolean> = {};
  for (const p of profiles) {
    if (!p || !p.id) continue;
    seen[p.id] = true;
    add(p.id, p, monById[p.id] || null);
  }
  for (const m of monitors) if (m && m.id && !seen[m.id]) add(m.id, null, m);
  return out;
}

/** 줄의 실행 고르기. 켜기 스크립트, deploy, npm i */
function choicesOf(p: DevProfile): Array<{ value: string; label: string }> {
  const main = p.script ? p.script : [p.program || '', ...(p.args || [])].join(' ').trim() || '켜기';
  const out = [{ value: 'run', label: main }];
  if (p.deployScript) out.push({ value: 'deploy', label: p.deployScript });
  if (p.npmInstall) out.push({ value: 'npm-install', label: 'npm i' });
  return out;
}

export function createLocalServers(opts: { isCurrent: () => boolean }): LocalServers {
  ensureStyle();

  let conn: Conn = 'idle';
  let why = '';
  let hello: Hello | null = null;
  let st: State | null = null;
  let lastSig = '';
  let token = (loadStore() || { token: '' }).token;
  let detail = false;
  let disposed = false;

  let selected = '';
  let logText = '';
  let logNote = '';
  let following = false;
  let logTimer = 0;
  let stateTimer = 0;

  const choice: Record<string, string> = {};
  const msg: Record<string, { text: string; err: boolean }> = {};
  const busy: Record<string, boolean> = {};
  const armed: Record<string, number> = {};

  let panel: '' | 'root' | 'env' = '';
  let rootDraft = '';
  let envPick = '';
  let envText = '';
  let envNote = '';
  let envLoaded = '';

  const ovNode = document.createElement('div');
  ovNode.className = 'ls ls-ov';
  const detNode = document.createElement('div');
  detNode.className = 'ls ls-det';
  /* 로그 칸과 stdin 칸은 한 번 만들고 계속 씀. 다시 그려도 스크롤과 입력이 남게 */
  const termBox = document.createElement('div');
  termBox.className = 'ls-term';
  const logBox = document.createElement('div');
  logBox.className = 'mc-term';
  logBox.setAttribute('role', 'log');
  const inForm = document.createElement('form');
  inForm.className = 'ls-in';
  inForm.innerHTML = '<span>&gt;</span><input type="text" spellcheck="false" autocomplete="off" aria-label="stdin 입력"><button type="submit">보내기</button>';
  termBox.appendChild(logBox);
  termBox.appendChild(inForm);
  const inInput = inForm.querySelector('input') as HTMLInputElement;
  const inBtn = inForm.querySelector('button') as HTMLButtonElement;

  /* ── 앱 부르기 ── */

  async function call(path: string, method: 'GET' | 'POST', body?: unknown, waitMs = FETCH_MS): Promise<{ status: number; data: unknown; error: string }> {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), waitMs);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = 'Bearer ' + token;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: ac.signal,
      });
      let j: { ok?: boolean; data?: unknown; error?: unknown } = {};
      try {
        j = (await res.json()) as typeof j;
      } catch {
        j = {};
      }
      return { status: res.status, data: j.data, error: text(j.error) };
    } catch {
      return { status: 0, data: null, error: '앱에 못 닿음' };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function parseState(raw: unknown): State {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const tracked = Array.isArray(o.tracked)
      ? (o.tracked as unknown[])
          .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
          .filter((t) => typeof t.id === 'string' && typeof t.pid === 'number')
          .map((t) => ({ id: t.id as string, pid: t.pid as number, alive: t.alive === true }))
      : [];
    const external: Record<string, number[]> = {};
    if (o.external && typeof o.external === 'object') {
      for (const [k, v] of Object.entries(o.external as Record<string, unknown>)) {
        if (Array.isArray(v)) external[k] = v.filter((n): n is number => typeof n === 'number');
      }
    }
    const listening: Record<string, boolean> = {};
    if (o.listening && typeof o.listening === 'object') {
      for (const [k, v] of Object.entries(o.listening as Record<string, unknown>)) listening[k] = v === true;
    }
    return {
      repoRoot: text(o.repoRoot) || null,
      config: o.config && typeof o.config === 'object' ? (o.config as Config) : null,
      tracked,
      external,
      externalError: text(o.externalError) || null,
      listening,
    };
  }

  async function sayHello(): Promise<boolean> {
    const r = await call('/dash/hello', 'GET');
    if (r.status !== 200 || !r.data) {
      hello = null;
      conn = 'noapp';
      why = r.error || 'KarmoLab 앱이 ' + r.status + ' 를 줌';
      return false;
    }
    const d = r.data as Record<string, unknown>;
    hello = { app: text(d.app), version: text(d.version), host: text(d.host), paired: d.paired === true };
    if (!hello.paired) {
      conn = 'unpaired';
      why = token ? '앱이 이 브라우저를 모름 (다시 연결 필요)' : '';
      return false;
    }
    conn = 'on';
    why = '';
    return true;
  }

  async function pullState(): Promise<void> {
    if (conn !== 'on') return;
    const r = await call('/dash/localdev/state', 'GET');
    if (r.status === 200) {
      /* 같은 답이면 안 그림. 입력 중인 칸의 포커스를 10초마다 뺏지 않게 */
      const sig = JSON.stringify(r.data);
      if (st && sig === lastSig) return;
      lastSig = sig;
      st = parseState(r.data);
    } else if (r.status === 401) {
      conn = 'unpaired';
      st = null;
      why = '앱이 이 브라우저를 모름 (다시 연결 필요)';
    } else {
      conn = 'noapp';
      st = null;
      why = r.error || '앱이 ' + r.status + ' 를 줌';
    }
    paint();
  }

  async function connect(auto: boolean): Promise<void> {
    if (!auto) {
      conn = 'pairing';
      why = '';
      paint();
    }
    const ok = await sayHello();
    if (!ok && conn === 'unpaired' && !auto) {
      conn = 'pairing';
      why = 'KarmoLab 앱 창에서 허용을 누르면 연결';
      paint();
      const r = await call('/dash/pair', 'POST', {}, PAIR_MS);
      if (r.status === 200 && r.data && typeof (r.data as { token?: unknown }).token === 'string') {
        token = (r.data as { token: string }).token;
        saveStore(token);
        await sayHello();
      } else {
        conn = r.status === 0 ? 'noapp' : 'unpaired';
        why = r.error || '연결 안 됨 (' + r.status + ')';
      }
    }
    if (!ok && conn === 'noapp' && !auto) {
      /* 권한 거절이면 fetch 가 곧바로 실패. 이름을 붙여 알려 줌 */
      if ((await loopbackPermission()) === 'denied') {
        conn = 'blocked';
        why = '';
      }
    }
    paint();
    if (conn === 'on') await pullState();
    schedule();
  }

  async function start(): Promise<void> {
    const perm = await loopbackPermission();
    if (disposed) return;
    if (perm === 'denied') {
      conn = 'blocked';
    } else if (token || perm === 'granted') {
      /* 이 브라우저가 한 번 연결했던 판. 권한 창 없이 조용히 닿음 */
      await connect(true);
      return;
    } else {
      /* 폰, 다른 PC 에서 권한 창을 먼저 띄우지 않게. 사람이 누를 때만 */
      conn = 'ask';
    }
    paint();
  }

  function schedule(): void {
    if (stateTimer) return;
    stateTimer = window.setInterval(() => {
      if (disposed || !opts.isCurrent()) return;
      if (document.hidden || conn !== 'on') return;
      void pullState();
    }, STATE_MS);
  }

  /* ── 동작 ── */

  function setMsg(id: string, t: string, err: boolean): void {
    msg[id] = { text: t, err };
  }

  async function act(row: Row, kind: string): Promise<void> {
    busy[row.id] = true;
    setMsg(row.id, kind === 'deploy' ? 'deploy 중' : kind === 'npm-install' ? 'npm i 중' : '보내는 중', false);
    paint();
    const path = '/dash/localdev/' + kind;
    const long = kind === 'deploy' || kind === 'npm-install';
    const r = await call(path, 'POST', { profile: row.id }, long ? 15 * 60000 : FETCH_MS * 2);
    busy[row.id] = false;
    if (r.status === 200) {
      const t =
        kind === 'start' ? '켬' : kind === 'stop' ? '끔' : kind === 'external-stop' ? '다른 프로세스 ' + String(r.data) + '개 끔' : text(r.data) || '끝남';
      setMsg(row.id, t, false);
    } else {
      setMsg(row.id, r.error || '실패 (' + r.status + ')', true);
    }
    paint();
    await pullState();
    if (selected === row.id) void pullLog();
    window.setTimeout(() => {
      if (!disposed && opts.isCurrent()) void pullState();
    }, 1500);
  }

  function onRowButton(row: Row, action: string): void {
    if (busy[row.id]) return;
    /* 남의 프로세스 끄기와 deploy 는 두 번 누름 */
    const risky = action === 'external-stop' || action === 'deploy';
    if (risky && !armed[row.id]) {
      armed[row.id] = window.setTimeout(() => {
        delete armed[row.id];
        paint();
      }, ARM_MS);
      delete msg[row.id];
      paint();
      return;
    }
    if (armed[row.id]) {
      window.clearTimeout(armed[row.id]);
      delete armed[row.id];
    }
    void act(row, action);
  }

  async function pullLog(): Promise<void> {
    if (!selected || conn !== 'on') return;
    const id = selected;
    const r = await call('/dash/localdev/log?profile=' + encodeURIComponent(id) + '&tail=' + LOG_TAIL, 'GET');
    if (id !== selected) return;
    if (r.status === 200) {
      logText = text((r.data as { log?: unknown }).log);
      logNote = logText ? '' : '로그 없음 (아직 안 켰거나 KarmoLab 밖에서 켬)';
    } else {
      logText = '';
      logNote = r.error || '로그 못 읽음 (' + r.status + ')';
    }
    paintLog();
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
      if (disposed || !opts.isCurrent()) return stopFollow();
      if (!document.hidden) void pullLog();
    }, LOG_MS);
  }

  async function loadEnv(rel: string): Promise<void> {
    envPick = rel;
    envNote = '읽는 중';
    envText = '';
    envLoaded = '';
    paint();
    const r = await call('/dash/env?path=' + encodeURIComponent(rel), 'GET');
    if (r.status === 200) {
      const d = r.data as { exists?: boolean; text?: unknown };
      envText = text(d.text);
      envLoaded = rel;
      envNote = d.exists ? '' : '아직 없는 파일. 저장하면 만듦';
    } else {
      envNote = r.error || '못 읽음 (' + r.status + ')';
    }
    paint();
  }

  async function saveEnv(): Promise<void> {
    if (!envPick || envLoaded !== envPick) return;
    envNote = '저장 중';
    paint();
    const r = await call('/dash/env', 'POST', { path: envPick, content: envText });
    envNote = r.status === 200 ? '저장함' : r.error || '저장 실패 (' + r.status + ')';
    paint();
  }

  async function saveRoot(): Promise<void> {
    const path = rootDraft.trim();
    if (!path) return;
    envNote = '';
    const r = await call('/dash/localdev/repo-root', 'POST', { path });
    rootDraft = '';
    if (r.status !== 200) setMsg('_root', r.error || '실패 (' + r.status + ')', true);
    else setMsg('_root', '바꿈', false);
    paint();
    await pullState();
  }

  async function unpair(): Promise<void> {
    await call('/dash/unpair', 'POST', {});
    token = '';
    saveStore(null);
    st = null;
    conn = 'unpaired';
    why = '';
    stopFollow();
    paint();
  }

  /* ── 그리기 ── */

  function config(): Config {
    return (st && st.config) || (bundledConfig as Config);
  }
  function rows(): Row[] {
    return rowsOf(config(), conn === 'on' ? st : null);
  }

  function dotHtml(s: RowState): string {
    const cls = s === 'on' ? '' : s === 'held' || s === 'port' ? ' warn' : ' off';
    return '<span class="mc-dot' + cls + '"' + (s === 'unknown' ? ' title="모름"' : '') + '></span>';
  }
  function stateWord(r: Row): string {
    if (r.state === 'unknown') return '모름';
    if (r.state === 'held') return '다른 프로세스 ' + r.externalPids.join(', ');
    if (r.state === 'port') return '포트 사용 중';
    return '';
  }

  function mainButton(r: Row, compact: boolean): string {
    if (conn !== 'on' || !r.profile) return '';
    const b = !!busy[r.id];
    const dis = b ? ' disabled' : '';
    const cls = (extra: string): string => 'btn' + (compact ? ' ls-push' : '') + extra;
    if (r.state === 'on') return '<button type="button" class="' + cls('') + '" data-ls-act="stop" data-ls-id="' + esc(r.id) + '"' + dis + '>끄기</button>';
    if (r.state === 'held') {
      const arm = !!armed[r.id];
      return '<button type="button" class="' + cls(arm ? ' arm' : '') + '" data-ls-act="external-stop" data-ls-id="' + esc(r.id) + '"' + dis + '>' + (arm ? '확인' : '끄기') + '</button>';
    }
    if (compact) {
      return '<button type="button" class="' + cls(' dim') + '" data-ls-act="start" data-ls-id="' + esc(r.id) + '"' + dis + '>켜기</button>';
    }
    const pick = choice[r.id] || 'run';
    if (pick === 'run') return '<button type="button" class="btn dim" data-ls-act="start" data-ls-id="' + esc(r.id) + '"' + dis + '>켜기</button>';
    const arm = pick === 'deploy' && !!armed[r.id];
    return '<button type="button" class="btn' + (arm ? ' arm' : '') + '" data-ls-act="' + esc(pick) + '" data-ls-id="' + esc(r.id) + '"' + dis + '>' + (arm ? '확인' : '실행') + '</button>';
  }

  function noteHtml(): string {
    if (conn === 'on') return '';
    let line = OFF_HINT;
    let btn = '';
    if (conn === 'ask') btn = '<button type="button" class="btn" data-ls-connect="1">이 PC 에 연결</button>';
    if (conn === 'unpaired') btn = '<button type="button" class="btn" data-ls-connect="1">연결</button>';
    if (conn === 'noapp') {
      line = OFF_HINT + '. 지금은 앱에 못 닿음';
      btn = '<button type="button" class="btn" data-ls-connect="1">다시 보기</button>';
    }
    if (conn === 'blocked') line = '브라우저가 이 PC 연결을 막음. 주소창 왼쪽 사이트 권한에서 로컬 네트워크 허용';
    if (conn === 'pairing') line = why || '연결 중';
    if (conn === 'idle') line = '확인 중';
    const extra = why && conn !== 'pairing' && why !== '앱에 못 닿음' ? '<br>' + esc(why) : '';
    return '<div class="ls-note">' + esc(line) + extra + (btn ? '<br>' + btn : '') + '</div>';
  }

  function paintOverview(): void {
    /* 개요는 포트가 있는 서버만. 설치 같은 한 번짜리 작업은 상세에서 */
    const list = rows().filter((r) => r.port);
    ovNode.innerHTML =
      '<span class="mc-lab">로컬 서버</span>' +
      (conn === 'on' ? '' : noteHtml()) +
      list
        .map(
          (r) =>
            '<div class="ls-row">' + dotHtml(r.state) + '<b class="ls-name" title="' + esc(r.sub) + '">' + esc(r.label) + '</b>' +
            (r.state === 'held' || r.state === 'port' ? '<span class="ls-held">' + esc(stateWord(r)) + '</span>' : '') +
            '<span class="ls-port">' + esc(r.port) + '</span>' + mainButton(r, true) +
            '</div>'
        )
        .join('');
  }

  function panelHtml(): string {
    if (conn !== 'on') return '';
    if (panel === 'root') {
      const m = msg._root;
      return (
        '<div class="ls-panel"><span class="mc-lab">저장소 루트</span>' +
        '<div class="ls-msg">' + esc((st && st.repoRoot) || '정하지 않음') + '</div>' +
        '<form class="ls-line" data-ls-form="root"><input type="text" name="root" placeholder="C:\\Users\\...\\Mascari4615.github.io" value="' + esc(rootDraft) + '">' +
        '<button type="submit" class="btn">바꾸기</button></form>' +
        (m ? '<div class="ls-msg' + (m.err ? ' err' : '') + '">' + esc(m.text) + '</div>' : '') +
        '</div>'
      );
    }
    if (panel === 'env') {
      const files = (Array.isArray(config().envFiles) ? config().envFiles! : []).filter((f) => f && f.relPath);
      if (!files.length) return '<div class="ls-panel"><div class="ls-msg">envFiles 가 비어 있음</div></div>';
      const cur = files.filter((f) => f.relPath === envPick)[0];
      return (
        '<div class="ls-panel"><div class="ls-line"><select data-ls-env-pick="1">' +
        '<option value="">파일 고르기</option>' +
        files.map((f) => '<option value="' + esc(f.relPath) + '"' + (f.relPath === envPick ? ' selected' : '') + '>' + esc(f.label || f.id) + '</option>').join('') +
        '</select><button type="button" class="btn" data-ls-env-save="1"' + (envLoaded && envLoaded === envPick ? '' : ' disabled') + '>저장</button></div>' +
        (cur ? '<div class="ls-msg" title="' + esc(cur.hint || '') + '">' + esc(cur.relPath) + '</div>' : '') +
        (envPick ? '<textarea data-ls-env-text="1" spellcheck="false" aria-label=".env 내용"></textarea>' : '') +
        (envNote ? '<div class="ls-msg">' + esc(envNote) + '</div>' : '') +
        '</div>'
      );
    }
    return '';
  }

  /** 다시 그리는 동안 입력 칸의 포커스와 커서를 붙들어 둠 */
  function keepFocus(fn: () => void): void {
    const restore = pendingFocus || captureFocus();
    pendingFocus = null;
    fn();
    restore();
  }
  let pendingFocus: (() => void) | null = null;
  function captureFocus(): () => void {
    const a = document.activeElement as HTMLElement | null;
    const key = a && detNode.contains(a)
      ? a === inInput ? 'stdin' : a.matches('[data-ls-env-text]') ? 'env' : a.matches('input[name="root"]') ? 'root' : ''
      : '';
    const pos = key && typeof (a as HTMLInputElement).selectionStart === 'number' ? (a as HTMLInputElement).selectionStart : null;
    return () => restoreFocus(key, pos);
  }
  function restoreFocus(key: string, pos: number | null): void {
    if (!key) return;
    const el = (key === 'stdin'
      ? inInput
      : detNode.querySelector(key === 'env' ? '[data-ls-env-text]' : 'input[name="root"]')) as HTMLInputElement | null;
    if (!el || el.disabled) return;
    el.focus();
    if (pos !== null) {
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* 커서를 못 옮기는 칸 */
      }
    }
  }

  function paintDetail(): void {
    keepFocus(paintDetailNow);
  }

  function paintDetailNow(): void {
    const list = rows();
    if (!list.some((r) => r.id === selected)) selected = (list.filter((r) => r.profile)[0] || list[0] || { id: '' }).id;
    const sel = list.filter((r) => r.id === selected)[0] || null;
    const on = conn === 'on';
    const head =
      '<div class="ls-head"><span class="mc-lab">로컬 서버' + (on && hello && hello.host ? ', ' + esc(hello.host) : '') + '</span>' +
      (on
        ? '<button type="button" class="btn" data-ls-panel="root" aria-pressed="' + (panel === 'root') + '">저장소 루트</button>' +
          '<button type="button" class="btn" data-ls-panel="env" aria-pressed="' + (panel === 'env') + '">.env 편집</button>' +
          '<button type="button" class="btn dim" data-ls-unpair="1" title="이 브라우저의 연결 토큰을 지움">연결 끊기</button>'
        : '') +
      '</div>';
    const rowHtml = (r: Row): string => {
      const m = msg[r.id];
      const choices = r.profile ? choicesOf(r.profile) : [];
      const pick = choice[r.id] || 'run';
      const select =
        r.profile && on && r.state !== 'on' && r.state !== 'held' && choices.length > 1
          ? '<select class="ls-sel" data-ls-choice="' + esc(r.id) + '" aria-label="실행할 것">' +
            choices.map((c) => '<option value="' + esc(c.value) + '"' + (c.value === pick ? ' selected' : '') + '>' + esc(c.label) + '</option>').join('') +
            '</select>'
          : r.profile
            ? '<span class="ls-sel" style="display:inline-flex;align-items:center">' + esc(choices[0] ? choices[0].label : '') + '</span>'
            : '';
      return (
        '<div class="ls-row' + (r.id === selected ? ' sel' : '') + '">' + dotHtml(r.state) +
        (r.profile
          ? '<button type="button" class="ls-name" data-ls-pick="' + esc(r.id) + '" title="' + esc(r.sub || '로그 보기') + '">' + esc(r.label) + '</button>'
          : '<b class="ls-name" title="' + esc(r.sub) + '">' + esc(r.label) + '</b>') +
        '<span class="ls-port">' + esc(r.port) + '</span>' + select +
        (m ? '<span class="ls-msg' + (m.err ? ' err' : '') + '" title="' + esc(m.text) + '">' + esc(m.text) + '</span>' : '') +
        '<span class="ls-push"></span>' +
        (stateWord(r) && r.state !== 'unknown' ? '<span class="ls-held">' + esc(stateWord(r)) + '</span>' : '') +
        (r.state === 'on' && r.pid !== null ? '<span class="ls-msg">pid ' + r.pid + '</span>' : '') +
        mainButton(r, false) +
        '</div>'
      );
    };
    detNode.innerHTML =
      head + panelHtml() +
      noteHtml() + '<div>' + list.map(rowHtml).join('') + '</div>' +
      (on && sel && sel.profile
        ? '<div class="ls-head"><span class="mc-lab">' + esc(sel.label) + ' 로그</span>' +
          '<button type="button" class="btn" data-ls-follow="1" aria-pressed="' + following + '">따라보기</button></div>' +
          '<div data-ls-term="1" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>'
        : '');
    const ta = detNode.querySelector('[data-ls-env-text]') as HTMLTextAreaElement | null;
    if (ta) ta.value = envText;
    const termSlot = detNode.querySelector('[data-ls-term]');
    if (termSlot) {
      termSlot.appendChild(termBox);
      const tracked = !!(sel && sel.state === 'on');
      inInput.disabled = !tracked;
      inBtn.disabled = !tracked;
      inInput.placeholder = tracked ? 'stdin 입력' : sel && sel.state === 'held' ? 'KarmoLab 밖에서 켠 것이라 stdin 못 보냄' : '켜진 뒤에 stdin';
    }
  }

  function paintLog(): void {
    const atBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 24;
    if (!logText) {
      logBox.innerHTML = '<span class="dim">' + esc(logNote || '읽는 중') + '</span>';
    } else {
      logBox.textContent = logText;
    }
    if (atBottom || following) logBox.scrollTop = logBox.scrollHeight;
  }

  function paint(): void {
    if (disposed) return;
    paintOverview();
    if (detail) paintDetail();
  }

  /* ── 이벤트. 방의 카드 열기로 새지 않게 여기서 멈춤 ── */

  function rowById(id: string): Row | null {
    return rows().filter((r) => r.id === id)[0] || null;
  }

  function onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const hit = t.closest('button, select, input, textarea, a, [data-ls-act]');
    if (hit) e.stopPropagation();
    const actEl = t.closest('[data-ls-act]') as HTMLElement | null;
    if (actEl) {
      const row = rowById(actEl.getAttribute('data-ls-id') || '');
      if (row) onRowButton(row, actEl.getAttribute('data-ls-act') || '');
      return;
    }
    if (t.closest('[data-ls-connect]')) {
      void connect(false);
      return;
    }
    if (t.closest('[data-ls-unpair]')) {
      void unpair();
      return;
    }
    const pn = t.closest('[data-ls-panel]') as HTMLElement | null;
    if (pn) {
      const which = pn.getAttribute('data-ls-panel') as 'root' | 'env';
      panel = panel === which ? '' : which;
      paint();
      return;
    }
    if (t.closest('[data-ls-env-save]')) {
      void saveEnv();
      return;
    }
    const pk = t.closest('[data-ls-pick]') as HTMLElement | null;
    if (pk) {
      const id = pk.getAttribute('data-ls-pick') || '';
      if (id && id !== selected) {
        selected = id;
        logText = '';
        logNote = '';
        paint();
        paintLog();
        void pullLog();
      }
      return;
    }
    if (t.closest('[data-ls-follow]')) {
      if (following) stopFollow();
      else {
        startFollow();
        void pullLog();
      }
      paint();
    }
  }

  function onChange(e: Event): void {
    const t = e.target as HTMLElement;
    const ch = t.closest('[data-ls-choice]') as HTMLSelectElement | null;
    if (ch) {
      choice[ch.getAttribute('data-ls-choice') || ''] = ch.value;
      paint();
      return;
    }
    const ep = t.closest('[data-ls-env-pick]') as HTMLSelectElement | null;
    if (ep) {
      if (ep.value) void loadEnv(ep.value);
      else {
        envPick = '';
        paint();
      }
    }
  }

  function onInput(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.matches('[data-ls-env-text]')) envText = (t as HTMLTextAreaElement).value;
    if (t.matches('input[name="root"]')) rootDraft = (t as HTMLInputElement).value;
  }

  function onSubmit(e: Event): void {
    const f = e.target as HTMLElement;
    e.preventDefault();
    e.stopPropagation();
    if (f === inForm) {
      const value = inInput.value;
      const id = selected;
      if (!id) return;
      inInput.value = '';
      void call('/dash/localdev/stdin', 'POST', { profile: id, text: value }).then((r) => {
        if (r.status !== 200) setMsg(id, r.error || 'stdin 실패', true);
        paint();
        void pullLog();
      });
      return;
    }
    if (f.getAttribute('data-ls-form') === 'root') void saveRoot();
  }

  for (const node of [ovNode, detNode]) {
    node.addEventListener('click', onClick);
    node.addEventListener('keydown', (e) => {
      /* 줄 안의 Enter, 스페이스가 카드 열기로 새지 않게 */
      const t = e.target as HTMLElement;
      if (t.closest('button, select, input, textarea')) e.stopPropagation();
    });
    node.addEventListener('change', onChange);
    node.addEventListener('input', onInput);
    node.addEventListener('submit', onSubmit);
  }
  inForm.addEventListener('submit', onSubmit);

  void start();

  return {
    owns(machineId: string): boolean {
      const host = conn === 'on' && hello && hello.host ? hello.host : '';
      if (!host) return machineId === DEFAULT_HOST;
      const known = ['Mois', 'Mois2', 'Mois3'].some((id) => id.toLowerCase() === host.toLowerCase());
      if (!known) return machineId === DEFAULT_HOST;
      return machineId.toLowerCase() === host.toLowerCase();
    },
    beforeRepaint(): void {
      if (!pendingFocus) pendingFocus = captureFocus();
    },
    attach(wrap: HTMLElement): void {
      if (disposed) return;
      const ov = wrap.querySelector('[data-ls-slot="overview"]');
      if (ov) {
        paintOverview();
        ov.appendChild(ovNode);
      }
      const det = wrap.querySelector('[data-ls-slot="detail"]');
      if (det) {
        det.appendChild(detNode);
        paintDetail();
        paintLog();
        if (!logText && !logNote && selected && conn === 'on') void pullLog();
      }
    },
    setDetail(open: boolean): void {
      detail = open;
      if (!open) {
        stopFollow();
        panel = '';
      }
    },
    dispose(): void {
      disposed = true;
      stopFollow();
      if (stateTimer) window.clearInterval(stateTimer);
      stateTimer = 0;
      for (const k of Object.keys(armed)) window.clearTimeout(armed[k]);
    },
  };
}
