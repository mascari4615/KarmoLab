/**
 * 지뢰 찾기 화면 (TASK-KL-242)
 *
 * 깃발은 **길게 누르기**로 받는다. 폰에는 오른쪽 단추가 없다. 데스크톱에서는 오른쪽 단추도 받는다.
 * 숫자는 `nums` 에서 온다(지뢰는 손님에게 안 간다).
 */
import { escapeHtml } from '../../../lib/markdown/render';
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { SweepState, SweepAction } from './minesweeper';

const NUM_COLOR = ['', '#3b82f6', '#16a34a', '#ef4444', '#7c3aed', '#b45309', '#0891b2', '#334155', '#64748b'];

export const minesweeperView: GameView<SweepState, SweepAction> = {
  id: 'minesweeper',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-ms">' +
      '<div class="ac-msgrid" id="acMsGrid"></div>' +
      '<div class="ac-msbar" id="acMsBar"></div>' +
      '</div>';
    const grid = el.querySelector('#acMsGrid') as HTMLElement;
    const bar = el.querySelector('#acMsBar') as HTMLElement;
    /* 칸은 판 크기를 안 뒤에 만든다. 초급 9x9 와 중급 16x16 이 있음 */
    let cells: HTMLButtonElement[] = [];
    let builtW = 0;
    let tabCell = 0;
    const setTabCell = (index: number): void => {
      tabCell = index;
      cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; });
    };
    const build = (w: number, h: number): void => {
      grid.innerHTML = Array.from({ length: w * h }, (_, i) =>
        '<button class="ac-mc" data-c="' + i + '"></button>').join('');
      grid.style.setProperty('--w', String(w));
      grid.style.setProperty('--h', String(h));
      cells = Array.from(grid.querySelectorAll<HTMLButtonElement>('.ac-mc'));
      // 자판으로 어떻게 하는지 판 옆에 적어 둠. 숨은 조작은 없는 조작
      grid.setAttribute('aria-label', t('arcade.mine.kb'));
      grid.setAttribute('role', 'group');
      tabCell = 0;

      let hold = 0;
      let pressed: HTMLButtonElement | null = null;
      let pointer = -1;
      let longPress = false;
      let suppressContext: HTMLButtonElement | null = null;
      const cancel = (): void => {
        if (hold) clearTimeout(hold);
        hold = 0;
        pressed = null;
        pointer = -1;
        longPress = false;
      };
      cells.forEach((b) => {
        const c = Number(b.dataset.c);
        b.onfocus = (): void => { setTabCell(c); };
        b.onclick = (e): void => {
          // 포인터 없는 활성화만 처리, 실제 누름 뒤 click의 중복 입력 방지
          if (e.detail !== 0 || b.disabled || !b.isConnected) return;
          cancel();
          suppressContext = null;
          act({ cell: c });
        };
        b.oncontextmenu = (e): void => {
          e.preventDefault();
          if (suppressContext === b) { suppressContext = null; return; }
          cancel();
          if (b.disabled || !b.isConnected) return;
          act({ cell: c, flag: true });
        };
        b.onpointerdown = (e): void => {
          cancel();
          suppressContext = null;
          if (e.button !== 0 || b.disabled) return;
          pressed = b;
          pointer = e.pointerId;
          hold = window.setTimeout(() => {
            hold = 0;
            if (pressed !== b || b.disabled || !b.isConnected) return;
            longPress = true;
            suppressContext = b;
            act({ cell: c, flag: true });
          }, 450);
        };
        const cancelPointer = (e: PointerEvent): void => {
          if (pressed === b && pointer === e.pointerId) cancel();
        };
        b.onpointerleave = cancelPointer;
        b.onpointercancel = cancelPointer;
        /* 자판 길 (2026-08-14, `audit:mouse-only`). 칸은 원래 `<button>` 이라 초점은 갔는데,
         * 여는 일이 `pointerup` 에 달려 있어 **Enter 를 눌러도 아무 일도 안 났다**
         * (초점만 가고 못 노는 것이 제일 나쁘다. 될 것처럼 보인다).
         * 깃발은 길게 누르기, 오른쪽 버튼뿐이라 자판으로는 아예 못 꽂았다 → F / Shift+Enter. */
        b.onkeydown = (e: KeyboardEvent): void => {
          cancel();
          suppressContext = null;
          if (b.disabled) return;
          const rowStart = Math.floor(c / w) * w;
          let target = c;
          let step = 0;
          let min = 0;
          let max = cells.length - 1;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            step = e.key === 'ArrowLeft' ? -1 : 1;
            min = rowStart; max = rowStart + w - 1;
            target += step;
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            step = e.key === 'ArrowUp' ? -w : w;
            target += step;
          } else if (e.key === 'Home' || e.key === 'End') {
            step = e.key === 'Home' ? 1 : -1;
            min = rowStart; max = rowStart + w - 1;
            target = e.key === 'Home' ? min : max;
          }
          if (step) {
            e.preventDefault();
            while (target >= min && target <= max && cells[target].disabled) target += step;
            if (target >= min && target <= max) cells[target].focus();
            return;
          }
          if (e.key === 'f' || e.key === 'F' || (e.key === 'Enter' && e.shiftKey)) {
            e.preventDefault();
            if (e.repeat) return;
            act({ cell: c, flag: true });
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (e.repeat) return;
            act({ cell: c });
          }
        };
        b.onpointerup = (e): void => {
          if (e.button !== 0 || pressed !== b || pointer !== e.pointerId) return;
          const flagged = longPress;
          cancel();
          if (!flagged && !b.disabled && b.isConnected) act({ cell: c });
        };
      });
    };

    return (v, mySeat) => {
      const s = v.state;
      if (builtW !== s.w) { builtW = s.w; build(s.w, s.h); }
      const mine = s.seen[mySeat] ?? [];
      const dead = s.dead[mySeat];
      const focused = cells.indexOf(document.activeElement as HTMLButtonElement);

      cells.forEach((b, i) => {
        const st = mine[i] ?? 0;
        const n = s.nums[i] ?? -1;
        let face = '';
        if (st === 2) face = '⚑';
        else if (st === 1) face = n > 0 ? String(n) : '';
        b.textContent = face;
        b.className = 'ac-mc' + (st === 1 ? ' ac-open' : '') + (st === 2 ? ' ac-flag' : '');
        b.style.color = st === 1 && n > 0 ? NUM_COLOR[n] : '';
        b.disabled = dead || s.over || st === 1;
        const status = st === 2 ? t('arcade.mine.cell.flag') : st !== 1 ? t('arcade.mine.cell.closed') : n > 0 ? t('arcade.mine.cell.number', { n: String(n) }) : t('arcade.mine.cell.empty');
        b.setAttribute('aria-label', t('arcade.mine.cell', { row: String(Math.floor(i / s.w) + 1), col: String(i % s.w + 1), status }));
      });
      if (!cells[tabCell] || cells[tabCell].disabled) {
        const next = cells.findIndex((cell, i) => i >= tabCell && !cell.disabled);
        tabCell = next >= 0 ? next : cells.findIndex(cell => !cell.disabled);
      }
      setTabCell(tabCell);
      grid.tabIndex = tabCell < 0 ? 0 : -1;
      if (focused >= 0 && cells[focused].disabled) {
        if (tabCell >= 0) cells[tabCell].focus();
        else grid.focus();
      }

      bar.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.dead[i] ? ' ac-dead' : '') + '">' +
          escapeHtml(seat.name) + ' <b>' + (s.opened[i] ?? 0) + '</b></span>')
        .join('') + (dead ? '<span class="ac-dts">' + t('arcade.mine.dead') + '</span>' : '') +
        /* 계측. 판 난이도(3BV)와 내 클릭과 효율. 순위 사이트가 판 뒤에 보여 주는 셋 (2026-09-03) */
        '<span class="ac-dts ac-mstat">' + t('arcade.mine.stats', {
          b: String(s.bv3 ?? 0),
          c: String(s.clicks?.[mySeat] ?? 0),
          e: String(s.clicks?.[mySeat] ? Math.round(((s.bv3 ?? 0) / s.clicks[mySeat]) * 100) : 0)
        }) + '</span>';
    };
  }
};
