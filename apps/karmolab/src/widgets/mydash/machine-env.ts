/**
 * 머신 방 상세의 "환경 변수" 칸. 그 기계 laptop-ops 의 `/dash/env` 호출
 *
 * 계약 정본: memo `systems/infrastructure-access.md` 의 기계 환경 변수 절, 서버는 memo `laptop-ops/src/routes/machine-env.ts`
 * - 값은 쓰기만. 화면에는 이름, 설정 여부, 시각만. 입력칸 값은 보낸 즉시 비움
 * - 머신 방의 1분 주기 innerHTML 다시 그리기 대비: 이 칸의 DOM 은 모듈 소유, 자리 (`data-env-slot`) 에 다시 붙임.
 *   치던 값과 포커스 유지 (local-servers.ts 와 같은 방식)
 */

import { esc } from './kit';

type EnvVar = { name: string; set: boolean; updatedAt: string | null };
type HostState = { vars: EnvVar[] | null; err: string; msg: Record<string, { text: string; err: boolean }> };

/** 기계별 laptop-ops 주소. 정본 memo `scripts/machines/registry.json` 의 ops.base */
const OPS_BASE: Record<string, string> = {
  Mois: 'https://mois1.mascari4615.com',
  Mois2: 'https://laptop.mascari4615.com',
  Mois3: 'https://mois3.mascari4615.com',
};
const FETCH_MS = 15000;
const ARM_MS = 4000;

export interface MachineEnv {
  /** 상세 화면에 넣을 자리 */
  slotHtml(): string;
  /** 다시 그리기 직전. 포커스 기억 */
  beforeRepaint(): void;
  /** 다시 그린 뒤. 자리가 있으면 붙이고 그 기계 목록을 받는다 */
  attach(wrap: HTMLElement, hostId: string): void;
}

function agoText(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '방금';
  if (min < 60) return min + '분 전';
  const h = Math.floor(min / 60);
  if (h < 48) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}

