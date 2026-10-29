import type { FcEvent } from './gcal';
import { occurrences, type RepeatRule } from './recurrence';
import type { LinkedEvent } from './event-group';

export const LOCAL_PREFIX = 'local__';
export const LOCAL_CALENDAR_ID = 'local';
export const LOCAL_COLOR = '#8b5cf6';

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
    exceptions?: Record<string, { cancelled?: boolean; title?: string; start?: string; end?: string; allDay?: boolean; color?: string; linkedEvents?: LinkedEvent[] }>;
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
            eventColor: stored.color || '',
            ...(stored.repeat ? { localSeriesId: stored.id, repeatRule: stored.repeat, seriesStart: stored.start, seriesEnd: stored.end, seriesTitle: stored.title, seriesColor: stored.color || '', seriesLinks: links, exceptions: stored.exceptions } : {})
        },
        ...(stored.repeat ? { startEditable: false, durationEditable: false } : {})
    };
}

export function eventsFromRows(rows: Array<LocalEventInput & { id: string }>, calendarName: string, from?: Date, to?: Date): FcEvent[] {
    return rows.flatMap((e) => {
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
                backgroundColor: exception?.color || (exception?.color === '' ? LOCAL_COLOR : event.backgroundColor),
                borderColor: exception?.color || (exception?.color === '' ? LOCAL_COLOR : event.borderColor),
                extendedProps: { ...event.extendedProps, eventColor: exception?.color ?? e.color ?? '', occurrenceDate: date, occurrenceStart: e.allDay ? key(item.start) : item.start.toISOString(), occurrenceEnd: e.allDay ? key(item.end) : item.end.toISOString(), occurrenceChanged: !!exception }
            };
            return new Date(result.end.length === 10 ? `${result.end}T00:00:00` : result.end) > from && new Date(result.start.length === 10 ? `${result.start}T00:00:00` : result.start) < to ? [result] : [];
        });
    });
}

