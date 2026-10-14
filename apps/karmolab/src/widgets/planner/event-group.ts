import type { FcEvent } from './gcal';

export interface LinkedEvent {
    side: 'before' | 'after';
    title: string;
    minutes: number;
    gap: number;
}

export function shiftExDates(lines: string[] | undefined, previous: Date, next: Date): string[] | undefined {
    if (!lines || previous.getHours() === next.getHours() && previous.getMinutes() === next.getMinutes()) return undefined;
    let changed = false;
    const shifted = lines.map(line => {
        if (!line.startsWith('EXDATE:')) {
            if (line.startsWith('EXDATE') && !line.startsWith('EXDATE;VALUE=DATE:')) throw new Error('Unsupported EXDATE timezone');
            return line;
        }
        const values = line.slice(7).split(',').map(value => {
            const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
            if (!m) throw new Error('Unsupported EXDATE format');
            const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
            at.setHours(next.getHours(), next.getMinutes(), next.getSeconds(), 0);
            return at.toISOString().replace(/[-:]/g, '').replace('.000', '');
        });
        changed = true; return `EXDATE:${values.join(',')}`;
    });
    return changed ? shifted : undefined;
}

export function parseLinks(value: unknown): LinkedEvent[] {
    try {
        const items: unknown = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(items)) return [];
        return items.filter((x): x is LinkedEvent => !!x && (x.side === 'before' || x.side === 'after') && typeof x.title === 'string' && x.title.trim().length > 0 && x.title.length <= 100 && Number.isInteger(x.minutes) && x.minutes > 0 && x.minutes <= 1440 && Number.isInteger(x.gap) && x.gap >= 0 && x.gap <= 1440).slice(0, 2);
    } catch { return []; }
}

export function withLinkedEvents(events: FcEvent[]): FcEvent[] {
    return events.flatMap((parent) => {
        if (parent.allDay || parent.extendedProps.parentEventId) return [parent];
        const start = Date.parse(parent.start), end = Date.parse(parent.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [parent];
        const children = parseLinks(parent.extendedProps.linkedEvents).map((link, index): FcEvent => {
            const a = link.side === 'before' ? start - (link.gap + link.minutes) * 60000 : end + link.gap * 60000;
            return { ...parent, id: `${parent.id}::link:${index}`, title: link.title, start: new Date(a).toISOString(), end: new Date(a + link.minutes * 60000).toISOString(), startEditable: false, durationEditable: false,
                extendedProps: { ...parent.extendedProps, parentEventId: parent.id, parentTitle: parent.title, linkedEvents: undefined } };
        });
        return [parent, ...children];
    });
}