export function createMachineEnv(opts: { ghToken: () => Promise<string | null>; isCurrent: () => boolean }): MachineEnv {
  const node = document.createElement('div');
  node.className = 'mc-env';
  const hosts: Record<string, HostState> = {};
  const armed: Record<string, number> = {};
  let host = '';
  let focusName = '';
  let busy = false;

  const stateOf = (id: string): HostState => (hosts[id] ||= { vars: null, err: '', msg: {} });

  async function call(id: string, path: string, method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<Response> {
    const base = OPS_BASE[id];
    if (!base) throw new Error('이 기계 주소를 모름');
    const token = await opts.ghToken();
    if (!token) throw new Error('로그인이 풀림');
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_MS);
    try {
      return await fetch(base + '/dash/env' + path, {
        method,
        headers: body === undefined ? { authorization: 'Bearer ' + token } : { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: ac.signal,
      });
    } catch {
      throw new Error(id + ' 에 못 닿음');
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function why(res: Response): Promise<string> {
    if (res.status === 404) return '이 기계 laptop-ops 가 아직 이 기능이 없는 판';
    if (res.status === 401 || res.status === 403) {
      try {
        const j = (await res.json()) as { error?: unknown };
        if (typeof j.error === 'string' && j.error) return j.error + ' (' + res.status + ')';
      } catch {
        /* 본문 없음 */
      }
      return '본인 확인 거절 (' + res.status + ')';
    }
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string' && j.error) return j.error;
    } catch {
      /* 본문 없음 */
    }
    return res.status + ' 를 줌';
  }

  async function load(id: string): Promise<void> {
    const st = stateOf(id);
    try {
      const res = await call(id, '', 'GET');
      if (!res.ok) throw new Error(await why(res));
      const j = (await res.json()) as { vars?: unknown };
      st.vars = Array.isArray(j.vars)
        ? (j.vars as EnvVar[]).filter((v) => v && typeof v.name === 'string').map((v) => ({ name: v.name, set: !!v.set, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null }))
        : [];
      st.err = '';
    } catch (e) {
      st.vars = null;
      st.err = e instanceof Error ? e.message : String(e);
    }
    if (opts.isCurrent() && id === host) paint();
  }

  async function send(id: string, name: string, value: string | null): Promise<void> {
    const st = stateOf(id);
    busy = true;
    st.msg[name] = { text: value === null ? '지우는 중' : '보내는 중', err: false };
    paint();
    try {
      const res = await call(id, '/' + encodeURIComponent(name), value === null ? 'DELETE' : 'PUT', value === null ? undefined : { value });
      st.msg[name] = res.ok ? { text: value === null ? '지움' : '넣음', err: false } : { text: await why(res), err: true };
    } catch (e) {
      st.msg[name] = { text: e instanceof Error ? e.message : String(e), err: true };
    }
    busy = false;
    await load(id);
  }

  function rowHtml(v: EnvVar, st: HostState): string {
    const m = st.msg[v.name];
    const state = v.set ? '설정됨' + (v.updatedAt ? ', ' + agoText(v.updatedAt) : '') : '없음';
    const isArmed = !!armed[host + '/' + v.name];
    return (
      '<form class="mc-envrow" data-env-form="' + esc(v.name) + '" autocomplete="off">' +
      '<div class="mc-envhead"><b>' + esc(v.name) + '</b>' +
      '<span class="mc-msg' + (m && m.err ? ' err' : '') + '">' + esc(m ? m.text : state) + '</span></div>' +
      '<div class="mc-envin">' +
      '<input type="password" name="v" autocomplete="new-password" spellcheck="false" placeholder="새 값" aria-label="' + esc(v.name) + ' 새 값"' + (busy ? ' disabled' : '') + '>' +
      '<button type="submit" class="btn"' + (busy ? ' disabled' : '') + '>넣기</button>' +
      (v.set ? '<button type="button" class="btn' + (isArmed ? ' arm' : '') + '" data-env-del="' + esc(v.name) + '"' + (busy ? ' disabled' : '') + '>' + (isArmed ? '한 번 더' : '지우기') + '</button>' : '') +
      '</div></form>'
    );
  }

  function paint(): void {
    const st = stateOf(host);
    // 치던 값은 이름별로 살려 둔다. 다시 그려도 사라지지 않게
    const typed: Record<string, string> = {};
    node.querySelectorAll<HTMLFormElement>('[data-env-form]').forEach((f) => {
      const inp = f.elements.namedItem('v') as HTMLInputElement | null;
      if (inp && inp.value) typed[f.getAttribute('data-env-form') || ''] = inp.value;
    });
    const body = st.err
      ? '<span class="mc-msg err">' + esc(st.err) + '</span>'
      : st.vars === null
        ? '<span class="mc-msg">읽는 중</span>'
        : st.vars.length === 0
          ? '<span class="mc-msg">허용된 이름이 없음</span>'
          : st.vars.map((v) => rowHtml(v, st)).join('');
    node.innerHTML =
      '<span class="mc-lab">환경 변수 (기계 범위)</span>' + body +
      '<div class="mc-foot">값은 다시 볼 수 없고 설정 여부만 보인다. 이미 켜진 Unity 에디터는 재시작해야 새 값을 본다</div>';
    node.querySelectorAll<HTMLFormElement>('[data-env-form]').forEach((f) => {
      const name = f.getAttribute('data-env-form') || '';
      const inp = f.elements.namedItem('v') as HTMLInputElement | null;
      if (inp && typed[name]) inp.value = typed[name];
      if (inp && name === focusName && !busy) inp.focus();
    });
  }

  node.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = (e.target as HTMLElement).closest('[data-env-form]') as HTMLFormElement | null;
    if (!f || busy || !host) return;
    const name = f.getAttribute('data-env-form') || '';
    const inp = f.elements.namedItem('v') as HTMLInputElement | null;
    const value = inp ? inp.value : '';
    if (!value) return;
    if (inp) inp.value = '';
    void send(host, name, value);
  });
  node.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-env-del]') as HTMLElement | null;
    if (!b || busy || !host) return;
    e.stopPropagation();
    const name = b.getAttribute('data-env-del') || '';
    const key = host + '/' + name;
    if (armed[key]) {
      window.clearTimeout(armed[key]);
      delete armed[key];
      void send(host, name, null);
      return;
    }
    armed[key] = window.setTimeout(() => {
      delete armed[key];
      if (opts.isCurrent()) paint();
    }, ARM_MS);
    paint();
  });

  return {
    slotHtml(): string {
      return '<div class="mc-sec" data-env-slot="1"></div>';
    },
    beforeRepaint(): void {
      const a = document.activeElement as HTMLElement | null;
      const f = a && node.contains(a) ? (a.closest('[data-env-form]') as HTMLElement | null) : null;
      focusName = f ? f.getAttribute('data-env-form') || '' : '';
    },
    attach(wrap: HTMLElement, hostId: string): void {
      const slot = wrap.querySelector('[data-env-slot]');
      if (!slot) return;
      const changed = hostId !== host;
      if (changed) node.innerHTML = '';
      host = hostId;
      slot.appendChild(node);
      paint();
      focusName = '';
      if (changed || (!stateOf(hostId).vars && !stateOf(hostId).err)) void load(hostId);
    },
  };
}
