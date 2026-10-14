/**
 * 달력. 구글 캘린더를 보고 고친다 (TASK-KL-321)
 *
 * 옛 React 판(`CalendarView.tsx` 595줄)을 그대로 옮겼다. 달력 알맹이는 FullCalendar 의
 * **틀 없는 판**을 쓴다. React 판이 쓰던 `react-big-calendar` 는 React 가 있어야만 돌아가고,
 * FullCalendar 는 같은 기능(월, 주, 일, 끌어 옮기기, 늘리기)을 아무 틀 없이 낸다.
 *
 * 왼쪽 작은 달력과 캘린더 목록은 손으로 그린다(60줄쯤). 라이브러리로 하면 같은 달력 엔진을
 * 두 번 띄우게 되는데, 그 값에 비해 하는 일이 달을 넘기고 날을 고른다뿐이다.
 */
import { toast } from './toast';
import { t } from '../../lib/i18n';
import {
    createEvent,
    deleteEvent,
    fetchCalendars,
    cachedEvents,
    syncEvents,
    hydrateGroups,
    patchEvent,
    EVENT_COLORS,
    ymd,
    type FcEvent,
    type GoogleCalendar
} from './gcal';
import {
    LOCAL_CALENDAR_ID,
    LOCAL_COLOR,
    createEvent as createLocalEvent,
    deleteEvent as deleteLocalEvent,
    isLocal,
    listEvents as listLocalEvents,
    updateEvent as updateLocalEvent,
    updateOccurrence
} from './local-store';
import { diaryDates } from './diary-store';
import { AI_CALENDAR_ID, AI_GOOGLE_NAME, aiCalendar, syncToGoogle, toAiEvents, type Followup } from './followups';
import { ANIME_CALENDAR_ID, ANIME_CHANGED, animeCalendar, animeEvents } from './anime-calendar';
import { withToken } from './gauth';
import { HOLIDAY_YEARS, holidayRangeSupported, repeatWindow, type RepeatRule } from './recurrence';
import { parseLinks, shiftExDates, withLinkedEvents, type LinkedEvent } from './event-group';

import { Calendar, type CalendarOptions, type EventApi } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import koLocale from '@fullcalendar/core/locales/ko';

const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HIDDEN_KEY = 'karmolab_planner_hidden_calendars';

function loadHidden(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
        /* 무시 */
    }
    return new Set();
}

function saveHidden(hidden: Set<string>): void {
    try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch {
        /* 무시 */
    }
}

/** `<input type="datetime-local">` 이 먹는 모양 */
function localInputValue(d: Date): string {
    return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addHours(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 3600000);
}

interface Draft {
    start: Date;
    end: Date;
    allDay: boolean;
    /** 고치는 중이면 원래 일정 */
    event?: EventApi;
}

export interface CalendarViewHandle {
    destroy: () => void;
}

/**
 * 달력을 그린다. `token` 이 없으면 **이 브라우저 캘린더만** 쓴다 . 
 * 구글은 얹는 것이지 있어야 하는 것이 아니다.
 */
/** Google 공개 캘린더 "대한민국의 휴일". 달력 칸을 빨갛게 칠하는 데 쓴다 */
const HOLIDAY_CALENDAR: GoogleCalendar = {
    id: 'ko.south_korea#holiday@group.v.calendar.google.com',
    summary: '대한민국의 휴일',
    backgroundColor: '#d9553f'
};
const isHolidayCalendar = (id: string | undefined): boolean => String(id || '').endsWith('#holiday@group.v.calendar.google.com');

const VIEW_KEY = 'karmolab.planner.view';
const VIEWS = ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listMonth'];
function savedView(): string {
    try {
        const v = localStorage.getItem(VIEW_KEY) || '';
        return VIEWS.includes(v) ? v : 'dayGridMonth';
    } catch {
        return 'dayGridMonth';
    }
}
function saveView(v: string): void {
    try {
        if (VIEWS.includes(v)) localStorage.setItem(VIEW_KEY, v);
    } catch {
        /* 못 적으면 다음에 월 보기로 */
    }
}

