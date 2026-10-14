/**
 * 이 브라우저 안의 일정, 할 일. 구글 없이도 쓴다 (TASK-KL-321)
 *
 * 플래너는 원래 구글 연동이 **있어야만** 아무것도 보이는 게 없었다. 그건 우리 도구가 아니라
 * 구글 화면 한 겹이라는 뜻이다. 그래서 **여기 저장소를 정본으로 하나 둔다**. 연동은 얹는 것이다.
 *
 * 규칙 하나로 둘을 가른다: **id 앞머리.** 여기 것은 전부 `local__` 로 시작하고, 구글 것은
 * `<캘린더>__<일정>` 이다. 그래서 화면은 둘을 섞어 보여 주고, 고칠 때는 id 만 보고 어디로
 * 보낼지 안다. 두 벌의 화면 코드를 만들 필요가 없다.
 *
 * 모양은 구글 쪽과 **같은 것**(`FcEvent`)을 쓴다. 나중에 이 저장소를 서버로 옮기든
 * 일기를 얹든, 화면은 그대로다.
 */
import type { FcEvent, GoogleTask, KanbanColumn } from './gcal';
import { occurrences, type RepeatRule } from './recurrence';
import type { LinkedEvent } from './event-group';

export const LOCAL_PREFIX = 'local__';
export const LOCAL_CALENDAR_ID = 'local';
/** 이 브라우저 캘린더의 색. 구글 캘린더들과 섞여도 한눈에 갈리게 */
export const LOCAL_COLOR = '#8b5cf6';

const EVENTS_KEY = 'karmolab_planner_events';
const TASKS_KEY = 'karmolab_planner_tasks';

export function isLocal(id: string): boolean {
    return id.startsWith(LOCAL_PREFIX);
}

function read<T>(key: string): T[] {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function write<T>(key: string, items: T[]): void {
    try {
        localStorage.setItem(key, JSON.stringify(items));
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('planner-local-change'));
    } catch {
        /* 저장 못 해도 이번 화면은 돌아야 한다 */
    }
}

