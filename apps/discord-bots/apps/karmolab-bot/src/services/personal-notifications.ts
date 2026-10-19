import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';
import { notificationServices } from './notification-services';
import type { APIEmbed } from 'discord.js';
import { compactEmbed, notificationColors } from './notification-format';

export interface AgendaEvent { id: string; title: string; start: string; end: string; allDay: boolean; source?: string }
export interface AgendaTask { id: string; title: string; due?: string; status?: string }
export interface AnimeUpdate { id: number | string; title: string; publishedAt: string; weekdays: string[]; provider?: 'netflix'; url?: string; releases?: string[] }
interface NetflixTitle { id: string; title: string; releases: string[]; firstEpisode?: number }
interface CatalogEpisode { id: number; number: string; title: string; publishedAt: string; available: boolean }
interface CatalogTitle { id: number; title: string; episodes: CatalogEpisode[] }
export interface AnimeEpisode { key: string; animeId: string; title: string; provider: 'laftel' | 'netflix'; publishedAt: string; url: string; scheduled: boolean; watchedAt?: string; episodeId?: number; episodeNumber?: string; episodeTitle?: string; archived?: boolean }
export interface NotificationSettings { enabled: boolean; hour: number; minute: number; reminderMinutes: number; animeIds: number[] }
interface LocalSnapshot { localEvents: AgendaEvent[]; localTasks: AgendaTask[]; localUpdatedAt?: string; localThrough?: string }
interface SavedConnection { refreshToken?: string; snapshots: Record<string, LocalSnapshot> }
interface SavedState { daily?: string; reminders: Record<string, string>; episodes: Record<string, string>; homework?: Record<string, AnimeEpisode>; lastSentAt?: string }
export interface AgendaReport {
  collectedAt: string; connected: boolean; settings: NotificationSettings; localUpdatedAt?: string;
  errors: string[]; events: AgendaEvent[]; tasks: AgendaTask[]; anime: AnimeUpdate[]; lastSentAt?: string;
  homework?: AnimeEpisode[];
}
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const kstDate = (now: number): string => new Date(now + 9 * 60 * MINUTE).toISOString().slice(0, 10);
export const eventTime = (value: string): number => Date.parse(value.length === 10 ? `${value}T00:00:00+09:00` : value);
const publishedTime = (value: string): string => /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + '+09:00';

export function agendaSelection(report: AgendaReport, now: number): { today: AgendaEvent[]; upcoming: AgendaEvent[]; tasks: AgendaTask[]; upcomingTasks: AgendaTask[] } {
  const today = kstDate(now), midnight = eventTime(today), tomorrow = midnight + DAY;
  return {
    today: report.events.filter(e => eventTime(e.start) < tomorrow && eventTime(e.end) > midnight),
    upcoming: report.events.filter(e => eventTime(e.start) >= tomorrow && eventTime(e.start) < midnight + 8 * DAY),
    tasks: report.tasks.filter(t => t.status !== 'completed' && (!t.due || t.due.slice(0, 10) <= today)),
    upcomingTasks: report.tasks.filter(t => t.status !== 'completed' && t.due && t.due.slice(0, 10) > today && t.due.slice(0, 10) < kstDate(midnight + 8 * DAY)),
  };
}

export function reminderKey(e: AgendaEvent): string { return `${e.id}|${e.start}`; }
export function dueReminders(report: AgendaReport, sent: Record<string, string>, now: number): AgendaEvent[] {
  return report.events.filter(e => !e.allDay && eventTime(e.start) > now && eventTime(e.start) - now <= report.settings.reminderMinutes * MINUTE && !sent[reminderKey(e)]);
}

