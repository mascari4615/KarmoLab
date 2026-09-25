/**
 * 구글 일정 캐시. 캘린더마다 받아 둔 구간과 일정, 마지막으로 받은 때 (2026-09-25)
 *
 * 까닭: 전에는 달을 넘기거나 방을 열 때마다 구글에서 일정 전부 받기, 달력 통째로 다시 그리기.
 * 사용자 요청 2026-09-25: 불러오되 캐싱, 바뀐 것만 바꾸기.
 * 방식: 저장본으로 먼저 그림, 뒤에서 마지막으로 받은 뒤 바뀐 것만 요청
 * (`updatedMin` + `showDeleted`, 지워진 일정은 status 'cancelled')
 *
 * 저장은 localStorage 한 칸씩 (캘린더 하나에 수십 KB). 막힌 브라우저면 예전처럼 매번 다 받기.
 * 로그아웃하면 `clearEventCache` (남의 화면에 내 일정이 남지 않게)
 */

import type { GoogleEvent } from './gcal';

const KEY_PREFIX = 'planner.gcal.v1:';
/** 구글과 이 브라우저의 시계가 어긋나도 바뀐 것을 놓치지 않게 마지막으로 받은 때를 조금 당겨 적는다 */
const SKEW_MS = 2 * 60 * 1000;
/** 저장본을 얼마나 멀리까지 들고 있나. 이보다 먼 것은 버린다 (한 칸이 끝없이 크지 않게) */
const KEEP_MS = 400 * 86400000;

export interface CachedCalendar {
    /** 받아 둔 구간 [from, to) ms. 이 안의 일정은 전부 알고 있다 */
    from: number;
    to: number;
    /** 이 시각 이후 바뀐 것만 물으면 된다 (ISO) */
    syncedAt: string;
    items: Record<string, GoogleEvent>;
}

/* ===== 순수 계산 (scripts/test-planner-core.mjs 가 잰다) ===== */

/** 구간 [from, to) 을 다 들고 있나 */
export function covers(entry: CachedCalendar | null, from: number, to: number): boolean {
    return !!entry && entry.from <= from && entry.to >= to;
}

function eventSpan(ev: GoogleEvent): [number, number] {
    const s = Date.parse(ev.start?.dateTime || ev.start?.date || '');
    const e = Date.parse(ev.end?.dateTime || ev.end?.date || '') || s;
    return [s, e];
}

/** 일정이 구간과 겹치나. 시각을 못 읽으면 겹친다고 본다 (버리는 것보다 남기는 것이 안전) */
export function overlaps(ev: GoogleEvent, from: number, to: number): boolean {
    const [s, e] = eventSpan(ev);
    if (!Number.isFinite(s)) return true;
    return s < to && Math.max(e, s) >= from;
}

/**
 * 구간을 통째로 새로 받았을 때. 그 구간 안의 옛 일정은 새 목록으로 교체, 밖은 유지
 * 새 구간이 옛 구간과 떨어져 있으면 사이를 모르니 옛 것은 버림
 */
export function mergeFull(entry: CachedCalendar | null, items: GoogleEvent[], from: number, to: number, syncedAt: string): CachedCalendar {
    const touching = !!entry && entry.from <= to && entry.to >= from;
    const out: Record<string, GoogleEvent> = {};
    if (entry && touching) {
        for (const [id, ev] of Object.entries(entry.items)) if (!overlaps(ev, from, to)) out[id] = ev;
    }
    for (const ev of items) if (ev && ev.id && ev.status !== 'cancelled') out[ev.id] = ev;
    return {
        from: touching ? Math.min(entry!.from, from) : from,
        to: touching ? Math.max(entry!.to, to) : to,
        syncedAt: touching && entry!.syncedAt < syncedAt ? entry!.syncedAt : syncedAt,
        items: out,
    };
}

/** 바뀐 것만 받았을 때. 지워진 것은 빼고 나머지는 덮어쓴다 */
export function mergeDelta(entry: CachedCalendar, changed: GoogleEvent[], syncedAt: string): { entry: CachedCalendar; changed: number } {
    const items = { ...entry.items };
    let n = 0;
    for (const ev of changed) {
        if (!ev || !ev.id) continue;
        if (ev.status === 'cancelled') {
            if (items[ev.id]) { delete items[ev.id]; n++; }
        } else if (JSON.stringify(items[ev.id]) !== JSON.stringify(ev)) {
            items[ev.id] = ev;
            n++;
        }
    }
    return { entry: { ...entry, items, syncedAt }, changed: n };
}

/** 구간 안의 일정만 */
export function eventsIn(entry: CachedCalendar | null, from: number, to: number): GoogleEvent[] {
    if (!entry) return [];
    return Object.values(entry.items).filter((ev) => overlaps(ev, from, to));
}

/** 너무 먼 것은 버린다 */
export function trim(entry: CachedCalendar, now: number): CachedCalendar {
    const from = Math.max(entry.from, now - KEEP_MS);
    const to = Math.min(entry.to, now + KEEP_MS);
    const items: Record<string, GoogleEvent> = {};
    for (const [id, ev] of Object.entries(entry.items)) if (overlaps(ev, from, to)) items[id] = ev;
    return { ...entry, from, to, items };
}

/** 받기 시작한 때를 조금 당겨 적는다 */
export function syncStamp(startedAt: number): string {
    return new Date(startedAt - SKEW_MS).toISOString();
}

/* ===== 저장 ===== */

export function loadCached(calendarId: string): CachedCalendar | null {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + calendarId);
        if (!raw) return null;
        const v = JSON.parse(raw) as CachedCalendar;
        if (typeof v.from !== 'number' || typeof v.to !== 'number' || !v.items) return null;
        return v;
    } catch {
        return null;
    }
}

export function saveCached(calendarId: string, entry: CachedCalendar): void {
    try {
        localStorage.setItem(KEY_PREFIX + calendarId, JSON.stringify(trim(entry, Date.now())));
    } catch {
        /* 꽉 찼거나 막힌 브라우저. 다음에 다시 다 받으면 된다 */
    }
}

export function clearEventCache(): void {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith(KEY_PREFIX)) localStorage.removeItem(k);
        }
    } catch {
        /* 막힌 브라우저 */
    }
}
