/**
 * 먹의 도킹 패널 (memo change.meok-app, 사용자 2026-09-25 "윈도우 시스템", 직접 만들기로 결정).
 *
 * - 패널은 `<details class="meok-panel" data-panel="id">`. 접기는 details 의 열림 그대로 (키보드, 낭독기 공짜)
 * - 칸은 `.meok-dock[data-dock="left|right"]` 둘. 패널 머리(summary)를 끌면 다른 칸이나 같은 칸 다른 자리로
 * - 칸 폭과 아래 타임라인 높이는 `.meok-split` 을 끌어서. 화살표 키로도
 * - 배치는 창(브라우저)마다 localStorage 에. 못 읽으면 기본 배치
 * - 미선택안: dockview-core (MIT, gzip 84KB), golden-layout (2023 이후 갱신 없음). 떼어 띄우기는 2차
 *
 * 이 파일은 그림 상태를 모름. 모양과 자리만
 */

type Side = 'left' | 'right';

interface DockState {
  v: 1;
  left: string[];
  right: string[];
  closed: Record<string, boolean>;
  hidden: Record<string, boolean>;
  dl: number;
  dr: number;
  tb: number;
}

const KEY = 'meok_dock_v1';
const LIMIT = { dl: [160, 520], dr: [200, 520], tb: [84, 420] } as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.max(lo, Math.min(hi, Math.round(v)));

function read(): Partial<DockState> | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch { return null; }
}

function write(state: DockState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 사생활 창, 막힌 저장소. 배치만 안 남음 */ }
}

export interface Dock {
  /** 기본 배치로 되돌림 (창 메뉴) */
  reset(): void;
  /** 패널 보이기 숨기기 (창 메뉴). 결과 보임 여부 */
  toggle(id: string): boolean;
  isShown(id: string): boolean;
  dispose(): void;
}