function summarySections(report: AgendaReport, now: number, limit = 5): { name: string; value: string }[] {
  const { today, upcoming, tasks, upcomingTasks } = agendaSelection(report, now);
  const time = (e: AgendaEvent): string => e.allDay ? '종일' : new Date(eventTime(e.start)).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  const short = (title: string): string => (title || '(제목 없음)').replace(/\s+/g, ' ').slice(0, 60);
  const lines = (items: string[]): string => items.slice(0, limit).join('\n') + (items.length > limit ? `\n외 ${items.length - limit}개` : '') || '없음';
  return [
    { name: '오늘 할 일', value: lines(tasks.map(t => `${short(t.title)}${t.due ? ' (마감 ' + t.due.slice(0, 10) + ')' : ''}`)) },
    { name: '오늘 일정', value: lines(today.map(e => `${time(e)} ${short(e.title)}`)) },
    { name: '다음 7일', value: lines([...upcoming.map(e => `${kstDate(eventTime(e.start))} ${time(e)} ${short(e.title)}`), ...upcomingTasks.map(t => `${t.due!.slice(0, 10)} 마감 ${short(t.title)}`)]) },
    { name: '애니 업로드와 공개 일정', value: lines(report.anime.flatMap(a => a.provider === 'netflix'
      ? (a.releases || []).filter(at => kstDate(Date.parse(at)) === kstDate(now)).map(at => `[넷플릭스] ${short(a.title)} ${new Date(at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })} 공개 예정`)
      : Date.parse(a.publishedAt) >= now - DAY && Date.parse(a.publishedAt) <= now ? [`${short(a.title)} 새 에피소드`] : [])) },
    { name: `안 본 애니 ${(report.homework || []).filter(a => !a.watchedAt && !a.archived).length}회`, value: lines((report.homework || []).filter(a => !a.watchedAt && !a.archived).map(a => `${short(a.title)} (${a.episodeNumber ? a.episodeNumber + '화' : kstDate(Date.parse(a.publishedAt)) + ' 공개분'}${a.scheduled ? ', 공개 일정 기준' : ''})`)) },
    ...(report.errors.length ? [{ name: '확인 필요', value: report.errors.join(', ').slice(0, 500) }] : []),
  ];
}
export function summaryText(report: AgendaReport, now: number): string {
  return [`${kstDate(now)} 오늘 안내`, ...summarySections(report, now).map(section => `${section.name}\n${section.value}`)].join('\n\n').slice(0, 1800) + '\n\nhttps://dash.mascari4615.com/#planner';
}
export function summaryEmbed(report: AgendaReport, now: number): APIEmbed {
  const fields = summarySections(report, now, 3).filter(section => section.value !== '없음');
  return { color: notificationColors.schedule, description: `**오늘 안내** ${kstDate(now)} / [플래너](https://dash.mascari4615.com/#planner)${fields.length ? '' : '\n일정과 할 일 없음'}`, fields };
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
function saveJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class PersonalNotifications {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private report: AgendaReport | null = null;
  private connection: SavedConnection;
  private state: SavedState;
  private access: { token: string; expires: number } | null = null;
  private lastCollection = 0;
  private storageError = false;
  private connectionVersion = 0;
  private readonly connectionFile: string;
  private readonly stateFile: string;
  private readonly liveEpisodes = new Map<number, { latest: string; episodes: CatalogEpisode[] }>();
  constructor(private readonly memoRoot: string, private readonly send: (text: string, embed: APIEmbed) => Promise<void>, private readonly dataRoot = path.join(PKG_ROOT, 'data'), private readonly request: typeof fetch = fetch) {
    this.connectionFile = path.join(dataRoot, 'personal-notifications-connection.json');
    this.stateFile = path.join(dataRoot, 'personal-notifications-state.json');
    this.connection = { snapshots: {} };
    this.state = { reminders: {}, episodes: {} };
    try {
      const saved = readJson<SavedConnection & Partial<LocalSnapshot>>(this.connectionFile, this.connection);
      this.connection = { refreshToken: saved.refreshToken, snapshots: saved.snapshots || (Array.isArray(saved.localEvents) && Array.isArray(saved.localTasks) ? { legacy: { localEvents: saved.localEvents, localTasks: saved.localTasks, localUpdatedAt: saved.localUpdatedAt, localThrough: saved.localThrough } } : {}) };
      this.state = readJson(this.stateFile, this.state);
      if (Object.values(this.connection.snapshots).some(s => !Array.isArray(s.localEvents) || !Array.isArray(s.localTasks)) || !this.state.reminders || !this.state.episodes) throw new Error('invalid_saved_state');
      if (this.state.homework !== undefined && (!this.state.homework || typeof this.state.homework !== 'object' || Array.isArray(this.state.homework) || Object.values(this.state.homework).some(e => !e || typeof e.key !== 'string' || typeof e.title !== 'string' || typeof e.animeId !== 'string' || !['netflix', 'laftel'].includes(e.provider) || !Number.isFinite(Date.parse(e.publishedAt))))) throw new Error('invalid_anime_homework');
    } catch { this.storageError = true; console.warn('[PersonalNotifications] 저장본 손상, 개인 알림 중단'); }
  }
  settings(): NotificationSettings {
    const raw = readJson<Partial<NotificationSettings> & { recentIds?: number[] }>(path.join(this.memoRoot, 'data/personal-notifications/settings.json'), {});
    return { enabled: raw.enabled === true, hour: raw.hour ?? 9, minute: raw.minute ?? 0, reminderMinutes: raw.reminderMinutes ?? 30, animeIds: [...new Set([...(Array.isArray(raw.animeIds) ? raw.animeIds : []), ...(Array.isArray(raw.recentIds) ? raw.recentIds : [])])].filter(id => Number.isInteger(id) && id > 0) };
  }
  updateConnection(input: Partial<LocalSnapshot> & { refreshToken?: string; deviceId?: string }): void {
    this.connectionVersion++;
    if ('refreshToken' in input) this.connection.refreshToken = input.refreshToken;
    if ('localEvents' in input || 'localTasks' in input || 'localUpdatedAt' in input) {
      const id = input.deviceId || 'legacy';
      const legacy = this.connection.snapshots.legacy;
      if (id !== 'legacy' && legacy) {
        const incoming = new Set([...(input.localEvents || []), ...(input.localTasks || [])].map(item => item.id));
        if (![...legacy.localEvents, ...legacy.localTasks].length || [...legacy.localEvents, ...legacy.localTasks].some(item => incoming.has(item.id))) delete this.connection.snapshots.legacy;
      }
      const { deviceId: _device, refreshToken: _token, ...snapshot } = input;
      this.connection.snapshots[id] = { localEvents: [], localTasks: [], ...this.connection.snapshots[id], ...snapshot };
    }
    saveJson(this.connectionFile, this.connection);
    this.access = null;
    this.lastCollection = 0;
    this.report = null;
  }
  disconnect(): void { this.updateConnection({ refreshToken: undefined }); }
  private homework(): AnimeEpisode[] { return Object.values(this.state.homework || {}).sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.key.localeCompare(b.key)); }
  setAnimeWatched(key: string, watched: boolean, watchedAt?: string, now = Date.now()): AgendaReport {
    if (this.storageError) throw new Error('notification_storage_invalid');
    const episode = this.state.homework && Object.prototype.hasOwnProperty.call(this.state.homework, key) ? this.state.homework[key] : undefined;
    if (!episode) throw new Error('episode_not_found');
    if (watchedAt !== undefined && (typeof watchedAt !== 'string' || watchedAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(watchedAt) || !Number.isFinite(Date.parse(watchedAt)) || Date.parse(watchedAt) > now || !watched)) throw new Error('invalid_watched_at');
    if (watchedAt && new Date(watchedAt.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== watchedAt.slice(0, 10)) throw new Error('invalid_watched_at');
    const updated: AnimeEpisode = { ...episode };
    if (watched) updated.watchedAt = watchedAt ? new Date(watchedAt).toISOString() : episode.watchedAt || new Date(now).toISOString();
    else delete updated.watchedAt;
    const next = { ...this.state, homework: { ...this.state.homework, [key]: updated } };
    saveJson(this.stateFile, next);
    this.state = next;
    if (this.report) this.report = { ...this.report, homework: this.homework() };
    return this.status();
  }
  status(): AgendaReport {
    if (this.storageError) return { collectedAt: new Date().toISOString(), connected: false, settings: this.settings(), errors: ['알림 저장본 손상, 운영 확인 필요'], events: [], tasks: [], anime: [] };
    return this.report ?? { collectedAt: '', connected: !!this.connection.refreshToken, settings: this.settings(), errors: ['아직 수집 전'], events: [], tasks: [], anime: [], homework: this.homework() };
  }
  private async json(url: string, headers: Record<string, string> = {}): Promise<any> {
    const res = await this.request(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  private async googleToken(): Promise<string> {
    if (this.access && this.access.expires > Date.now() + MINUTE) return this.access.token;
    if (!this.connection.refreshToken) throw new Error('구글 상시 알림 연결 필요');
    const res = await this.request('https://mydash-relay.mascari4615.com/google/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://dash.mascari4615.com' },
      body: JSON.stringify({ refresh_token: this.connection.refreshToken }), signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) throw new Error('구글 연결 갱신 실패');
    this.access = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
    return data.access_token;
  }
  private async pages(url: string, token: string): Promise<any[]> {
    const items: any[] = [];
    let page = '';
    for (let i = 0; i < 100; i++) {
      const u = new URL(url);
      if (page) u.searchParams.set('pageToken', page);
      const data = await this.json(u.href, { Authorization: `Bearer ${token}` });
      if (data.items !== undefined && !Array.isArray(data.items)) throw new Error('구글 응답 형식 오류');
      items.push(...(data.items || []));
      if (!data.nextPageToken) return items;
      page = data.nextPageToken;
    }
    throw new Error('구글 페이지 상한 초과');
  }
  async collect(now = Date.now()): Promise<AgendaReport> {
    if (this.storageError) throw new Error('notification_storage_invalid');
    const version = this.connectionVersion;
    const settings = this.settings();
    const snapshots = Object.values(this.connection.snapshots).sort((a, b) => Date.parse(a.localUpdatedAt || '1970-01-01') - Date.parse(b.localUpdatedAt || '1970-01-01'));
    const events = new Map<string, AgendaEvent>(), tasks = new Map<string, AgendaTask>(), errors = new Set<string>();
    if (!snapshots.length) errors.add('로컬 할 일과 일정 동기화 필요');
    for (const snapshot of snapshots) {
      if (!snapshot.localUpdatedAt || now - Date.parse(snapshot.localUpdatedAt) > DAY) errors.add('로컬 저장본 24시간 이상 경과');
      if (snapshot.localThrough && eventTime(snapshot.localThrough) <= now) errors.add('로컬 반복 일정 수집 범위 만료');
      else snapshot.localEvents.forEach(e => events.set(e.id, e));
      snapshot.localTasks.forEach(t => tasks.set(t.id, t));
    }
    const report: AgendaReport = { collectedAt: new Date(now).toISOString(), connected: !!this.connection.refreshToken, settings, localUpdatedAt: snapshots[0]?.localUpdatedAt, errors: [...errors], events: [...events.values()], tasks: [...tasks.values()], anime: [], lastSentAt: this.state.lastSentAt };
    try {
      const token = await this.googleToken();
      const calendars = await this.pages('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', token);
      for (const cal of calendars.filter(c => c.selected !== false && !c.hidden)) {
        try {
          const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: new Date(eventTime(kstDate(now))).toISOString(), timeMax: new Date(now + 8 * DAY).toISOString(), maxResults: '2500' });
          const events = await this.pages(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${q}`, token);
          report.events.push(...events.filter(e => e.status !== 'cancelled' && !e.extendedProperties?.private?.karmoFollowup).map(e => ({ id: `${cal.id}__${e.id}`, title: e.summary || '(제목 없음)', start: e.start.dateTime || e.start.date, end: e.end?.dateTime || e.end?.date || e.start.dateTime || e.start.date, allDay: !!e.start.date, source: cal.summary })));
        } catch { report.errors.push(`${cal.summary || '캘린더'} 수집 실패`); }
      }
      try {
        const lists = await this.pages('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100', token);
        for (const list of lists) {
          const tasks = await this.pages(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=false&showHidden=false&maxResults=100`, token);
          report.tasks.push(...tasks.filter(t => t.status !== 'completed' && !t.deleted).map(t => ({ id: `${list.id}__${t.id}`, title: t.title, due: t.due, status: t.status })));
        }
      } catch { report.errors.push('구글 할 일 수집 실패'); }
    } catch { report.connected = false; report.errors.push('구글 상시 알림 연결 확인 필요'); }
    try {
      const followups = readJson<{ items: Array<{ id: string; date: string; title: string; status?: string }> }>(path.join(this.memoRoot, 'data/followups/followups.json'), { items: [] });
      report.tasks.push(...followups.items.filter(f => f.status !== 'done').map(f => ({ id: `ai:${f.id}`, title: f.title, due: f.date })));
    } catch { report.errors.push('AI 후속 일정 수집 실패'); }
    try {
      const daily = await this.json('https://api.laftel.net/api/search/v2/daily/');
      if (!Array.isArray(daily)) throw new Error('응답 형식 오류');
      report.anime = daily.filter(a => settings.animeIds.includes(a.id) && !a.is_expired && a.is_episode_existed && (a.latest_published_datetime || a.latest_episode_created)).map(a => ({ id: a.id, title: a.name, publishedAt: publishedTime(a.latest_published_datetime || a.latest_episode_created), weekdays: a.distributed_air_times || [] }));
    } catch { report.errors.push('애니 업로드 수집 실패'); }
    try {
      const titles = readJson<NetflixTitle[]>(path.join(this.memoRoot, 'data/personal-notifications/netflix.json'), []);
      if (!Array.isArray(titles)) throw new Error('invalid_netflix_schedule');
      for (const title of titles) {
        if (!/^\d+$/.test(title.id) || !title.title || !Array.isArray(title.releases) || title.releases.some(at => typeof at !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(Date.parse(at)))) throw new Error('invalid_netflix_schedule');
      }
      report.anime.push(...titles.map(title => ({ id: `netflix:${title.id}`, title: title.title, publishedAt: '', weekdays: [], provider: 'netflix' as const, url: `https://www.netflix.com/title/${title.id}`, releases: [...new Set(title.releases)].sort((a, b) => Date.parse(a) - Date.parse(b)) })));
    } catch { report.errors.push('넷플릭스 공개 일정 읽기 실패'); }
    report.events.sort((a, b) => eventTime(a.start) - eventTime(b.start));
    if (version !== this.connectionVersion) throw new Error('connection_changed_retry');
    const homework = { ...this.state.homework };
    for (const anime of report.anime) {
      const provider = anime.provider || 'laftel', animeId = anime.provider === 'netflix' ? String(anime.id) : `laftel:${anime.id}`;
      for (const release of anime.provider === 'netflix' ? anime.releases || [] : [anime.publishedAt]) {
        const at = Date.parse(release);
        if (!Number.isFinite(at) || at > now) continue;
        const publishedAt = new Date(at).toISOString(), key = `${animeId}|${publishedAt}`;
        if (!homework[key]) homework[key] = { key, animeId, title: anime.title, provider, publishedAt, url: anime.url || `https://laftel.net/item/${anime.id}`, scheduled: provider === 'netflix' };
      }
    }
    try {
      const titles = readJson<NetflixTitle[]>(path.join(this.memoRoot, 'data/personal-notifications/netflix.json'), []);
      for (const title of titles) {
        if (!Number.isInteger(title.firstEpisode) || title.firstEpisode! < 1) continue;
        const releases = [...new Set(title.releases)].sort((a, b) => Date.parse(a) - Date.parse(b));
        releases.forEach((release, index) => {
          const key = `netflix:${title.id}|${new Date(release).toISOString()}`;
          if (homework[key]) homework[key] = { ...homework[key], episodeNumber: String(title.firstEpisode! + index) };
        });
      }
    } catch { /* 위 일정 검증에서 오류 표시 */ }
    try {
      const catalog = readJson<{ titles: CatalogTitle[] }>(path.join(this.memoRoot, 'data/personal-notifications/laftel-catalog.generated.json'), { titles: [] });
      if (!Array.isArray(catalog.titles)) throw new Error('invalid_catalog');
      const titles = catalog.titles.filter(t => settings.animeIds.includes(t.id));
      for (const title of titles) {
        const active = report.anime.find(a => a.id === title.id && !a.provider);
        let episodes = title.episodes;
        if (!Array.isArray(episodes)) throw new Error('invalid_catalog_episodes');
        if (active) {
          const cached = this.liveEpisodes.get(title.id);
          if (cached?.latest === active.publishedAt) episodes = cached.episodes;
          else try {
            episodes = await this.laftelEpisodes(title.id);
            this.liveEpisodes.set(title.id, { latest: active.publishedAt, episodes });
          } catch { report.errors.push(`${title.title} 회차 갱신 실패, 저장본 표시`); }
        }
        for (const episode of episodes) {
          const at = Date.parse(publishedTime(episode.publishedAt));
          if (!episode.available || !Number.isInteger(episode.id) || !Number.isFinite(at) || at > now) continue;
          const animeId = `laftel:${title.id}`, publishedAt = new Date(at).toISOString();
          const existing = Object.values(homework).find(e => e.animeId === animeId && (e.episodeId === episode.id || (!e.episodeId && e.publishedAt === publishedAt)));
          const key = existing?.key || `${animeId}|episode:${episode.id}`;
          const provisional = `${animeId}|${publishedAt}`;
          if (key !== provisional && homework[provisional] && !homework[provisional].episodeId && !homework[provisional].watchedAt) delete homework[provisional];
          homework[key] = { ...existing, key, animeId, title: title.title, provider: 'laftel', publishedAt, url: `https://laftel.net/item/${title.id}`, scheduled: false, episodeId: episode.id, episodeNumber: String(episode.number), episodeTitle: episode.title, archived: existing?.archived ?? !existing };
        }
      }
    } catch { report.errors.push('라프텔 과거 회차 읽기 실패'); }
    if (version !== this.connectionVersion) throw new Error('connection_changed_retry');
    for (const [key, saved] of Object.entries(this.state.homework || {})) {
      if (!homework[key]) homework[key] = saved;
      else {
        homework[key] = { ...homework[key] };
        delete homework[key].watchedAt;
        if (saved.watchedAt) homework[key].watchedAt = saved.watchedAt;
      }
    }
    const nextState = { ...this.state, homework };
    saveJson(this.stateFile, nextState);
    this.state = nextState;
    report.homework = this.homework();
    this.report = report;
    this.lastCollection = now;
    return report;
  }
  private async laftelEpisodes(id: number): Promise<CatalogEpisode[]> {
    const episodes: CatalogEpisode[] = [];
    for (let offset = 0; offset < 10000;) {
      const page = await this.json(`https://api.laftel.net/api/episodes/v3/list/?item_id=${id}&sort=oldest&offset=${offset}&limit=100`);
      if (!Array.isArray(page.results) || !Number.isInteger(page.count)) throw new Error('invalid_episode_page');
      episodes.push(...page.results.map((e: any) => ({ id: e.id, number: String(e.episode_num), title: typeof e.subject === 'string' ? e.subject : '', publishedAt: e.published_datetime, available: e.is_viewing !== false })));
      offset += page.results.length;
      if (!page.next) { if (offset !== page.count) throw new Error('incomplete_episode_pages'); return episodes; }
      if (!page.results.length) throw new Error('empty_episode_page');
    }
    throw new Error('episode_page_limit');
  }
  async tick(now = Date.now(), preview = false): Promise<void> {
    if (!notificationServices.enabled('personal')) return;
    if (this.busy) { if (preview) throw new Error('notification_busy'); return; }
    this.busy = true;
    try {
      if (!this.settings().enabled && !preview) return;
      if (this.storageError) return;
      if (!this.connection.refreshToken && !Object.values(this.connection.snapshots).some(s => s.localUpdatedAt) && !fs.existsSync(path.join(this.memoRoot, 'data/personal-notifications/netflix.json')) && !preview) return;
      const report = !this.report || now - this.lastCollection >= 5 * MINUTE || preview ? await this.collect(now) : this.report;
      const date = kstDate(now), local = new Date(now + 9 * 60 * MINUTE);
      const dueDaily = local.getUTCHours() * 60 + local.getUTCMinutes() >= report.settings.hour * 60 + report.settings.minute;
      if (preview || (dueDaily && this.state.daily !== date)) {
        await this.send(summaryText(report, now), summaryEmbed(report, now));
        this.state.daily = date;
        this.state.lastSentAt = new Date(now).toISOString();
        saveJson(this.stateFile, this.state);
      }
      if (preview) return;
      for (const event of dueReminders(report, this.state.reminders, now)) {
        const reminder = `${Math.ceil((eventTime(event.start) - now) / MINUTE)}분 뒤 ${event.title}\nhttps://dash.mascari4615.com/#planner`;
        await this.send(reminder, compactEmbed('일정 임박', `${Math.ceil((eventTime(event.start) - now) / MINUTE)}분 전 / ${event.title.slice(0, 100)} / [플래너](https://dash.mascari4615.com/#planner)`, notificationColors.attention));
        this.state.reminders[reminderKey(event)] = new Date(now).toISOString();
        saveJson(this.stateFile, this.state);
      }
      for (const anime of report.anime) {
        if (anime.provider === 'netflix') {
          for (const release of anime.releases || []) {
            const at = Date.parse(release), key = `${anime.id}|${new Date(at).toISOString()}`;
            if (at > now || at <= now - DAY || this.state.episodes[key]) continue;
            await this.send(`[넷플릭스] ${anime.title} 새 에피소드 공개 예정 시각\n공식 일정 기준 · 실제 업로드 확인 전\n${anime.url}\nhttps://dash.mascari4615.com/#planner`, compactEmbed('작품 공개 일정', `${anime.title.slice(0, 100)} / 넷플릭스 공식 일정 / 업로드 미확인 / [작품](${anime.url})`, notificationColors.episode));
            this.state.episodes[key] = release;
            saveJson(this.stateFile, this.state);
          }
          continue;
        }
        const previous = this.state.episodes[anime.id];
        const at = Date.parse(anime.publishedAt);
        if (!Number.isFinite(at) || at > now) continue;
        if (previous && previous !== anime.publishedAt && at > Date.parse(previous)) {
          await this.send(`${anime.title} 새 에피소드 업로드\nhttps://laftel.net/item/${anime.id}\nhttps://dash.mascari4615.com/#planner`, compactEmbed('새 에피소드', `${anime.title.slice(0, 100)} / 라프텔 / [작품](https://laftel.net/item/${anime.id})`, notificationColors.episode));
        }
        this.state.episodes[anime.id] = anime.publishedAt;
        saveJson(this.stateFile, this.state);
      }
      this.state.reminders = Object.fromEntries(Object.entries(this.state.reminders).filter(([, at]) => now - Date.parse(at) < 14 * DAY));
      saveJson(this.stateFile, this.state);
      report.lastSentAt = this.state.lastSentAt;
    } finally { this.busy = false; }
  }
  isRunning(): boolean { return this.timer != null; }
  start(): void {
    if (this.timer) return;
    const run = (): void => { void this.tick().catch(() => console.warn('[PersonalNotifications] 수집 또는 전송 실패, 다음 회차 재시도')); };
    run(); this.timer = setInterval(run, MINUTE);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
