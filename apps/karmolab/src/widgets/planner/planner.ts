/**
 * 플래너. 구글 캘린더, 할 일, 연속일 (TASK-KL-321)
 *
 * 자리: dash 대시보드의 방 하나 (`dashRegistry` 의 `planner`). 2026-09-23 lab 도구에서 옮김
 * (사용자 "플래너로 합쳐줘. lab 에서 제거. dash 에 이관". 2026-09-13 "캘린더도 대시보드에 합친다" 의 마무리)
 *
 * 여기 있던 것은 원래 **React 앱을 불러다 붙이는 12줄**이었다. 화면 하나 때문에 React 19 +
 * Tailwind + 달력 라이브러리 두 벌이 따로 지어져 나갔고, 사용자 기록(`toolbox_user_data`)을
 * 본체와 섬이 **각자 다른 규칙으로** 만졌다. 섬을 걷어 내고 본체와 같은 자리로 가져왔다.
 *
 * 구성:
 *   gcal.ts         구글과 주고받기 + 모양 바꾸기 (순수 함수. 노드에서 시험한다)
 *   gauth.ts        연동 토큰 한 장
 *   calendar-view   달력 (FullCalendar 틀 없는 판)
 *   kanban-view     할 일 세 칸
 *   streaks-view    연속일, 레벨
 */
import { toast } from './toast';
import { t, loadNamespace } from '../../lib/i18n';
import { dashRegistry } from '../mydash/kit';
import type { DashPanelCtx } from '../mydash/kit';
import { GOOGLE_CLIENT_ID, ensureToken, forgetToken, requestToken, storedToken } from './gauth';
import { buildCalendarView, type CalendarViewHandle } from './calendar-view';
import { FOLLOWUPS_PATH, type Followup } from './followups';
import { buildKanbanView, type KanbanViewHandle } from './kanban-view';
import { buildStreaksView } from './streaks-view';
import { buildDiaryView, type DiaryViewHandle } from './diary-view';