export function buildCalendarView(
    container: HTMLElement,
    token: string | null,
    onOpenDiary?: (date: string) => void,
    loadFollowups?: () => Promise<Followup[]>
): CalendarViewHandle {
    container.innerHTML = `
        <div class="pl-cal-layout">
            <div class="pl-cal-side">
                <button type="button" class="btn btn-accent pl-cal-create">${esc(t('planner.t10'))}</button>
                <details class="pl-cal-settings" open>
                <summary>${esc(t('planner.calendarSettings'))}</summary>
                <div class="pl-cal-settings-body">
                <div class="pl-mini"></div>
                <div class="pl-cal-modes" role="group" aria-label="${esc(t('planner.t94'))}">
                    <button type="button" class="pl-cal-mode" data-mode="all">${esc(t('planner.t95'))}</button>
                    <button type="button" class="pl-cal-mode" data-mode="mine">${esc(t('planner.t96'))}</button>
                    <button type="button" class="pl-cal-mode" data-mode="ai">${esc(t('planner.t97'))}</button>
                </div>
                <div class="pl-today" hidden></div>
                <div class="pl-cal-list"></div>
                <div class="pl-cal-hint" hidden></div>
                </div>
                </details>
            </div>
            <div class="pl-cal-main">
                <div class="pl-cal-loading" hidden>${esc(t('planner.t11'))}</div>
                <div class="pl-cal-mount"></div>
            </div>
        </div>`;

    const sideMini = container.querySelector<HTMLElement>('.pl-mini')!;
    const sideList = container.querySelector<HTMLElement>('.pl-cal-list')!;
    const sideToday = container.querySelector<HTMLElement>('.pl-today')!;
    const mount = container.querySelector<HTMLElement>('.pl-cal-mount')!;
    const loading = container.querySelector<HTMLElement>('.pl-cal-loading')!;
    const settings = container.querySelector<HTMLDetailsElement>('.pl-cal-settings')!;
    const mobile = window.matchMedia('(max-width: 899px)');
    settings.open = !mobile.matches;
    const adaptSettings = (): void => { settings.open = !mobile.matches; };
    mobile.addEventListener('change', adaptSettings);

    /** 목록의 첫 줄은 늘 이 브라우저 캘린더다 (구글은 그 뒤에 붙는다) */
    const localCalendar = (): GoogleCalendar => ({
        id: LOCAL_CALENDAR_ID,
        summary: t('planner.t50'),
        backgroundColor: LOCAL_COLOR
    });
    /* AI 후속 일정 (memo 원본). 달력 목록 둘째 줄 */
    let calendars: GoogleCalendar[] = [localCalendar(), aiCalendar(), animeCalendar()];
    let followups: Followup[] = [];
    let allEvents: FcEvent[] = [];
    const hidden = loadHidden();
    let miniMonth = new Date();
    let destroyed = false;

    const visible = (): FcEvent[] => allEvents.filter((e) => !hidden.has(e.extendedProps.calendarId));

    /* ===== 달력 알맹이 ===== */

    /* 판을 그리는 순간 datesSet 이 먼저 울고, 그 손이 reload 를 부른다. 이 줄이 아래 있으면
       그때는 아직 죽은 자리(TDZ)라 달력이 통째로 안 뜬다 (2026-08-31 실측) */
    let lastRange: { start: Date; end: Date } | null = null;

    const options: CalendarOptions = {
        plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin],
        locale: koLocale,
        /* 보기 넷 (월, 주, 일, 일정 목록). 마지막에 본 보기로 연다 (Google 캘린더처럼) */
        initialView: savedView(),
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
        },
        height: '100%',
        /* 숫자는 숫자만 (Google 캘린더처럼). ko 기본은 "24일", "오전 10:00", "9. 24. (목)" 이라 칸이 좁으면 줄이 넘침 */
        dayCellContent: (arg) => (arg.view.type.startsWith('dayGrid') ? String(arg.date.getDate()) : { html: '' }),
        dayHeaderContent: (arg) =>
            arg.view.type.startsWith('timeGrid')
                ? { html: `<span class="pl-dh-dow">${esc(arg.date.toLocaleDateString('ko-KR', { weekday: 'short' }))}</span> <span class="pl-dh-num">${arg.date.getDate()}</span>` }
                : arg.date.toLocaleDateString('ko-KR', { weekday: 'short' }),
        eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        nowIndicator: true,
        scrollTime: '08:00:00',
        dayMaxEvents: true,
        /* 달마다 필요한 주만 (5주면 5줄). 6줄 고정이면 칸이 낮아져 일정이 "+N 개" 뒤로 숨음 (2026-09-25 사용자 "일정 하나도 안 보이고") */
        fixedWeekCount: false,
        selectable: true,
        dateClick: (info) => {
            if (mobile.matches && info.view.type === 'dayGridMonth') calendar.changeView('timeGridDay', info.date);
        },
        editable: true,
        eventStartEditable: true,
        eventDurationEditable: true,
        /* Google 캘린더처럼 월 칸의 시각 일정은 점 한 줄, 종일만 색 막대. 한 칸에 더 많이 */
        eventDisplay: 'auto',
        select: (info) => openModal({ start: info.start, end: info.end, allDay: info.allDay }),
        eventClick: (info) => {
            info.jsEvent.preventDefault();
            openPopover(info.event, info.jsEvent.clientX, info.jsEvent.clientY, info.el);
        },
        eventClassNames: ({ event }) => event.extendedProps.parentEventId ? ['pl-linked-event', ...(event.start && event.end && +event.end - +event.start <= 30 * 60000 ? ['pl-linked-short'] : [])] : [],
        /* 자판만 쓰는 사람도 일정을 열 수 있어야 한다. 끌어 옮기기는 마우스만 되므로,
           초점을 받을 수 있게 하고 Enter/Space 로 같은 풍선을 연다(거기서 시각을 고친다). */
        eventDidMount: (info) => {
            info.el.setAttribute('aria-label', `${info.event.title}, ${describeWhen(info.event)}${info.event.extendedProps.parentTitle ? `, ${t('planner.groupParent', { title: info.event.extendedProps.parentTitle as string })}` : ''}`);
            info.el.title = info.el.getAttribute('aria-label') || info.event.title;
            /* 캘린더 색을 변수로. dash 는 이 색을 옅게 깔고 왼쪽 줄로만 진하게 (P1 시안, 2026-09-24) */
            const color = info.event.backgroundColor || info.backgroundColor;
            if (color) info.el.style.setProperty('--pl-ev', color);
            info.el.tabIndex = 0;
            info.el.setAttribute('role', 'button');
            info.el.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                const r = info.el.getBoundingClientRect();
                openPopover(info.event, r.left, r.bottom, info.el);
            });
        },
        /* 끌어 옮기기, 늘리기. 화면은 이미 옮겨져 있으니 구글에만 알리면 된다.
           실패하면 되돌린다(`revert`), 안 그러면 화면과 구글이 갈라진 채로 남는다. */
        eventDrop: (info) => void saveMove(info.event, info.revert),
        eventResize: (info) => void saveMove(info.event, info.revert),
        /* 날짜 칸마다 일기 단추 하나. 쓴 날은 켜져 있고, 안 쓴 날은 마우스를 올려야 보인다 . 
           빈 날마다 표식이 켜져 있으면 쓴 날이 눈에 안 들어온다. */
        dayCellDidMount: (info) => {
            if (mobile.matches && info.view.type === 'dayGridMonth') {
                const day = info.el.querySelector<HTMLElement>('.fc-daygrid-day-number');
                if (day) {
                    day.tabIndex = 0;
                    day.setAttribute('role', 'button');
                    day.setAttribute('aria-label', `${ymd(info.date)} ${t('planner.daySchedule')}`);
                    day.addEventListener('keydown', (e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        calendar.changeView('timeGridDay', info.date);
                    });
                }
            }
            if (!onOpenDiary) return;
            const date = ymd(info.date);
            const written = diaryDates().has(date);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `pl-daycell-diary${written ? ' pl-daycell-diary--on' : ''}`;
            btn.textContent = '✎';
            btn.title = written ? t('planner.t91') : t('planner.t92');
            btn.setAttribute('aria-label', `${date} ${written ? t('planner.t91') : t('planner.t92')}`);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onOpenDiary(date);
            });
            /* 누르는 자리가 칸 선택(일정 만들기)으로 번지지 않게 */
            btn.addEventListener('mousedown', (e) => e.stopPropagation());
            info.el.appendChild(btn);
        },
        datesSet: (info) => {
            saveView(info.view.type);
            miniMonth = new Date(info.view.currentStart);
            renderMini();
            /* 첫 datesSet 은 render() 안에서 울려 아직 calendar 가 초기화 전. 받아 오기는 그 뒤로 (TDZ, 2026-09-25 실측) */
            queueMicrotask(() => void reload(info.start, info.end));
        }
    };

    const calendar = new Calendar(mount, options);
    calendar.render();
    /* FullCalendar 의 화살표는 `role="img"` 인데 이름이 없다. 이름은 감싼 버튼이 이미 들고
       있으므로 아이콘은 숨긴다 (axe role-img-alt 2곳, 2026-09-04) */
    for (const icon of mount.querySelectorAll('.fc-icon')) icon.setAttribute('aria-hidden', 'true');
    /* 오른쪽 판을 열고 닫으면 창 크기는 그대로인데 달력 폭만 바뀐다. FullCalendar 는 창 크기만 봄 */
    const resize = new ResizeObserver(() => calendar.updateSize());
    resize.observe(mount);

    /* ===== 받아 오기 ===== */


    async function reload(start: Date, end: Date): Promise<void> {
        lastRange = { start, end };
        /* 이 브라우저 것은 늘 있다. 구글은 연동돼 있을 때만 얹는다. */
        const own = (): FcEvent[] => [...listLocalEvents(t('planner.t50'), new Date(+start - 2 * 86400000), new Date(+end + 2 * 86400000)), ...toAiEvents(followups), ...animeEvents(start, end)];
        if (!token) {
            setEvents(own());
            return;
        }
        /* 보이는 구간의 앞뒤로 조금 더. 달을 넘길 때마다 빈 화면이 깜빡이지 않게 */
        const pad = 7 * 86400000;
        const from = new Date(+start - pad);
        const to = new Date(+end + pad);
        const googleCals = calendars.filter((c) => c.id !== LOCAL_CALENDAR_ID && c.id !== AI_CALENDAR_ID && c.id !== ANIME_CALENDAR_ID);
        /* 저장본으로 먼저 그리고, 구글에는 바뀐 것만 묻는다 (event-cache.ts) */
        setEvents([...own(), ...cachedEvents(googleCals, from, to)]);
        loading.hidden = false;
        try {
            const synced = await withToken(token, (tok) => syncEvents(tok, googleCals, from, to));
            if (destroyed || lastRange.start !== start) return;
            const googleEvents = await withToken(token, (tok) => hydrateGroups(tok, synced.events));
            if (destroyed || lastRange.start !== start) return;
            setEvents([...own(), ...googleEvents]);
        } catch {
            /* 갱신해도 거절. 저장본만 보이는 중임을 알림 */
            if (!destroyed) toast(t('planner.t36'), 'error');
        } finally {
            loading.hidden = true;
        }
    }

    function setEvents(list: FcEvent[]): void {
        allEvents = withLinkedEvents(list);
        applyEvents();
        renderMini();
    }

    /* 달력에는 바뀐 일정만 넣고 뺀다. 통째로 지우고 다시 그리면 저장본과 구글 판이 같아도 깜빡인다 */
    const sigOf = (ev: FcEvent): string => JSON.stringify([ev.title, ev.start, ev.end, ev.allDay, ev.backgroundColor, ev.extendedProps]);
    function applyEvents(): void {
        const want = new Map(visible().map((ev) => [ev.id, ev]));
        calendar.batchRendering(() => {
            for (const cur of calendar.getEvents()) {
                const w = want.get(cur.id);
                if (w && cur.extendedProps.sig === sigOf(w)) want.delete(cur.id);
                else cur.remove();
            }
            for (const ev of want.values()) {
                calendar.addEvent({ ...ev, title: ev.title || t('planner.t12'), extendedProps: { ...ev.extendedProps, sig: sigOf(ev) } });
            }
        });
        markHolidays();
    }

    /* 공휴일 칸과 머리 칸을 빨갛게. 공휴일 캘린더의 일정이 있는 날. 끈 캘린더여도 날 색은 남긴다 */
    function markHolidays(): void {
        const days = new Set<string>();
        for (const ev of allEvents) {
            if (!isHolidayCalendar(ev.extendedProps.calendarId)) continue;
            const from = new Date(ev.start.slice(0, 10) + 'T00:00:00');
            const to = ev.end ? new Date(ev.end.slice(0, 10) + 'T00:00:00') : new Date(+from + 86400000);
            for (let d = from; d < to; d = new Date(+d + 86400000)) days.add(ymd(d));
        }
        for (const el of mount.querySelectorAll<HTMLElement>('[data-date]')) {
            el.classList.toggle('pl-holiday', days.has(el.dataset.date || ''));
        }
    }

    /* ===== 왼쪽: 작은 달력 ===== */

    function renderMini(): void {
        const first = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1);
        const startDow = first.getDay(); // 일요일 시작. 옆의 큰 달력(ko)과 같은 줄에 서야 헷갈리지 않는다
        const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startDow);
        const today = ymd(new Date());
        const busy = new Set(visible().map((e) => e.start.slice(0, 10)));

        const cells: string[] = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
            const key = ymd(d);
            const cls = [
                'pl-mini-day',
                d.getMonth() === miniMonth.getMonth() ? '' : 'pl-mini-day--out',
                key === today ? 'pl-mini-day--today' : '',
                busy.has(key) ? 'pl-mini-day--busy' : ''
            ]
                .filter(Boolean)
                .join(' ');
            cells.push(`<button type="button" class="${cls}" data-date="${key}">${d.getDate()}</button>`);
        }
        renderToday(today);

        const dowLabels = [t('planner.t26'), t('planner.t20'), t('planner.t21'), t('planner.t22'), t('planner.t23'), t('planner.t24'), t('planner.t25')];
        sideMini.innerHTML = `
            <div class="pl-mini-head">
                <button type="button" class="pl-mini-nav" data-nav="-1" aria-label="${esc(t('planner.t13'))}">◀</button>
                <span class="pl-mini-title">${miniMonth.getFullYear()}. ${miniMonth.getMonth() + 1}</span>
                <button type="button" class="pl-mini-nav" data-nav="1" aria-label="${esc(t('planner.t14'))}">▶</button>
            </div>
            <div class="pl-mini-grid">
                ${dowLabels.map((d) => `<span class="pl-mini-dow">${esc(d)}</span>`).join('')}
                ${cells.join('')}
            </div>`;
    }

    /* 왼쪽 판의 오늘 일정 (시안 Q2, 2026-09-25). 종일이 먼저, 그다음 시각 순. 없으면 칸째 숨김 */
    function renderToday(today: string): void {
        const hm = (iso: string): string => {
            const d = new Date(iso);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const items = visible()
            .filter((e) => (e.allDay ? e.start.slice(0, 10) <= today && (e.end ? e.end.slice(0, 10) > today : e.start.slice(0, 10) === today) : ymd(new Date(e.start)) === today))
            .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.localeCompare(b.start));
        sideToday.hidden = items.length === 0;
        sideToday.innerHTML = `<div class="pl-cal-list-title">${esc(t('planner.t81'))}</div>${items
            .map((e) => `<button type="button" class="pl-today-item" data-date="${today}" style="--pl-ev:${esc(e.backgroundColor || LOCAL_COLOR)}">
                <span class="pl-today-dot"></span><span class="pl-today-time">${e.allDay ? '' : hm(e.start)}</span><span class="pl-today-name">${esc(e.title || t('planner.t12'))}</span>
            </button>`)
            .join('')}`;
    }
    sideToday.addEventListener('click', (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date;
        if (date) calendar.changeView('timeGridDay', date);
    });

    sideMini.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const nav = target.closest<HTMLElement>('[data-nav]');
        if (nav) {
            miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + Number(nav.dataset.nav), 1);
            renderMini();
            return;
        }
        const day = target.closest<HTMLElement>('[data-date]');
        if (day?.dataset.date) {
            calendar.changeView('timeGridDay', day.dataset.date);
        }
    });

    /* ===== 왼쪽: 캘린더 목록 ===== */

    function renderList(): void {
        sideList.innerHTML = `
            <div class="pl-cal-list-title">${esc(t('planner.t15'))}</div>
            ${calendars
                .map((c) => {
                    const color = c.backgroundColor || '#4285f4';
                    const on = !hidden.has(c.id);
                    return `<label class="pl-cal-item">
                        <input type="checkbox" name="calendar-${esc(c.id)}" data-cal="${esc(c.id)}" ${on ? 'checked' : ''}>
                        <span class="pl-cal-dot" style="background:${esc(color)}"></span>
                        <span class="pl-cal-name">${esc(c.summary)}</span>
                    </label>`;
                })
                .join('')}`;
        markModes();
    }

    /* 보기 모드. 전체, 내 일정 (AI 끔), AI 만. 캘린더 켜고 끄기를 한 번에 바꾸는 것 */
    const modesEl = container.querySelector<HTMLElement>('.pl-cal-modes')!;
    function currentMode(): string {
        if (hidden.size === 0) return 'all';
        const others = calendars.filter((c) => c.id !== AI_CALENDAR_ID);
        if (hidden.size === 1 && hidden.has(AI_CALENDAR_ID)) return 'mine';
        if (!hidden.has(AI_CALENDAR_ID) && others.every((c) => hidden.has(c.id))) return 'ai';
        return '';
    }
    function markModes(): void {
        const m = currentMode();
        modesEl.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    }
    modesEl.addEventListener('click', (e) => {
        const mode = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
        if (!mode) return;
        hidden.clear();
        if (mode === 'mine') hidden.add(AI_CALENDAR_ID);
        if (mode === 'ai') for (const c of calendars) if (c.id !== AI_CALENDAR_ID) hidden.add(c.id);
        saveHidden(hidden);
        renderList();
        applyEvents();
        renderMini();
    });

    sideList.addEventListener('change', (e) => {
        const box = e.target as HTMLInputElement;
        const id = box.dataset.cal;
        if (!id) return;
        if (box.checked) hidden.delete(id);
        else hidden.add(id);
        saveHidden(hidden);
        markModes();
        applyEvents();
        renderMini();
    });

    /* ===== 만들기, 고치기 창 ===== */

    let modalEl: HTMLDialogElement | null = null;
    /* 창을 열기 전 초점 자리. 닫으면 돌려줌 */
    let modalOpener: HTMLElement | null = null;
    const modalTitleId = `pl-modal-title-${Math.random().toString(36).slice(2, 8)}`;

    function closeModal(restore = false): void {
        modalEl?.close();
        modalEl?.remove();
        modalEl = null;
        const back = modalOpener;
        modalOpener = null;
        if (restore && back?.isConnected) back.focus();
    }

    function openModal(draft: Draft): void {
        closePopover();
        closeModal();
        modalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const ev = draft.event;
        const localRepeat = ev?.extendedProps.repeatRule as RepeatRule | undefined;
        const seriesDate = (value: string): Date => new Date(value.length === 10 ? `${value}T00:00:00` : value);
        const startDate = ev ? ev.start ?? draft.start : draft.start;
        const endDate = ev ? ev.end ?? addHours(startDate, 1) : draft.end;
        const allDay = ev ? ev.allDay : draft.allDay;
        const currentCal = (ev?.extendedProps.calendarId as string) || calendars[0]?.id || 'primary';
        const editableCalendars = calendars.filter((cal) => cal.id !== AI_CALENDAR_ID && cal.id !== ANIME_CALENDAR_ID && !isHolidayCalendar(cal.id));

        const googleInstance = !!ev?.extendedProps.recurringEventId;
        let selectedColor = String(isLocal(ev?.id || '') ? ev?.extendedProps.eventColor || '' : ev?.extendedProps.colorId || '');
        const inheritedLinks = parseLinks(ev?.extendedProps.seriesLinks);
        const commonLinks = localRepeat || googleInstance ? inheritedLinks.length || ev?.extendedProps.commonLinks ? inheritedLinks : parseLinks(ev?.extendedProps.linkedEvents) : parseLinks(ev?.extendedProps.linkedEvents);
        const linkedAllDay = (): boolean => (localRepeat || googleInstance) && scope?.value !== 'series' && ev?.extendedProps.seriesStart ? (ev.extendedProps.seriesStart as string).length === 10 : allDayBox.checked;
        const wrap = document.createElement('dialog');
        wrap.className = 'pl-modal-overlay';
        wrap.setAttribute('aria-labelledby', modalTitleId);
        wrap.innerHTML = `
            <div class="pl-modal">
                <div class="pl-modal-head">
                    <h3 class="pl-modal-title" id="${modalTitleId}">${esc(ev ? t('planner.t16') : t('planner.t17'))}</h3>
                    <button type="button" class="pl-modal-x" aria-label="${esc(t('planner.t18'))}">✕</button>
                </div>
                <form class="pl-modal-body">
                    <div class="pl-modal-fields">
                    ${localRepeat || googleInstance ? `<label class="pl-field"><span class="pl-label">${esc(t('planner.groupScope'))}</span><select class="pl-input" name="event-scope"><option value="day">${esc(t('planner.groupDay'))}</option>${ev?.extendedProps.seriesStart ? `<option value="series">${esc(t('planner.groupSeries'))}</option>` : ''}</select></label>` : ''}
                    <label class="pl-field"><span class="pl-label">${esc(t('planner.t19'))}</span><input type="text" name="event-title" class="pl-input pl-modal-name" required value="${esc(ev?.title ?? '')}"></label>
                    <fieldset class="pl-event-colors"><legend class="pl-label">${esc(t('planner.eventColor'))}</legend>
                        <div class="pl-color-options">${[['', t('planner.colorDefault')], ...Object.keys(EVENT_COLORS).map(id => [id, t('planner.color' + id)])].map(([id, name]) => { const value = currentCal === LOCAL_CALENDAR_ID || isLocal(ev?.id || '') ? EVENT_COLORS[id] || '' : id; return `<label class="pl-color-option" title="${esc(name)}"><input type="radio" name="event-color" value="${esc(value)}" ${value === selectedColor ? 'checked' : ''}><span style="--pl-color:${id ? EVENT_COLORS[id] : calendars.find(c => c.id === currentCal)?.backgroundColor || LOCAL_COLOR}"></span><span class="pl-color-name">${esc(name)}</span></label>`; }).join('')}</div>
                    </fieldset>
                    ${
                        editableCalendars.length > 1 && !ev
                            ? `<label class="pl-field"><span class="pl-label">${esc(t('planner.t15'))}</span>
                                 <select name="event-calendar" class="pl-input">
                                   ${editableCalendars.map((c) => `<option value="${esc(c.id)}"${c.id === currentCal ? ' selected' : ''}>${esc(c.summary)}</option>`).join('')}
                                 </select></label>`
                            : ''
                    }
                    <label class="pl-check"><input type="checkbox" name="event-allday" ${allDay ? 'checked' : ''}><span>${esc(t('planner.t27'))}</span></label>
                    <div class="pl-times" data-allday="${allDay ? '1' : '0'}">
                        <label class="pl-field pl-start-field"><span class="pl-label">${esc(t('planner.t28'))}</span>
                            <input id="${modalTitleId}-start-time" type="datetime-local" name="event-start" class="pl-input pl-start-time" value="${localInputValue(startDate)}">
                            <input id="${modalTitleId}-start-date" type="date" name="event-start-date" class="pl-input pl-start-date" value="${ymd(startDate)}">
                        </label>
                        <label class="pl-field pl-end-field"><span class="pl-label">${esc(t('planner.t29'))}</span>
                            <input type="datetime-local" name="event-end" class="pl-input pl-end-time" value="${localInputValue(endDate)}">
                        </label>
                    </div>
                    <div class="pl-repeat-config"><label class="pl-field"><span class="pl-label">${esc(t('planner.repeat'))}</span>
                        <select class="pl-input" name="event-repeat" ${googleInstance ? 'disabled' : ''}>
                            <option value="none">${esc(t(googleInstance ? 'planner.repeatExisting' : 'planner.repeatNone'))}</option>
                            <option value="daily" ${localRepeat?.frequency === 'daily' ? 'selected' : ''}>${esc(t('planner.repeatDaily'))}</option>
                            <option value="weekly" ${localRepeat?.frequency === 'weekly' ? 'selected' : ''}>${esc(t('planner.repeatWeekly'))}</option>
                        </select>
                    </label>
                    <label class="pl-field pl-repeat-start" hidden><span class="pl-label">${esc(t('planner.repeatStart'))}</span><input type="date" name="event-repeat-start" class="pl-input" required value="${esc(localRepeat?.startDate ?? ymd(startDate))}"></label>
                    <fieldset class="pl-repeat-days" hidden><legend class="pl-label">${esc(t('planner.repeatDays'))}</legend>
                        ${Array.from({ length: 7 }, (_, d) => `<label class="pl-repeat-day"><input type="checkbox" name="event-repeat-day" value="${d}" ${(localRepeat?.days ?? [startDate.getDay()]).includes(d) ? 'checked' : ''}><span>${esc(new Date(2026, 0, 4 + d).toLocaleDateString(document.documentElement.lang || 'ko', { weekday: 'short' }))}</span></label>`).join('')}
                    </fieldset>
                    <div class="pl-repeat-options" hidden>
                        <label class="pl-field"><span class="pl-label pl-repeat-interval-label"></span><input type="number" name="event-repeat-interval" class="pl-input" required min="1" max="52" step="1" value="${localRepeat?.interval ?? 1}"></label>
                        <label class="pl-field"><span class="pl-label pl-repeat-until-label">${esc(t('planner.repeatUntil'))}</span><input type="date" name="event-repeat-until" class="pl-input" min="${ymd(startDate)}" value="${esc(localRepeat?.until ?? '')}"></label>
                        <label class="pl-check"><input type="checkbox" name="event-repeat-exclude-holidays" ${localRepeat?.excludeHolidays ? 'checked' : ''}><span>${esc(t('planner.repeatExcludeHolidays'))}</span></label>
                        <p class="pl-repeat-note pl-holiday-hint" hidden>${esc(t('planner.repeatHolidayHint').replace('{from}', String(HOLIDAY_YEARS[0])).replace('{to}', String(HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1])))}</p>
                    </div>
                    </div>
                    <details class="pl-linked-settings" ${commonLinks.length ? 'open' : ''}><summary>${esc(t('planner.groupLinks'))}</summary>
                        <p class="pl-repeat-note">${esc(t('planner.groupHint'))}</p>
                        ${(['before', 'after'] as const).map(side => { const link = commonLinks.find(x => x.side === side); return `<fieldset class="pl-link-row" data-side="${side}"><legend><label class="pl-check"><input type="checkbox" name="link-${side}" ${link ? 'checked' : ''}><span>${esc(t(side === 'before' ? 'planner.groupBefore' : 'planner.groupAfter'))}</span></label></legend>
                            <label class="pl-field"><span class="pl-label">${esc(t('planner.t19'))}</span><input class="pl-input" name="link-${side}-title" maxlength="100" required value="${esc(link?.title || t(side === 'before' ? 'planner.groupCommuteIn' : 'planner.groupCommuteOut'))}"></label>
                            <div class="pl-link-times"><label class="pl-field"><span class="pl-label">${esc(t('planner.groupMinutes'))}</span><input class="pl-input" type="number" name="link-${side}-minutes" required min="1" max="1440" step="1" value="${link?.minutes ?? 30}"></label><label class="pl-field"><span class="pl-label">${esc(t('planner.groupGap'))}</span><input class="pl-input" type="number" name="link-${side}-gap" required min="0" max="1440" step="1" value="${link?.gap ?? 0}"></label></div></fieldset>`; }).join('')}
                        <p class="pl-repeat-note pl-linked-allday" hidden>${esc(t('planner.groupTimedOnly'))}</p>
                    </details>
                    ${localRepeat ? `<section class="pl-exceptions" hidden><h4 class="pl-label">${esc(t('planner.groupExceptions'))}</h4>${Object.entries(ev!.extendedProps.exceptions || {}).map(([date, change]) => `<div class="pl-exception-row"><span>${esc(date)} ${esc(t((change as { cancelled?: boolean }).cancelled ? 'planner.groupSkipped' : 'planner.groupChanged'))}</span><button type="button" class="btn btn-ghost" data-restore="${esc(date)}">${esc(t('planner.groupRestore'))}</button></div>`).join('') || `<p class="pl-repeat-note">${esc(t('planner.groupNoExceptions'))}</p>`}</section>` : ''}
                    ${localRepeat || googleInstance ? `<p class="pl-repeat-note pl-scope-note">${esc(t('planner.groupDayHint'))}</p>` : ''}
                    </div>
                    <div class="pl-modal-footer">
                    <p class="pl-form-error" role="alert" hidden></p>
                    <div class="pl-modal-actions">
                        <button type="button" class="btn btn-ghost pl-modal-cancel">${esc(t('planner.t30'))}</button>
                        <button type="submit" class="btn btn-accent">${esc(t('planner.t31'))}</button>
                    </div>
                    </div>
                </form>
            </div>`;
        container.appendChild(wrap);
        modalEl = wrap;
        wrap.showModal();

        const form = wrap.querySelector('form')!;
        const colors = wrap.querySelector<HTMLElement>('.pl-event-colors')!;
        colors.addEventListener('change', (e) => { selectedColor = (e.target as HTMLInputElement).value; });
        wrap.querySelector<HTMLSelectElement>('[name="event-calendar"]')?.addEventListener('change', (e) => {
            const local = (e.target as HTMLSelectElement).value === LOCAL_CALENDAR_ID;
            for (const input of colors.querySelectorAll<HTMLInputElement>('input')) {
                const id = Object.keys(EVENT_COLORS).find(key => key === input.value || EVENT_COLORS[key] === input.value);
                input.value = id ? local ? EVENT_COLORS[id] : id : '';
                if (input.checked) selectedColor = input.value;
            }
        });
        const scope = wrap.querySelector<HTMLSelectElement>('[name="event-scope"]');
        const allDayBox = wrap.querySelector<HTMLInputElement>('[name="event-allday"]')!;
        const times = wrap.querySelector<HTMLElement>('.pl-times')!;
        const syncAllDay = (): void => {
            times.dataset.allday = allDayBox.checked ? '1' : '0';
            times.querySelectorAll<HTMLInputElement>('.pl-start-time, .pl-end-time').forEach((input) => { input.disabled = allDayBox.checked; });
            const dateInput = times.querySelector<HTMLInputElement>('.pl-start-date')!;
            dateInput.disabled = !allDayBox.checked;
            dateInput.required = allDayBox.checked;
            times.querySelector<HTMLLabelElement>('.pl-start-field')!.htmlFor = allDayBox.checked ? dateInput.id : `${modalTitleId}-start-time`;
            times.querySelector<HTMLInputElement>('.pl-start-time')!.required = !allDayBox.checked;
        };
        allDayBox.addEventListener('change', syncAllDay);
        syncAllDay();
        const repeatSelect = wrap.querySelector<HTMLSelectElement>('[name="event-repeat"]')!;
        const repeatStartField = wrap.querySelector<HTMLElement>('.pl-repeat-start')!;
        const repeatStartInput = wrap.querySelector<HTMLInputElement>('[name="event-repeat-start"]')!;
        let repeatStartTouched = !!localRepeat?.startDate;
        const repeatDays = wrap.querySelector<HTMLFieldSetElement>('.pl-repeat-days')!;
        const repeatOptions = wrap.querySelector<HTMLElement>('.pl-repeat-options')!;
        const excludeHolidays = wrap.querySelector<HTMLInputElement>('[name="event-repeat-exclude-holidays"]')!;
        const repeatUntil = wrap.querySelector<HTMLInputElement>('[name="event-repeat-until"]')!;
        const syncHoliday = (): void => {
            const excluding = !repeatOptions.hidden && excludeHolidays.checked;
            repeatUntil.required = excluding;
            wrap.querySelector<HTMLElement>('.pl-holiday-hint')!.hidden = !excluding;
            wrap.querySelector<HTMLElement>('.pl-repeat-until-label')!.textContent = t(excluding ? 'planner.repeatUntilRequired' : 'planner.repeatUntil');
            repeatStartInput.min = excluding ? `${HOLIDAY_YEARS[0]}-01-01` : '';
            repeatStartInput.max = repeatUntil.max = excluding ? `${HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1]}-12-31` : '';
        };
        const syncRepeat = (): void => {
            const scoped = !!scope && scope.value === 'day';
            wrap.querySelector<HTMLElement>('.pl-repeat-config')!.hidden = scoped || googleInstance;
            repeatSelect.disabled = scoped || googleInstance;
            repeatDays.hidden = scoped || googleInstance || repeatSelect.value !== 'weekly';
            repeatDays.disabled = repeatDays.hidden;
            repeatStartField.hidden = scoped || googleInstance || repeatSelect.value === 'none';
            repeatStartInput.disabled = repeatStartField.hidden;
            wrap.querySelector<HTMLInputElement>('[name="event-repeat-until"]')!.min = repeatStartInput.value;
            repeatOptions.hidden = scoped || googleInstance || repeatSelect.value === 'none';
            repeatOptions.querySelectorAll<HTMLInputElement>('input').forEach((input) => { input.disabled = repeatOptions.hidden; });
            syncHoliday();
            wrap.querySelector<HTMLElement>('.pl-repeat-interval-label')!.textContent = t(repeatSelect.value === 'weekly' ? 'planner.repeatWeekInterval' : 'planner.repeatDayInterval');
        };
        repeatSelect.addEventListener('change', syncRepeat);
        excludeHolidays.addEventListener('change', syncHoliday);
        syncRepeat();
        const syncLinked = (): void => {
            for (const side of ['before', 'after']) {
                const box = wrap.querySelector<HTMLInputElement>(`[name="link-${side}"]`)!;
                box.disabled = linkedAllDay() || (googleInstance && !ev?.extendedProps.seriesStart);
                wrap.querySelectorAll<HTMLInputElement>(`.pl-link-row[data-side="${side}"] .pl-input`).forEach(input => { input.disabled = box.disabled || !box.checked; });
            }
            wrap.querySelector<HTMLElement>('.pl-linked-allday')!.hidden = !linkedAllDay();
        };
        allDayBox.addEventListener('change', syncLinked);
        wrap.querySelectorAll<HTMLInputElement>('.pl-link-row [type="checkbox"]').forEach(box => box.addEventListener('change', syncLinked));
        syncLinked();
        scope?.addEventListener('change', () => {
            wrap.querySelectorAll<HTMLInputElement>('input').forEach(input => input.setCustomValidity(''));
            const whole = scope.value === 'series';
            const at = whole ? seriesDate(ev!.extendedProps.seriesStart as string) : ev!.start!;
            const finish = whole ? seriesDate(ev!.extendedProps.seriesEnd as string) : ev!.end ?? addHours(at, 1);
            allDayBox.checked = whole ? (ev!.extendedProps.seriesStart as string).length === 10 : ev!.allDay;
            allDayBox.disabled = googleInstance && whole;
            wrap.querySelector<HTMLInputElement>('[name="event-title"]')!.value = whole ? ev!.extendedProps.seriesTitle as string || ev!.title : ev!.title;
            selectedColor = String(whole ? ev!.extendedProps.seriesColor || '' : isLocal(ev!.id) ? ev!.extendedProps.eventColor || '' : ev!.extendedProps.colorId || '');
            colors.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.checked = input.value === selectedColor; });
            wrap.querySelector<HTMLInputElement>('[name="event-start"]')!.value = localInputValue(at);
            wrap.querySelector<HTMLInputElement>('[name="event-start-date"]')!.value = ymd(at);
            wrap.querySelector<HTMLInputElement>('[name="event-end"]')!.value = localInputValue(finish);
            const exceptions = wrap.querySelector<HTMLElement>('.pl-exceptions'); if (exceptions) exceptions.hidden = !whole;
            wrap.querySelector<HTMLElement>('.pl-scope-note')!.textContent = t(whole ? 'planner.groupSeriesHint' : 'planner.groupDayHint');
            syncAllDay(); syncRepeat(); syncLinked();
        });
        wrap.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach(button => button.addEventListener('click', async () => {
            updateOccurrence(ev!.extendedProps.localSeriesId as string, button.dataset.restore!, null);
            closeModal(true); if (lastRange) await reload(lastRange.start, lastRange.end);
        }));
        wrap.addEventListener('input', (e) => {
            wrap.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.setCustomValidity(''));
            if (e.target === repeatStartInput) repeatStartTouched = true;
            if (!repeatStartTouched) repeatStartInput.value = wrap.querySelector<HTMLInputElement>(allDayBox.checked ? '[name="event-start-date"]' : '[name="event-start"]')!.value.slice(0, 10);
            wrap.querySelector<HTMLInputElement>('[name="event-repeat-until"]')!.min = repeatStartInput.value;
        });
        wrap.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(true); });

        wrap.querySelector('.pl-modal-x')!.addEventListener('click', () => closeModal(true));
        wrap.querySelector('.pl-modal-cancel')!.addEventListener('click', () => closeModal(true));
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap) closeModal(true);
        });
        wrap.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const targets = [...wrap.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0);
                const first = targets[0], last = targets[targets.length - 1];
                if (e.shiftKey && document.activeElement === first && last) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last && first) { e.preventDefault(); first.focus(); }
                return;
            }
            if (e.key !== 'Escape') return;
            /* ESC 메뉴가 같이 열리지 않게 */
            e.preventDefault();
            e.stopPropagation();
            closeModal(true);
        });
        wrap.querySelector<HTMLInputElement>('[name="event-title"]')!.focus();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = wrap.querySelector<HTMLInputElement>('[name="event-title"]')!.value.trim();
            if (!title) return;
            if (!allDayBox.checked) for (const side of ['before', 'after']) {
                const input = wrap.querySelector<HTMLInputElement>(`[name="link-${side}-title"]`)!;
                if (wrap.querySelector<HTMLInputElement>(`[name="link-${side}"]`)!.checked && !input.value.trim()) { input.setCustomValidity(t('planner.groupLinkTitle')); input.reportValidity(); return; }
            }
            const isAllDay = allDayBox.checked;
            let start: Date;
            let end: Date;
            if (isAllDay) {
                const dateStr = wrap.querySelector<HTMLInputElement>('[name="event-start-date"]')!.value;
                const [y, m, d] = dateStr.split('-').map(Number);
                start = new Date(y, m - 1, d);
                end = new Date(y, m - 1, d);
            } else {
                start = new Date(wrap.querySelector<HTMLInputElement>('[name="event-start"]')!.value);
                end = new Date(wrap.querySelector<HTMLInputElement>('[name="event-end"]')!.value);
                if (!(end > start)) { const input = wrap.querySelector<HTMLInputElement>('[name="event-end"]')!; input.setCustomValidity(t('planner.groupTimeInvalid')); input.reportValidity(); return; }
            }
            const calId =
                (wrap.querySelector<HTMLSelectElement>('[name="event-calendar"]')?.value as string) || currentCal;
            if (!Number.isFinite(+start) || !Number.isFinite(+end)) {
                const input = wrap.querySelector<HTMLInputElement>(isAllDay ? '[name="event-start-date"]' : '[name="event-start"]')!;
                input.setCustomValidity(t('planner.repeatDateInvalid')); input.reportValidity(); return;
            }
            let repeat: RepeatRule | null | undefined = googleInstance ? undefined : null;
            if (!googleInstance && scope?.value !== 'day' && repeatSelect.value !== 'none') {
                const days = [...repeatDays.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => Number(input.value));
                if (repeatSelect.value === 'weekly' && !days.length) {
                    const input = repeatDays.querySelector<HTMLInputElement>('input')!;
                    input.setCustomValidity(t('planner.repeatDaysRequired')); input.reportValidity(); return;
                }
                const until = wrap.querySelector<HTMLInputElement>('[name="event-repeat-until"]')!;
                repeat = { frequency: repeatSelect.value as RepeatRule['frequency'], days, startDate: repeatStartInput.value, interval: Number(wrap.querySelector<HTMLInputElement>('[name="event-repeat-interval"]')!.value), ...(until.value ? { until: until.value } : {}), ...(excludeHolidays.checked ? { excludeHolidays: true } : {}) };
                if (repeat.excludeHolidays && !holidayRangeSupported(start, repeat)) { until.setCustomValidity(t('planner.repeatHolidayRange')); until.reportValidity(); return; }
                const first = repeatWindow(start, end, repeat).start;
                if (!Number.isFinite(+first) || (until.value && until.value < ymd(first))) { until.setCustomValidity(t('planner.repeatDateInvalid')); until.reportValidity(); return; }
            }
            const submit = wrap.querySelector<HTMLButtonElement>('[type="submit"]')!;
            submit.disabled = true;
            form.setAttribute('aria-busy', 'true');
            const links: LinkedEvent[] = linkedAllDay() ? [] : (['before', 'after'] as const).filter(side => wrap.querySelector<HTMLInputElement>(`[name="link-${side}"]`)!.checked).map(side => ({ side, title: wrap.querySelector<HTMLInputElement>(`[name="link-${side}-title"]`)!.value.trim(), minutes: Number(wrap.querySelector<HTMLInputElement>(`[name="link-${side}-minutes"]`)!.value), gap: Number(wrap.querySelector<HTMLInputElement>(`[name="link-${side}-gap"]`)!.value) }));
            const ok = await save(title, start, end, isAllDay, calId, ev, repeat, links, scope?.value === 'day', selectedColor);
            if (modalEl !== wrap) return;
            if (ok) closeModal(true);
            else { const error = wrap.querySelector<HTMLElement>('.pl-form-error')!; error.hidden = false; error.textContent = t('planner.t32'); submit.disabled = false; form.removeAttribute('aria-busy'); }
        });
    }

    /** 저장할 값. 종일이면 날짜만, 아니면 ISO 시각 (구글, FullCalendar 와 같은 규약) */
    function stored(start: Date, end: Date, allDay: boolean): { start: string; end: string } {
        if (!allDay) return { start: start.toISOString(), end: end.toISOString() };
        const s = ymd(start);
        const e = ymd(end);
        return { start: s, end: e > s ? e : ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)) };
    }

    async function save(
        title: string,
        start: Date,
        end: Date,
        allDay: boolean,
        calId: string,
        ev?: EventApi,
        repeat?: RepeatRule | null,
        linkedEvents: LinkedEvent[] = [],
        single = false,
        color = ''
    ): Promise<boolean> {
        try {
            /* 어디에 쓸지는 **id 앞머리**가 정한다. 이 브라우저 것과 구글 것이 한 화면에 섞여 있다 */
            if (ev && isLocal(ev.id)) {
                if (single && ev.extendedProps.localSeriesId) {
                    const times = stored(start, end, allDay);
                    const patch = {
                        ...(color !== ev.extendedProps.seriesColor ? { color } : {}),
                        ...(title !== ev.extendedProps.seriesTitle ? { title } : {}),
                        ...(allDay !== ((ev.extendedProps.seriesStart as string).length === 10) ? { allDay } : {}),
                        ...(times.start !== ev.extendedProps.occurrenceStart ? { start: times.start } : {}),
                        ...(times.end !== ev.extendedProps.occurrenceEnd ? { end: times.end } : {})
                    };
                    updateOccurrence(ev.extendedProps.localSeriesId as string, ev.extendedProps.occurrenceDate as string, Object.keys(patch).length ? patch : null);
                    updateLocalEvent(ev.extendedProps.localSeriesId as string, { linkedEvents });
                }
                else updateLocalEvent((ev.extendedProps.localSeriesId as string) || ev.id, { title, allDay, color, repeat, linkedEvents, ...(repeat === null ? { exceptions: {} } : {}), ...stored(start, end, allDay) });
            } else if (ev) {
                const id = !single && ev.extendedProps.recurringEventId ? ev.extendedProps.recurringEventId as string : ev.extendedProps.googleId as string;
                const grouped = !!ev.extendedProps.recurringEventId;
                if (grouped && !ev.extendedProps.seriesStart) throw new Error('Group metadata unavailable');
                const links = single && grouped ? undefined : linkedEvents;
                const omit: Array<'summary' | 'start' | 'end'> = [];
                const recurrence = !single && ev.extendedProps.recurringEventId && ev.extendedProps.seriesStart ? shiftExDates(ev.extendedProps.seriesRecurrence as string[] | undefined, new Date(ev.extendedProps.seriesStart as string), start) : undefined;
                if (single) {
                    if (title === ev.title) omit.push('summary');
                    if (allDay === ev.allDay && +start === +(ev.start || NaN)) omit.push('start');
                    if (allDay === ev.allDay && +end === +(ev.end || NaN)) omit.push('end');
                }
                if (single && grouped && (!ev.extendedProps.commonLinks || JSON.stringify(linkedEvents) !== JSON.stringify(parseLinks(ev.extendedProps.seriesLinks)))) {
                    await withToken(token!, (tok) => patchEvent(tok, calId, ev.extendedProps.recurringEventId as string, { linkedEvents, commonLinks: true, start, end, allDay }, ['summary', 'start', 'end']));
                }
                if (!single || omit.length !== 3 || color !== ev.extendedProps.colorId) await withToken(token!, (tok) => patchEvent(tok, calId, id, { title, start, end, allDay, colorId: color, repeat, linkedEvents: links, commonLinks: true, recurrence }, omit));
            } else if (calId === LOCAL_CALENDAR_ID || !token) {
                createLocalEvent({ title, allDay, color, repeat, linkedEvents, ...stored(start, end, allDay) });
            } else {
                await withToken(token, (tok) => createEvent(tok, calId, { title, start, end, allDay, colorId: color, repeat, linkedEvents, commonLinks: true }));
            }
            if (lastRange) await reload(lastRange.start, lastRange.end);
            return true;
        } catch {
            toast(t('planner.t32'), 'error');
            return false;
        }
    }

    async function saveMove(ev: EventApi, revert: () => void): Promise<void> {
        const start = ev.start ?? new Date();
        const end = ev.end ?? addHours(start, 1);
        if (isLocal(ev.id)) {
            updateLocalEvent(ev.id, { allDay: ev.allDay, ...stored(start, end, ev.allDay) });
            if (lastRange) await reload(lastRange.start, lastRange.end);
            return;
        }
        try {
            await withToken(token!, (tok) =>
                patchEvent(tok, ev.extendedProps.calendarId as string, ev.extendedProps.googleId as string, {
                    start,
                    end,
                    allDay: ev.allDay
                })
            );
            if (lastRange) await reload(lastRange.start, lastRange.end);
        } catch {
            revert();
            toast(t('planner.t32'), 'error');
        }
    }

    /* ===== 일정 하나 눌렀을 때 ===== */

    let popoverEl: HTMLElement | null = null;
    let popoverOpener: HTMLElement | null = null;

    /* 바깥 누름으로 닫을 때는 초점을 안 돌림 (누른 자리가 초점을 가져감) */
    function closePopover(restore = false): void {
        popoverEl?.remove();
        popoverEl = null;
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onPopoverKey, true);
        const back = popoverOpener;
        popoverOpener = null;
        if (restore && back?.isConnected) back.focus();
    }

    function onPopoverKey(e: KeyboardEvent): void {
        if (e.key !== 'Escape' || !popoverEl) return;
        e.preventDefault();
        e.stopPropagation();
        closePopover(true);
    }

    function onOutside(e: MouseEvent): void {
        if (popoverEl && !popoverEl.contains(e.target as Node)) closePopover();
    }

    function openPopover(ev: EventApi, atX: number, atY: number, opener?: HTMLElement): void {
        const linked = !!ev.extendedProps.parentEventId;
        if (linked) { const parent = calendar.getEventById(ev.extendedProps.parentEventId as string); if (!parent) return; ev = parent; }
        closePopover();
        closeModal();
        popoverOpener = opener ?? null;
        const link = (ev.extendedProps.htmlLink as string) || '';
        const calName = (ev.extendedProps.calendarName as string) || '';
        const isAi = ev.extendedProps.calendarId === AI_CALENDAR_ID;
        const isAnime = ev.extendedProps.calendarId === ANIME_CALENDAR_ID;
        const doc = (ev.extendedProps.doc as string) || '';
        const box = document.createElement('div');
        box.className = 'pl-pop';
        box.innerHTML = `
            <div class="pl-pop-head">
                <span class="pl-pop-dot" style="background:${esc(ev.backgroundColor || '#4285f4')}"></span>
                <button type="button" class="pl-modal-x" aria-label="${esc(t('planner.t18'))}">✕</button>
            </div>
            <div class="pl-pop-title">${esc(ev.title)}</div>
            <div class="pl-pop-time">${esc(describeWhen(ev))}</div>
            ${linked || parseLinks(ev.extendedProps.linkedEvents).length ? `<div class="pl-pop-cal">${esc(t('planner.groupParent', { title: ev.title }))}</div>` : ''}
            ${calName ? `<div class="pl-pop-cal">${esc(calName)}</div>` : ''}
            ${isAnime ? `<a class="btn btn-ghost" href="${esc(link)}" target="_blank" rel="noopener noreferrer">작품 보기</a>` : isAi ? `<div class="pl-pop-cal">${esc(t('planner.t98'))}${doc ? ` <code>${esc(doc)}</code>` : ''}</div>` : `
            <div class="pl-pop-actions">
                <button type="button" class="btn btn-ghost pl-pop-edit">${esc(t('planner.t16'))}</button>
                ${link ? `<a class="btn btn-ghost" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Google ↗</a>` : ''}
                <button type="button" class="btn btn-ghost pl-pop-del">${esc(t(ev.extendedProps.localSeriesId || ev.extendedProps.recurringEventId ? 'planner.groupSkipDay' : 'planner.t33'))}</button>
                ${ev.extendedProps.localSeriesId || ev.extendedProps.recurringEventId ? `<button type="button" class="btn btn-ghost pl-pop-del-series">${esc(t('planner.groupDeleteSeries'))}</button>` : ''}
                ${ev.extendedProps.occurrenceChanged ? `<button type="button" class="btn btn-ghost pl-pop-restore">${esc(t('planner.groupRestore'))}</button>` : ''}
            </div>`}`;
        container.appendChild(box);
        popoverEl = box;

        /* 화면 밖으로 안 나가게 */
        const rect = box.getBoundingClientRect();
        const host = container.getBoundingClientRect();
        box.style.left = `${Math.max(8, Math.min(atX - host.left, host.width - rect.width - 8))}px`;
        box.style.top = `${Math.max(8, Math.min(atY - host.top + 8, host.height - rect.height - 8))}px`;
        (box.querySelector<HTMLElement>('.pl-pop-edit') ?? box.querySelector<HTMLElement>('.pl-modal-x'))?.focus();

        box.querySelector('.pl-modal-x')!.addEventListener('click', () => closePopover(true));
        box.querySelector('.pl-pop-edit')?.addEventListener('click', () => {
            const start = ev.start ?? new Date();
            /* 일정 칸으로 초점을 돌린 뒤 창을 연다. 창을 닫으면 그 칸으로 */
            closePopover(true);
            openModal({ start, end: ev.end ?? addHours(start, 1), allDay: ev.allDay, event: ev });
        });
        box.querySelector('.pl-pop-del')?.addEventListener('click', () => {
            closePopover();
            void remove(ev, ev.extendedProps.localSeriesId || ev.extendedProps.recurringEventId ? 'day' : 'series');
        });
        box.querySelector('.pl-pop-del-series')?.addEventListener('click', () => { closePopover(); void remove(ev, 'series'); });
        box.querySelector('.pl-pop-restore')?.addEventListener('click', async () => { closePopover(); updateOccurrence(ev.extendedProps.localSeriesId as string, ev.extendedProps.occurrenceDate as string, null); if (lastRange) await reload(lastRange.start, lastRange.end); });
        document.addEventListener('keydown', onPopoverKey, true);
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    }

    function describeWhen(ev: EventApi): string {
        const start = ev.start;
        if (!start) return '';
        const day = `${start.getFullYear()}. ${start.getMonth() + 1}. ${start.getDate()}`;
        if (ev.allDay) return day;
        const hm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return ev.end ? `${day} ${hm(start)} - ${hm(ev.end)}` : `${day} ${hm(start)}`;
    }

    async function remove(ev: EventApi, scope: 'day' | 'series' = 'series'): Promise<void> {
        if (!confirm(t(scope === 'day' ? 'planner.groupSkipConfirm' : ev.extendedProps.localSeriesId || ev.extendedProps.recurringEventId ? 'planner.groupDeleteSeriesConfirm' : 'planner.groupDeleteConfirm', { title: ev.title }))) return;
        try {
            if (isLocal(ev.id)) {
                if (scope === 'day' && ev.extendedProps.localSeriesId) updateOccurrence(ev.extendedProps.localSeriesId as string, ev.extendedProps.occurrenceDate as string, { cancelled: true });
                else deleteLocalEvent((ev.extendedProps.localSeriesId as string) || ev.id);
            } else await withToken(token!, (tok) => deleteEvent(tok, ev.extendedProps.calendarId as string, scope === 'series' && ev.extendedProps.recurringEventId ? ev.extendedProps.recurringEventId as string : ev.extendedProps.googleId as string));
            if (lastRange) await reload(lastRange.start, lastRange.end);
        } catch {
            toast(t('planner.t35'), 'error');
        }
    }

    container.querySelector('.pl-cal-create')!.addEventListener('click', () => {
        const now = new Date();
        openModal({ start: now, end: addHours(now, 1), allDay: false });
    });

    /* ===== 시작 ===== */

    let aiGoogleId: string | null = null;
    const hint = container.querySelector<HTMLElement>('.pl-cal-hint')!;
    /* 캘린더 목록도 저장본으로 먼저. 구글 목록을 기다리느라 첫 화면이 비지 않게 (event-cache.ts 와 같은 까닭) */
    const CALS_KEY = 'planner.gcal.v1:calendars';
    function useCalendars(mine: GoogleCalendar[]): void {
        /* 공휴일은 구독 안 했어도 늘 (Google 공개 대한민국 공휴일). 구독했으면 그것 */
        const holiday = mine.some((c) => isHolidayCalendar(c.id)) ? [] : [HOLIDAY_CALENDAR];
        /* 구글 'AI' 캘린더는 복사본이라 목록에 안 올린다 (원본 memo 를 그린다, 두 번 안 보이게) */
        const googleAi = mine.find((c) => c.summary === AI_GOOGLE_NAME);
        calendars = [localCalendar(), aiCalendar(), animeCalendar(), ...mine.filter((c) => c !== googleAi), ...holiday];
        aiGoogleId = googleAi ? googleAi.id : '';
    }
    void (async () => {
        if (loadFollowups) followups = await loadFollowups();
        const view = calendar.view;
        let shown = '';
        if (token) {
            try {
                const saved = JSON.parse(localStorage.getItem(CALS_KEY) || 'null');
                if (Array.isArray(saved) && !destroyed) {
                    useCalendars(saved);
                    renderList();
                    shown = JSON.stringify(saved);
                    void reload(view.activeStart, view.activeEnd);
                }
            } catch {
                /* 저장본이 없거나 막힌 브라우저 */
            }
            try {
                const mine = await withToken(token, fetchCalendars);
                useCalendars(mine);
                try {
                    localStorage.setItem(CALS_KEY, JSON.stringify(mine));
                } catch {
                    /* 막힌 브라우저 */
                }
                if (JSON.stringify(mine) === shown) shown = 'same';
            } catch {
                /* 구글이 안 되면 이 브라우저 것만으로 계속 쓴다. 화면이 통째로 죽지 않는다 */
                toast(t('planner.t36'), 'error');
            }
        }
        if (destroyed) return;
        /* 목록이 저장본과 같으면 이미 그린 것으로 충분하다 */
        if (shown !== 'same') {
            renderList();
            await reload(view.activeStart, view.activeEnd);
        }
        /* 구글 복사본 맞추기. 'AI' 캘린더가 없으면 만드는 법 한 줄 (앱은 일정 쓰기 권한뿐이라 못 만든다) */
        if (token && aiGoogleId === '') {
            hint.textContent = t('planner.t99');
            hint.hidden = false;
        } else if (token && aiGoogleId && followups.length) {
            /* reload 를 기다리는 사이 화면을 떠났으면 맞춤도 안 함 */
            if (destroyed) return;
            const calId = aiGoogleId;
            try {
                await withToken(token, (tok) => syncToGoogle(tok, calId, followups));
            } catch {
                /* 복사본이 늦을 뿐 원본은 그려져 있다. 다음에 열 때 다시 */
            }
        }
    })();

    const animeChanged = (): void => {
        if (!destroyed && lastRange) setEvents([...allEvents.filter(e => e.extendedProps.calendarId !== ANIME_CALENDAR_ID && !e.extendedProps.parentEventId), ...animeEvents(lastRange.start, lastRange.end)]);
    };
    window.addEventListener(ANIME_CHANGED, animeChanged);
    return {
        destroy: () => {
            destroyed = true;
            window.removeEventListener(ANIME_CHANGED, animeChanged);
            mobile.removeEventListener('change', adaptSettings);
            resize.disconnect();
            closePopover();
            closeModal();
            calendar.destroy();
        }
    };
}