function newId(): string {
    return `${LOCAL_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ===== 일정 ===== */

export interface LocalEventInput {
    title: string;
    /** 종일이면 YYYY-MM-DD, 아니면 ISO 시각 */
    start: string;
    /** 끝은 다음이다. 구글, FullCalendar 와 같은 규약 */
    end: string;
    allDay: boolean;
    color?: string;
    repeat?: RepeatRule | null;
    linkedEvents?: LinkedEvent[];
    exceptions?: Record<string, { cancelled?: boolean; title?: string; start?: string; end?: string; allDay?: boolean; linkedEvents?: LinkedEvent[] }>;
}

/** 저장된 것 → 달력이 쓰는 모양. 구글에서 온 것과 **구분이 안 가게** 같은 틀로 낸다. */
export function toFcEvent(stored: LocalEventInput & { id: string }, calendarName: string): FcEvent {
    const color = stored.color || LOCAL_COLOR;
    const links = stored.linkedEvents ?? Object.entries(stored.exceptions || {}).sort(([a], [b]) => a.localeCompare(b)).find(([, exception]) => exception.linkedEvents?.length)?.[1].linkedEvents;
    return {
        id: stored.id,
        title: stored.title,
        start: stored.start,
        end: stored.end,
        allDay: stored.allDay,
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
            calendarId: LOCAL_CALENDAR_ID,
            calendarName,
            googleId: stored.id,
            htmlLink: '',
            linkedEvents: links,
            ...(stored.repeat ? { localSeriesId: stored.id, repeatRule: stored.repeat, seriesStart: stored.start, seriesEnd: stored.end, seriesTitle: stored.title, seriesLinks: links, exceptions: stored.exceptions } : {})
        },
        ...(stored.repeat ? { startEditable: false, durationEditable: false } : {})
    };
}

export function listEvents(calendarName: string, from?: Date, to?: Date): FcEvent[] {
    return read<LocalEventInput & { id: string }>(EVENTS_KEY).flatMap((e) => {
        const event = toFcEvent(e, calendarName);
        if (!e.repeat || !from || !to) return [event];
        const start = new Date(e.allDay ? `${e.start}T00:00:00` : e.start), end = new Date(e.allDay ? `${e.end}T00:00:00` : e.end);
        const key = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const originals = new Map(occurrences(start, end, e.repeat, from, to).map(item => [key(item.start), item]));
        for (const date of Object.keys(e.exceptions || {})) {
            const at = new Date(`${date}T00:00:00`), next = new Date(at); next.setDate(next.getDate() + 1);
            for (const item of occurrences(start, end, e.repeat, at, next)) if (key(item.start) === date) originals.set(date, item);
        }
        return [...originals].flatMap(([date, item]) => {
            const exception = e.exceptions?.[date];
            if (exception?.cancelled) return [];
            const result: FcEvent = {
            ...event,
            id: `${e.id}::${item.start.getFullYear()}-${item.start.getMonth() + 1}-${item.start.getDate()}`,
            start: e.allDay ? `${item.start.getFullYear()}-${String(item.start.getMonth() + 1).padStart(2, '0')}-${String(item.start.getDate()).padStart(2, '0')}` : item.start.toISOString(),
            end: e.allDay ? `${item.end.getFullYear()}-${String(item.end.getMonth() + 1).padStart(2, '0')}-${String(item.end.getDate()).padStart(2, '0')}` : item.end.toISOString(),
            ...exception,
            extendedProps: { ...event.extendedProps, occurrenceDate: date, occurrenceStart: e.allDay ? key(item.start) : item.start.toISOString(), occurrenceEnd: e.allDay ? key(item.end) : item.end.toISOString(), occurrenceChanged: !!exception }
            };
            return new Date(result.end.length === 10 ? `${result.end}T00:00:00` : result.end) > from && new Date(result.start.length === 10 ? `${result.start}T00:00:00` : result.start) < to ? [result] : [];
        });
    });
}

export function createEvent(input: LocalEventInput): string {
    const items = read<LocalEventInput & { id: string }>(EVENTS_KEY);
    const id = newId();
    items.push({ ...input, id });
    write(EVENTS_KEY, items);
    return id;
}

export function updateEvent(id: string, patch: Partial<LocalEventInput>): void {
    const items = read<LocalEventInput & { id: string }>(EVENTS_KEY);
    const at = items.findIndex((e) => e.id === id);
    if (at < 0) return;
    items[at] = { ...items[at], ...patch };
    if (patch.linkedEvents !== undefined && items[at].exceptions) {
        const exceptions = { ...items[at].exceptions };
        for (const [date, exception] of Object.entries(exceptions)) {
            const { linkedEvents: _legacyLinks, ...rest } = exception;
            if (Object.keys(rest).length) exceptions[date] = rest;
            else delete exceptions[date];
        }
        items[at].exceptions = exceptions;
    }
    write(EVENTS_KEY, items);
}

export function updateOccurrence(id: string, date: string, patch: NonNullable<LocalEventInput['exceptions']>[string] | null): void {
    const event = read<LocalEventInput & { id: string }>(EVENTS_KEY).find(e => e.id === id);
    if (!event) return;
    const exceptions = { ...event.exceptions };
    if (patch === null) delete exceptions[date];
    else exceptions[date] = patch;
    updateEvent(id, { exceptions });
}

export function deleteEvent(id: string): void {
    write(
        EVENTS_KEY,
        read<LocalEventInput & { id: string }>(EVENTS_KEY).filter((e) => e.id !== id)
    );
}

/* ===== 할 일 ===== */

interface StoredTask {
    id: string;
    title: string;
    notes?: string;
    column: KanbanColumn;
}

export function listTasks(): Record<KanbanColumn, GoogleTask[]> {
    const out: Record<KanbanColumn, GoogleTask[]> = { todo: [], inProgress: [], done: [] };
    for (const s of read<StoredTask>(TASKS_KEY)) {
        const col: KanbanColumn = s.column in out ? s.column : 'todo';
        out[col].push({
            id: s.id,
            title: s.title,
            notes: s.notes,
            status: col === 'done' ? 'completed' : 'needsAction'
        });
    }
    return out;
}

export function createTask(title: string): string {
    const items = read<StoredTask>(TASKS_KEY);
    const id = newId();
    items.push({ id, title, column: 'todo' });
    write(TASKS_KEY, items);
    return id;
}

export function moveTask(id: string, to: KanbanColumn): void {
    const items = read<StoredTask>(TASKS_KEY);
    const at = items.findIndex((x) => x.id === id);
    if (at < 0) return;
    items[at] = { ...items[at], column: to };
    write(TASKS_KEY, items);
}

export function deleteTask(id: string): void {
    write(
        TASKS_KEY,
        read<StoredTask>(TASKS_KEY).filter((x) => x.id !== id)
    );
}
