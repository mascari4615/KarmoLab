import type { FcEvent, GoogleCalendar } from '../planner/gcal';

export const DISCOVERY_PATH = 'data/discovery/feed.json';
export const DISCOVERY_CALENDAR_ID = 'karmo-discovery';
const COLOR = '#247b74';
export interface DiscoveryItem {
  id: string; sourceId: string; sourceName: string; category: string; kind: 'event' | 'news'; title: string; url: string;
  checkedAt: string; publishedAt?: string; start?: string; end?: string; location?: string;
}
export interface DiscoverySource { id: string; name: string; status: 'ok' | 'error'; checkedAt: string; lastSuccessAt: string | null; count: number; error?: string }
export interface DiscoveryFeed { schema: 'discovery-feed/1'; generatedAt: string; sources: DiscoverySource[]; items: DiscoveryItem[] }
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const dateOnly = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && timestamp(value) && new Date(value).toISOString().slice(0, 10) === value;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
export function sourceLink(value: string): string {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function parseDiscovery(value: unknown): DiscoveryFeed {
  const feed = value as DiscoveryFeed;
  if (!feed || feed.schema !== 'discovery-feed/1' || !timestamp(feed.generatedAt) || !Array.isArray(feed.sources) || !Array.isArray(feed.items)) throw new Error('정보 목록 형식 오류');
  const sources = new Set<string>(), ids = new Set<string>();
  for (const source of feed.sources) {
    if (!source || !text(source.id) || sources.has(source.id) || !text(source.name) || !['ok', 'error'].includes(source.status) || !timestamp(source.checkedAt) || (source.lastSuccessAt !== null && !timestamp(source.lastSuccessAt))) throw new Error('정보 출처 형식 오류');
    if (source.error !== undefined && typeof source.error !== 'string') throw new Error('정보 출처 오류 메타데이터 형식 오류');
    sources.add(source.id);
  }
  for (const item of feed.items) {
    if (!item || !text(item.id) || ids.has(item.id) || !sources.has(item.sourceId) || !text(item.title) || !text(item.sourceName) || !sourceLink(item.url) || !timestamp(item.checkedAt)) throw new Error('정보 항목 형식 오류');
    ids.add(item.id);
    if (item.kind === 'event') {
      if (!dateOnly(item.start) || !dateOnly(item.end) || item.end <= item.start) throw new Error('행사 날짜 형식 오류');
    } else if (item.kind !== 'news' || !timestamp(item.publishedAt)) throw new Error('소식 날짜 형식 오류');
  }
  return feed;
}
export const discoveryCalendar = (): GoogleCalendar => ({ id: DISCOVERY_CALENDAR_ID, summary: '게임, 서브컬처 행사', backgroundColor: COLOR });
export function discoveryEvents(feed: DiscoveryFeed | null): FcEvent[] {
  return (feed?.items || []).filter(item => item.kind === 'event').map(item => ({
    id: `discovery:${item.id}`, title: item.title, start: item.start!, end: item.end!, allDay: true,
    backgroundColor: COLOR, borderColor: COLOR, startEditable: false, durationEditable: false,
    extendedProps: { calendarId: DISCOVERY_CALENDAR_ID, calendarName: item.sourceName, googleId: `discovery:${item.id}`, htmlLink: sourceLink(item.url) },
  }));
}