export function setupDock(root: HTMLElement, onLayout: () => void): Dock {
  const body = root.querySelector<HTMLElement>('.meok-body')!;
  const docks: Record<Side, HTMLElement> = {
    left: root.querySelector<HTMLElement>('.meok-dock[data-dock="left"]')!,
    right: root.querySelector<HTMLElement>('.meok-dock[data-dock="right"]')!,
  };
  const panels = new Map<string, HTMLDetailsElement>();
  root.querySelectorAll<HTMLDetailsElement>('details.meok-panel[data-panel]').forEach(p => panels.set(p.dataset.panel!, p));

  /* 기본 배치 = 마크업에 적힌 순서와 칸, 열림 */
  const defaults = (): DockState => {
    const pick = (side: Side) => [...docks[side].querySelectorAll<HTMLElement>('details.meok-panel')].map(p => p.dataset.panel!);
    const closed: Record<string, boolean> = {};
    panels.forEach((p, id) => { closed[id] = !p.hasAttribute('open'); });
    return { v: 1, left: pick('left'), right: pick('right'), closed, hidden: {}, dl: 220, dr: 272, tb: 150 };
  };
  const base = defaults();

  let state: DockState = (() => {
    const saved = read();
    if (!saved) return { ...base, closed: { ...base.closed } };
    /* 새로 생긴 패널은 기본 자리로, 사라진 패널 이름은 버림 */
    const known = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && panels.has(id)) : []);
    const left = known(saved.left);
    const right = known(saved.right);
    for (const id of panels.keys()) if (!left.includes(id) && !right.includes(id)) (base.left.includes(id) ? left : right).push(id);
    return {
      v: 1, left, right,
      closed: { ...base.closed, ...(saved.closed || {}) },
      hidden: { ...(saved.hidden || {}) },
      dl: clamp(Number(saved.dl) || base.dl, LIMIT.dl),
      dr: clamp(Number(saved.dr) || base.dr, LIMIT.dr),
      tb: clamp(Number(saved.tb) || base.tb, LIMIT.tb),
    };
  })();

  const apply = (): void => {
    for (const side of ['left', 'right'] as const) {
      for (const id of state[side]) {
        const p = panels.get(id);
        if (!p) continue;
        docks[side].append(p);
        p.open = !state.closed[id];
        p.hidden = !!state.hidden[id];
      }
    }
    const shownLeft = state.left.some(id => !state.hidden[id]);
    body.classList.toggle('meok-has-left', shownLeft);
    body.style.setProperty('--meok-dl', (shownLeft ? state.dl : 0) + 'px');
    body.style.setProperty('--meok-dr', state.dr + 'px');
    body.style.setProperty('--meok-tb', state.tb + 'px');
    onLayout();
  };

  const save = (): void => { write(state); };

  /* 접기 기억. 끌기 직후의 click 은 접기로 안 침 */
  let swallowClick = false;
  panels.forEach((p, id) => {
    p.addEventListener('toggle', () => { state.closed[id] = !p.open; save(); });
    const head = p.querySelector<HTMLElement>(':scope > summary')!;
    head.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); swallowClick = false; } });
    head.addEventListener('pointerdown', (e) => startDrag(e, id));
  });

  /* ── 패널 끌기 ── */
  const marker = document.createElement('div');
  marker.className = 'meok-drop-mark';
  function startDrag(e: PointerEvent, id: string): void {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    let target: { side: Side; index: number } | null = null;
    const move = (ev: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true;
        root.classList.add('meok-docking');
        panels.get(id)!.classList.add('meok-panel-moving');
        /* 빈 왼쪽 칸은 폭 0 이라 놓을 자리가 없음. 끄는 동안만 열어 둠 */
        if (!body.classList.contains('meok-has-left')) body.style.setProperty('--meok-dl', '140px');
      }
      target = null;
      marker.remove();
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const dock = under?.closest<HTMLElement>('.meok-dock');
      if (!dock || !root.contains(dock)) return;
      const side = dock.dataset.dock as Side;
      const list = [...dock.querySelectorAll<HTMLElement>('details.meok-panel:not([hidden])')].filter(p => p.dataset.panel !== id);
      let index = list.length;
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { index = i; break; }
      }
      target = { side, index };
      if (index < list.length) list[index].before(marker); else dock.append(marker);
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      marker.remove();
      root.classList.remove('meok-docking');
      panels.get(id)!.classList.remove('meok-panel-moving');
      if (!dragging) return;
      /* 놓은 자리가 머리 위면 click 이 한 번 옴. 안 오는 경우도 있어 잠깐 뒤 풀어 둠 */
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 60);
      if (!target) { apply(); return; }
      /* 목록에서 빼고 보이는 것 기준 자리에 다시 끼움 (숨긴 패널은 그 칸 끝에 남음) */
      state.left = state.left.filter(x => x !== id);
      state.right = state.right.filter(x => x !== id);
      const visible = state[target.side].filter(x => !state.hidden[x]);
      const before = visible[target.index];
      const list = state[target.side];
      const at = before ? list.indexOf(before) : list.length;
      list.splice(at, 0, id);
      save();
      apply();
    };
    /* 첫 움직임에 머리 밖으로 나가도 받도록 문서에서 */
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  /* ── 칸 경계 끌기 ── */
  root.querySelectorAll<HTMLElement>('.meok-split').forEach(split => {
    const which = split.dataset.split as 'left' | 'right' | 'bottom';
    const keyOf = which === 'left' ? 'dl' : which === 'right' ? 'dr' : 'tb';
    const nudge = (delta: number): void => {
      state[keyOf] = clamp(state[keyOf] + delta, LIMIT[keyOf]);
      save();
      apply();
    };
    split.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      split.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, v: state[keyOf] };
      /* 셸 배율(html zoom) 아래에서도 손 움직임과 같게 */
      const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
      const move = (ev: PointerEvent): void => {
        const d = which === 'left' ? ev.clientX - start.x : which === 'right' ? start.x - ev.clientX : start.y - ev.clientY;
        state[keyOf] = clamp(start.v + d / z, LIMIT[keyOf]);
        apply();
      };
      const up = (): void => {
        split.removeEventListener('pointermove', move);
        split.removeEventListener('pointerup', up);
        save();
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
    });
    split.addEventListener('keydown', (e) => {
      const grow = which === 'bottom' ? 'ArrowUp' : which === 'left' ? 'ArrowRight' : 'ArrowLeft';
      const shrink = which === 'bottom' ? 'ArrowDown' : which === 'left' ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === grow) { e.preventDefault(); nudge(16); }
      if (e.key === shrink) { e.preventDefault(); nudge(-16); }
    });
  });

  apply();

  return {
    reset(): void {
      state = { ...base, closed: { ...base.closed }, hidden: {}, left: [...base.left], right: [...base.right] };
      save();
      apply();
    },
    toggle(id: string): boolean {
      if (!panels.has(id)) return false;
      state.hidden[id] = !state.hidden[id];
      save();
      apply();
      return !state.hidden[id];
    },
    isShown(id: string): boolean { return panels.has(id) && !state.hidden[id]; },
    dispose(): void { marker.remove(); },
  };
}
