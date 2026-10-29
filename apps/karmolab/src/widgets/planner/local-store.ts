/**
 * 일정과 할 일의 로컬 읽기 캐시, 로그인한 Dash의 공통 동기화 저장 경로.
 *
 * 플래너는 원래 구글 연동이 **있어야만** 아무것도 보이는 게 없었다. 그건 우리 도구가 아니라
 * 구글 화면 한 겹이라는 뜻이다. 구글 연동과 독립적인 기록, 동기화는 sync-store 담당.
 *
 * 규칙 하나로 둘을 가른다: **id 앞머리.** 여기 것은 전부 `local__` 로 시작하고, 구글 것은
 * `<캘린더>__<일정>` 이다. 그래서 화면은 둘을 섞어 보여 주고, 고칠 때는 id 만 보고 어디로
 * 보낼지 안다. 두 벌의 화면 코드를 만들 필요가 없다.
 *
 * 모양은 구글 쪽과 **같은 것**(`FcEvent`)을 쓴다. 나중에 이 저장소를 서버로 옮기든
 * 일기를 얹든, 화면은 그대로다.
 */
import type { FcEvent, GoogleTask, KanbanColumn } from './gcal';
import { writePlannerCollection } from './sync-store';

import { LOCAL_PREFIX, eventsFromRows, type LocalEventInput } from './event-model';
export { LOCAL_PREFIX, LOCAL_CALENDAR_ID, LOCAL_COLOR, toFcEvent, type LocalEventInput } from './event-model';

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
    writePlannerCollection(key, items);
}

function newId(): string {
    return `${LOCAL_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ===== 일정 ===== */

export function listEvents(calendarName: string, from?: Date, to?: Date): FcEvent[] {
    return eventsFromRows(read<LocalEventInput & { id: string }>(EVENTS_KEY), calendarName, from, to);
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
