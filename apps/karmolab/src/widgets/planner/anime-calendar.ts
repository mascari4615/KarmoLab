import type { FcEvent, GoogleCalendar } from './gcal';

export interface AnimeItem { id: number | string; title: string; publishedAt: string; weekdays: string[]; provider?: 'netflix'; url?: string; releases?: string[] }
export const ANIME_CALENDAR_ID = 'karmo-anime';
export const ANIME_CHANGED = 'planner-anime-change';
const shared = globalThis as typeof globalThis & { KarmoPlannerAnime?: AnimeItem[] };
export function updateAnimeCalendar(next: AnimeItem[]): void { shared.KarmoPlannerAnime = next; window.dispatchEvent(new Event(ANIME_CHANGED)); }
export const animeCalendar = (): GoogleCalendar => ({ id: ANIME_CALENDAR_ID, summary: '애니 업로드', backgroundColor: '#c05b20' });
const kstKey = (at: number): string => new Date(at + 9 * 3600000).toISOString().slice(0, 10);

export function animeEvents(from: Date, to: Date, source = shared.KarmoPlannerAnime || [], now = Date.now()): FcEvent[] {
    const result: FcEvent[] = [], weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const event = (a: AnimeItem, date: string, actual: boolean): FcEvent => ({
        id: `anime:${a.id}:${date}`, title: `${actual ? '업로드' : '편성 예정'}: ${a.title}`,
        start: date, end: kstKey(Date.parse(date + 'T00:00:00+09:00') + 86400000), allDay: true,
        backgroundColor: '#c05b20', borderColor: '#c05b20', startEditable: false, durationEditable: false,
        extendedProps: { calendarId: ANIME_CALENDAR_ID, calendarName: actual ? '실제 업로드' : '요일 편성, 시각 미정', googleId: String(a.id), htmlLink: `https://laftel.net/item/${a.id}` },
    });
    for (const a of source) {
        if (a.provider === 'netflix') {
            for (const release of a.releases || []) {
                const at = Date.parse(release);
                if (!Number.isFinite(at) || at < +from || at >= +to) continue;
                result.push({
                    id: `anime:${a.id}:${release}`, title: `넷플릭스 공개 예정: ${a.title}`,
                    start: release, end: new Date(at + 60000).toISOString(), allDay: false,
                    backgroundColor: '#c05b20', borderColor: '#c05b20', startEditable: false, durationEditable: false,
                    extendedProps: { calendarId: ANIME_CALENDAR_ID, calendarName: '넷플릭스 공식 공개 일정, 실제 업로드 미확인', googleId: String(a.id), htmlLink: `https://www.netflix.com/title/${encodeURIComponent(String(a.id).replace(/^netflix:/, ''))}` },
                });
            }
            continue;
        }
        const published = Date.parse(a.publishedAt);
        if (!Number.isFinite(published)) continue;
        const date = kstKey(published);
        if (published <= now && Date.parse(date + 'T00:00:00+09:00') >= +from && Date.parse(date + 'T00:00:00+09:00') < +to) result.push(event(a, date, true));
        for (let at = Date.parse(kstKey(Math.max(+from, now)) + 'T00:00:00+09:00'); at < +to; at += 86400000) {
            const day = new Date(at + 9 * 3600000).getUTCDay(), key = kstKey(at);
            if (a.weekdays.includes(weekdays[day]) && !(published <= now && key === date)) result.push(event(a, key, false));
        }
    }
    return result;
}
