export interface RepeatRule {
    frequency: 'daily' | 'weekly';
    interval: number;
    days: number[];
    startDate?: string;
    until?: string;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const civilDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
const dateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function repeatWindow(start: Date, end: Date, rule: RepeatRule): { start: Date; end: Date } {
    if (!rule.startDate) return { start, end };
    const [y, m, day] = rule.startDate.split('-').map(Number);
    const first = new Date(y, m - 1, day, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
    if (!Number.isFinite(+first)) return { start: first, end: first };
    if (rule.frequency === 'weekly') {
        const interval = Math.max(1, Math.min(52, Math.trunc(rule.interval) || 1));
        const week = civilDay(first) - first.getDay();
        if (!rule.days.some((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return { start: new Date(NaN), end: new Date(NaN) };
        while (!rule.days.includes(first.getDay()) || Math.floor((civilDay(first) - week) / 7) % interval !== 0) first.setDate(first.getDate() + 1);
    }
    const span = civilDay(end) - civilDay(start);
    const finish = new Date(first.getFullYear(), first.getMonth(), first.getDate() + span, end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
    return { start: first, end: finish };
}

export function toRRule(rule: RepeatRule, allDay: boolean): string {
    const parts = [`FREQ=${rule.frequency.toUpperCase()}`, `INTERVAL=${rule.interval}`];
    if (rule.frequency === 'weekly') {
        parts.push('WKST=SU');
        parts.push(`BYDAY=${[...new Set(rule.days)].sort().map((d) => DAY_CODES[d]).join(',')}`);
    }
    if (rule.until) {
        const until = allDay ? rule.until.replace(/-/g, '') : new Date(`${rule.until}T23:59:59`).toISOString().replace(/[-:]/g, '').replace('.000', '');
        parts.push(`UNTIL=${until}`);
    }
    return `RRULE:${parts.join(';')}`;
}

export function occurrences(start: Date, end: Date, rule: RepeatRule, from: Date, to: Date): Array<{ start: Date; end: Date }> {
    ({ start, end } = repeatWindow(start, end, rule));
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || !(to > from)) return [];
    const interval = Math.max(1, Math.min(52, Math.trunc(rule.interval) || 1));
    const span = civilDay(end) - civilDay(start);
    const anchor = civilDay(start);
    const weekAnchor = anchor - start.getDay();
    const first = new Date(from);
    first.setDate(first.getDate() - Math.max(1, span));
    first.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
    if (first < start) first.setTime(+start);
    const result: Array<{ start: Date; end: Date }> = [];
    for (let d = first; d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())) {
        if (rule.until && dateKey(d) > rule.until) break;
        const offset = civilDay(d) - anchor;
        const match = rule.frequency === 'daily' ? offset % interval === 0 : Math.floor((civilDay(d) - weekAnchor) / 7) % interval === 0 && rule.days.includes(d.getDay());
        if (!match) continue;
        const finish = new Date(d.getFullYear(), d.getMonth(), d.getDate() + span, end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
        if (finish > from && d < to) result.push({ start: new Date(d), end: finish });
    }
    return result;
}