(function (): void {
    const esc = (v: string): string =>
        v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const CSS = `
        .pl-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .pl-bar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 0 4px 10px; }
        .pl-bar-right { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-body { flex: 1; min-height: 0; display: flex; }
        .pl-pane { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: auto; }
        .pl-drawer { width: 340px; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--border); }
        .pl-drawer[hidden] { display: none; }
        .pl-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .pl-drawer-title { font-size: var(--font-size-sm); font-weight: 700; color: var(--text-primary); }
        .pl-drawer-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px; }
        .pl-drawer .pl-kanban-board { grid-template-columns: 1fr; }
        .pl-drawer .pl-diary { flex-direction: column; }
        .pl-drawer .pl-diary-side { width: 100%; max-height: 200px; }
        .pl-rail { width: 64px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 4px; padding: 12px 6px; border-left: 1px solid var(--border); }
        .pl-rail-btn { min-height: 44px; border: none; background: none; color: var(--text-secondary); font-size: var(--font-size-2xs); font-weight: 700; cursor: pointer; }
        .pl-rail-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .pl-rail-btn[aria-pressed="true"] { background: var(--text-primary); color: var(--bg-secondary); }

        .pl-gate { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; text-align: center; padding: 40px 16px; }
        .pl-gate-icon { font-size: 40px; }
        .pl-gate-title { margin: 0; font-size: var(--font-size-lg); color: var(--text-primary); }
        .pl-gate-desc { margin: 0; font-size: var(--font-size-sm); color: var(--text-tertiary); max-width: 420px; line-height: 1.6; }

        .pl-input { padding: 6px 10px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); }
        .pl-field { display: flex; flex-direction: column; gap: 4px; }
        .pl-label { font-size: var(--font-size-xs); color: var(--text-secondary); font-weight: 600; }
        .pl-check { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); color: var(--text-secondary); }

        /* 달력 */
        /* FullCalendar 를 이 사이트 옷으로 갈아입힌다. 라이브러리 기본색이 남으면 혼자 튄다.
           v6 는 색, 굵기를 전부 CSS 변수로 내주므로 우리 토큰만 이어 주면 된다. */
        .pl-cal-main {
            --fc-page-bg-color: transparent;
            --fc-border-color: var(--border);
            --fc-neutral-bg-color: var(--bg-secondary);
            --fc-neutral-text-color: var(--text-tertiary);
            --fc-today-bg-color: color-mix(in srgb, var(--accent) 10%, transparent);
            --fc-now-indicator-color: #ef4444;
            --fc-button-bg-color: var(--bg-secondary);
            --fc-button-border-color: var(--border);
            --fc-button-text-color: var(--text-secondary);
            --fc-button-hover-bg-color: var(--bg-tertiary);
            --fc-button-hover-border-color: var(--border);
            --fc-button-active-bg-color: var(--accent);
            --fc-button-active-border-color: var(--accent);
            --fc-small-font-size: var(--font-size-xs);
        }
        .pl-cal-main .fc { font-size: var(--font-size-sm); color: var(--text-primary); }
        .pl-cal-main .fc .fc-toolbar-title { font-size: var(--font-size-md); font-weight: 700; }
        .pl-cal-main .fc .fc-button { padding: 4px 10px; font-size: var(--font-size-xs); box-shadow: none; }
        /* 켜진 단추의 글씨색을 안 정해 둬서 회색 글씨가 accent 바탕에 얹혔다 . 
           밝은 판 1.06:1, 어두운 판 1.16:1 로 주/일이 사실상 안 보였다(2026-08-16 실주소가 잡음).
           FullCalendar 는 켜짐 상태에도 --fc-button-text-color 를 그대로 쓴다(켜짐용 토큰이 없다).
           accent 위에 얹는 글씨는 이 저장소 토큰으로 --accent-fg 다. 양쪽 판에서 함께 뒤집힌다. */
        .pl-cal-main .fc .fc-button-primary:not(:disabled).fc-button-active,
        .pl-cal-main .fc .fc-button-primary:not(:disabled):active { color: var(--accent-fg); }
        .pl-cal-main .fc .fc-col-header-cell-cushion,
        .pl-cal-main .fc .fc-daygrid-day-number { color: var(--text-secondary); text-decoration: none; }
        .pl-cal-main .fc .fc-event { cursor: pointer; }
        /* 주말과 공휴일 (사용자 2026-09-23 "주말, 공휴일 등이 구분이 안 됨"). 토 파랑, 일과 공휴일 빨강 */
        .pl-cal-main { --pl-sat: #2f6fd6; --pl-sun: #d9553f; }
        [data-theme="dark"] .pl-cal-main { --pl-sat: #6fa3f0; --pl-sun: #f07a66; }
        .pl-cal-main .fc .fc-day-sat .fc-daygrid-day-number,
        .pl-cal-main .fc .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion { color: var(--pl-sat); }
        .pl-cal-main .fc .fc-day-sun .fc-daygrid-day-number,
        .pl-cal-main .fc .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion,
        .pl-cal-main .fc .pl-holiday .fc-daygrid-day-number,
        .pl-cal-main .fc .fc-col-header-cell.pl-holiday .fc-col-header-cell-cushion { color: var(--pl-sun); }
        .pl-cal-main .fc .fc-daygrid-day.pl-holiday { background: color-mix(in srgb, var(--pl-sun) 6%, transparent); }
        /* 알림 한 줄 (toast.ts). lab 셸의 알림이 없는 dash 장용 */
        .pl-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 3000; padding: 10px 16px; background: var(--text-primary); color: var(--bg-secondary); font-size: var(--font-size-sm); }
        .pl-toast--error { background: var(--error); color: var(--accent-fg); }
        .pl-cal-main .fc .fc-event:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .pl-cal-layout { display: flex; gap: 16px; height: 100%; min-height: 0; }
        .pl-cal-side { width: 210px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
        .pl-cal-create { align-self: flex-start; }
        .pl-cal-main { flex: 1; min-width: 0; min-height: 420px; position: relative; }
        .pl-cal-mount { height: 100%; min-height: 420px; }
        .pl-cal-loading { position: absolute; inset: 0 0 auto 0; margin: 8px auto; width: max-content; z-index: 5; padding: 4px 12px; border-radius: var(--radius-md); background: var(--bg-tertiary); color: var(--text-secondary); font-size: var(--font-size-xs); }

        .pl-mini-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .pl-mini-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); }
        .pl-mini-nav { border: none; background: none; color: var(--text-tertiary); cursor: pointer; padding: 2px 6px; min-width: 24px; min-height: 24px; }
        .pl-mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .pl-mini-dow { font-size: var(--font-size-4xs); color: var(--text-tertiary); text-align: center; padding: 2px 0; }
        .pl-mini-day { font-size: var(--font-size-3xs); padding: 4px 0; min-height: 24px; border: none; background: none; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer; position: relative; }
        .pl-mini-day:hover { background: var(--bg-tertiary); }
        .pl-mini-day--out { color: var(--text-tertiary); }
        .pl-mini-day--today, .pl-mini-day--today:hover { background: var(--accent); color: var(--accent-fg); font-weight: 700; }
        .pl-mini-day--busy::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 3px; height: 3px; border-radius: 50%; background: currentColor; transform: translateX(-50%); }

        .pl-cal-modes { display: flex; gap: 4px; margin: 10px 0 8px; }
        .pl-cal-mode { flex: 1; padding: 4px 0; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: var(--font-size-xs); border-radius: var(--radius-sm); cursor: pointer; }
        .pl-cal-mode[aria-pressed="true"] { background: var(--text-primary); color: var(--bg-secondary); border-color: var(--text-primary); }
        .pl-cal-hint { margin-top: 8px; font-size: var(--font-size-2xs); color: var(--text-tertiary); line-height: 1.5; }
        .pl-cal-list-title { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: 600; margin-bottom: 6px; }
        .pl-cal-item { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); color: var(--text-secondary); padding: 3px 0; cursor: pointer; }
        .pl-cal-dot { width: 10px; height: 10px; border-radius: var(--radius-sm); flex: 0 0 auto; }
        .pl-cal-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* 창 */
        .pl-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 40; }
        .pl-modal { width: min(420px, 92%); background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: 0 12px 40px rgba(0,0,0,.3); }
        .pl-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .pl-modal-title { margin: 0; font-size: var(--font-size-md); color: var(--text-primary); }
        .pl-modal-x { border: none; background: none; color: var(--text-tertiary); cursor: pointer; font-size: var(--font-size-xs); }
        .pl-modal-body { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
        .pl-modal-name { font-size: var(--font-size-md); }
        .pl-times { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pl-times[data-allday="1"] { grid-template-columns: 1fr; }
        .pl-times[data-allday="1"] .pl-start-time, .pl-times[data-allday="1"] .pl-end-field { display: none; }
        .pl-times[data-allday="0"] .pl-start-date { display: none; }
        .pl-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

        /* 일정 풍선 */
        .pl-pop { position: absolute; z-index: 45; width: 260px; padding: 12px 14px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 8px 28px rgba(0,0,0,.25); }
        .pl-pop-head { display: flex; align-items: center; justify-content: space-between; }
        .pl-pop-dot { width: 10px; height: 10px; border-radius: 50%; }
        .pl-pop-title { font-weight: 700; color: var(--text-primary); margin: 4px 0; word-break: break-word; }
        .pl-pop-time, .pl-pop-cal { font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-pop-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }

        /* 일기 */
        .pl-diary { display: flex; gap: 16px; height: 100%; min-height: 0; }
        .pl-diary-side { width: 260px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
        .pl-diary-search { width: 100%; }
        .pl-diary-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
        .pl-diary-empty { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 4px 2px; }
        .pl-diary-item { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--radius-md); background: none; cursor: pointer; }
        .pl-diary-item:hover { background: var(--bg-tertiary); }
        .pl-diary-item--on { border-color: var(--accent); background: var(--bg-secondary); }
        .pl-diary-item-date { font-size: var(--font-size-xs); font-weight: 700; color: var(--text-secondary); }
        .pl-diary-item-preview { font-size: var(--font-size-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pl-diary-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
        .pl-diary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .pl-diary-date { margin: 0; font-size: var(--font-size-md); color: var(--text-primary); }
        .pl-diary-head-right { display: flex; align-items: center; gap: 8px; }
        .pl-diary-count { font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-diary-text { flex: 1; min-height: 240px; resize: none; padding: 14px 16px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); line-height: 1.8; font-family: inherit; }
        .pl-diary-text:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
        .pl-diary-saved { margin: 0; min-height: 1.2em; font-size: var(--font-size-xs); color: var(--text-tertiary); }

        /* 달력 칸의 일기 단추 */
        /* 단추는 **그 칸 안에서** 자리를 잡아야 한다. 칸에 자리 기준이 없으면 표 전체를 기준으로
           잡혀 모든 날의 단추가 한 자리에 겹쳐 쌓인다(실제로 그래서 옆 날 단추가 눌렸다). */
        .fc .fc-daygrid-day, .fc .fc-daygrid-day-frame { position: relative; }
        /* 누를 크기 24px (WCAG 2.2 AA 2.5.8). 17x15 였다 */
        .pl-daycell-diary { position: absolute; left: 4px; top: 2px; z-index: 2; border: none; background: none; cursor: pointer; font-size: var(--font-size-3xs); line-height: 1; padding: 2px 3px; min-width: 24px; min-height: 24px; border-radius: var(--radius-sm); color: var(--text-tertiary); opacity: 0; }
        .fc-daygrid-day:hover .pl-daycell-diary, .pl-daycell-diary:focus-visible { opacity: 1; }
        .pl-daycell-diary--on { opacity: 1; color: var(--accent); }
        .pl-daycell-diary:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        /* 칸반 */
        .pl-kanban { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0; }
        .pl-kanban-add { display: flex; gap: 8px; }
        .pl-kanban-add .pl-input { flex: 1; }
        .pl-kanban-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; flex: 1; min-height: 0; }
        .pl-col { display: flex; flex-direction: column; min-height: 0; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); }
        .pl-col--over { border-color: var(--accent); }
        .pl-col-head { padding: 10px 12px; font-size: var(--font-size-sm); font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
        .pl-col-count { color: var(--text-tertiary); font-weight: 500; }
        .pl-col-body { flex: 1; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; }
        .pl-col-empty { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0; }
        .pl-card { display: block; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: grab; }
        .pl-card--dragging { opacity: .5; }
        .pl-card--done .pl-card-title { text-decoration: line-through; color: var(--text-tertiary); }
        .pl-card-title { font-size: var(--font-size-sm); color: var(--text-primary); word-break: break-word; }
        .pl-card-notes { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 4px; white-space: pre-wrap; }
        .pl-card-moves { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
        .pl-card-move { font-size: var(--font-size-4xs); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: none; color: var(--text-tertiary); cursor: pointer; }
        .pl-card-move:hover { color: var(--text-primary); border-color: var(--accent, var(--border)); }

        /* 연속일 */
        .pl-streaks { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
        .pl-level { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
        .pl-level-badge { width: 52px; height: 52px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--accent); color: #fff; font-size: var(--font-size-lg); font-weight: 800; }
        .pl-level-info { flex: 1; min-width: 0; }
        .pl-level-title { font-weight: 700; color: var(--text-primary); }
        .pl-level-exp { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 4px 0 8px; }
        .pl-level-bar { height: 6px; border-radius: var(--radius-sm); background: var(--bg-tertiary); overflow: hidden; }
        .pl-level-fill { height: 100%; background: var(--accent); }
        .pl-track-row { display: flex; flex-direction: column; gap: 8px; }
        .pl-track { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); }
        .pl-track--done { opacity: .7; }
        .pl-track-label { font-weight: 600; color: var(--text-secondary); }
        .pl-track-stat { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 4px; }

        @media (max-width: 720px) {
            .pl-diary { flex-direction: column; }
            .pl-diary-side { width: 100%; max-height: 180px; }
            .pl-cal-layout { flex-direction: column; }
            .pl-cal-side { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
            .pl-kanban-board { grid-template-columns: 1fr; }
            .pl-body { flex-direction: column; }
            .pl-rail { order: -2; width: auto; flex-direction: row; border-left: 0; border-bottom: 1px solid var(--border); padding: 6px; }
            .pl-rail-btn { flex: 1; }
            .pl-drawer { order: -1; width: auto; border-left: 0; border-bottom: 1px solid var(--border); max-height: 60vh; }
        }`;

    /* 오른쪽 세로줄에서 여는 판 (Google 캘린더의 오른쪽 할 일, Keep 자리. 사용자 2026-09-24 "구글 캘린더를 벤치마킹, 양쪽에 뭐가 있자나") */
    type SideId = 'kanban' | 'diary' | 'streaks';
    const SIDES: { id: SideId; key: string }[] = [
        { id: 'kanban', key: 'planner.t08' },
        { id: 'diary', key: 'planner.t93' },
        { id: 'streaks', key: 'planner.t09' },
    ];
    const SIDE_KEY = 'karmolab.planner.side';
    function savedSide(): SideId | null {
        try {
            const v = localStorage.getItem(SIDE_KEY);
            return SIDES.some((s) => s.id === v) ? (v as SideId) : null;
        } catch {
            return null;
        }
    }
    function saveSide(v: SideId | null): void {
        try {
            if (v) localStorage.setItem(SIDE_KEY, v);
            else localStorage.removeItem(SIDE_KEY);
        } catch {
            /* 못 적으면 다음에 닫힌 채로 */
        }
    }

    const STYLE_ID = 'planner-style';
    function ensureStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    function build(container: HTMLElement, onDispose: (fn: () => void) => void, loadFollowups?: () => Promise<Followup[]>): void {
        ensureStyle();
        Object.assign(container.style, { height: '100%', display: 'flex', flexDirection: 'column', minHeight: '0', padding: '0' });
        container.innerHTML = `<div class="pl-root"></div>`;
        const root = container.querySelector<HTMLElement>('.pl-root')!;

        let token: string | null = storedToken();
        let side: SideId | null = savedSide();
        let cal: CalendarViewHandle | null = null;
        let sideLive: KanbanViewHandle | DiaryViewHandle | null = null;

        const disposeSide = (): void => {
            sideLive?.destroy();
            sideLive = null;
        };
        const dispose = (): void => {
            disposeSide();
            cal?.destroy();
            cal = null;
        };
        onDispose(dispose);

        /* 달력은 그대로 두고 오른쪽 판만 갈아 끼운다. 같은 단추를 다시 누르면 닫힘 */
        function openSide(next: SideId | null, diaryDate?: string): void {
            disposeSide();
            side = next;
            saveSide(side);
            const drawer = root.querySelector<HTMLElement>('.pl-drawer');
            const body = root.querySelector<HTMLElement>('.pl-drawer-body');
            const title = root.querySelector<HTMLElement>('.pl-drawer-title');
            if (!drawer || !body || !title) return;
            root.querySelectorAll<HTMLElement>('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
            drawer.hidden = !side;
            body.innerHTML = '';
            if (!side) return;
            title.textContent = t(SIDES.find((s) => s.id === side)!.key);
            if (side === 'diary') sideLive = buildDiaryView(body, diaryDate);
            else if (side === 'kanban') sideLive = buildKanbanView(body, token);
            else buildStreaksView(body, () => openSide('diary'));
        }

        function render(): void {
            dispose();
            /* 구글은 **선택**이다. 연동 전에도 세 칸이 전부 돈다(이 브라우저에 적힌다).
               연동하면 구글 캘린더, 할 일이 같은 화면에 얹힌다. */
            const right = !GOOGLE_CLIENT_ID
                ? `<span title="${esc(t('planner.t02'))}">${esc(t('planner.t01'))}</span>`
                : token
                  ? `<span>${esc(t('planner.t72'))}</span>
                     <button type="button" class="btn btn-ghost btn-xs pl-logout">${esc(t('planner.t73'))}</button>`
                  : `<button type="button" class="btn btn-ghost btn-xs pl-login">${esc(t('planner.t05'))}</button>`;

            /* Google 캘린더 틀. 왼쪽 판 (만들기, 작은 달력, 캘린더 목록) 은 달력 안, 가운데 달력,
               오른쪽 세로줄과 그 옆에 여는 판 (칸반, 일기, 연속일) */
            root.innerHTML = `
                <div class="pl-bar"><div class="pl-bar-right">${right}</div></div>
                <div class="pl-body">
                    <div class="pl-pane"></div>
                    <aside class="pl-drawer" hidden>
                        <div class="pl-drawer-head">
                            <b class="pl-drawer-title"></b>
                            <button type="button" class="pl-modal-x pl-drawer-x" aria-label="${esc(t('planner.t18'))}">✕</button>
                        </div>
                        <div class="pl-drawer-body"></div>
                    </aside>
                    <nav class="pl-rail">
                        ${SIDES.map((s) => `<button type="button" class="pl-rail-btn" data-side="${s.id}" aria-pressed="false">${esc(t(s.key))}</button>`).join('')}
                    </nav>
                </div>`;

            const paneEl = root.querySelector<HTMLElement>('.pl-pane')!;
            cal = buildCalendarView(paneEl, token, (date) => openSide('diary', date), loadFollowups);
            openSide(side);

            root.querySelectorAll<HTMLElement>('[data-side]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.side as SideId;
                    openSide(side === id ? null : id);
                });
            });
            root.querySelector('.pl-drawer-x')?.addEventListener('click', () => openSide(null));
            root.querySelector('.pl-login')?.addEventListener('click', () => {
                void (async () => {
                    try {
                        token = await requestToken();
                    } catch {
                        toast(t('planner.t06'), 'error');
                        return;
                    }
                    if (token) render();
                })();
            });
            root.querySelector('.pl-logout')?.addEventListener('click', () => {
                forgetToken();
                token = null;
                render();
            });
        }

        /* i18n 묶음이 오기 전에 그리면 키가 그대로 화면에 노출. 받은 뒤 그림.
           한 시간 토큰이 끝났으면 갱신 토큰으로 창 없이 한 번 갱신 */
        void Promise.all([loadNamespace('planner'), token ? null : ensureToken().then((x) => { token = x; })]).then(render);
    }

    dashRegistry().register({
        id: 'planner',
        get title(): string {
            return t('widgets.planner.title', undefined, '플래너');
        },
        /* 저장소에서는 AI 후속 일정 한 파일만 읽는다. 나머지는 구글과 이 브라우저 저장소 */
        access: 'read',
        paths: [FOLLOWUPS_PATH],
        render: async (ctx: DashPanelCtx): Promise<void> => {
            build(ctx.root, (fn) => ctx.onDispose(fn), async () => {
                /* 파일이 없거나 못 읽어도 달력은 뜬다. AI 칸만 빈다 */
                try {
                    const data = await ctx.repo.readJson<{ items?: Followup[] }>(FOLLOWUPS_PATH);
                    return Array.isArray(data.items) ? data.items : [];
                } catch {
                    return [];
                }
            });
        },
    });
})();
