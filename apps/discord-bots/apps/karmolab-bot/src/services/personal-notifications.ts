import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

export interface AgendaEvent { id: string; title: string; start: string; end: string; allDay: boolean; source?: string }
export interface AgendaTask { id: string; title: string; due?: string; status?: string }
export interface AnimeUpdate { id: number; title: string; publishedAt: string; weekdays: string[] }
export interface NotificationSettings { enabled: boolean; hour: number; minute: number; reminderMinutes: number; animeIds: number[] }
interface SavedConnection { refreshToken?: string; localEvents: AgendaEvent[]; localTasks: AgendaTask[]; localUpdatedAt?: string; localThrough?: string }
interface SavedState { daily?: string; reminders: Record<string, string>; episodes: Record<string, string>; lastSentAt?: string }
export interface AgendaReport {
  collectedAt: string; connected: boolean; settings: NotificationSettings; localUpdatedAt?: string;
  errors: string[]; events: AgendaEvent[]; tasks: AgendaTask[]; anime: AnimeUpdate[]; lastSentAt?: string;
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

export function summaryText(report: AgendaReport, now: number): string {
  const { today, upcoming, tasks, upcomingTasks } = agendaSelection(report, now);
  const time = (e: AgendaEvent): string => e.allDay ? '종일' : new Date(eventTime(e.start)).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  const short = (title: string): string => (title || '(제목 없음)').replace(/\s+/g, ' ').slice(0, 60);
  const lines = (items: string[]): string => items.slice(0, 5).join('\n') + (items.length > 5 ? `\n외 ${items.length - 5}개` : '') || '없음';
  const body = [
    `${kstDate(now)} 오늘 안내`,
    `오늘 할 일\n${lines(tasks.map(t => `${short(t.title)}${t.due ? ' (마감 ' + t.due.slice(0, 10) + ')' : ''}`))}`,
    `오늘 일정\n${lines(today.map(e => `${time(e)} ${short(e.title)}`))}`,
    `다음 7일\n${lines([...upcoming.map(e => `${kstDate(eventTime(e.start))} ${time(e)} ${short(e.title)}`), ...upcomingTasks.map(t => `${t.due!.slice(0, 10)} 마감 ${short(t.title)}`)])}`,
    `애니 업로드\n${lines(report.anime.filter(a => Date.parse(a.publishedAt) >= now - DAY && Date.parse(a.publishedAt) <= now).map(a => `${short(a.title)} 새 에피소드`))}`,
    ...(report.errors.length ? ['확인 필요: ' + report.errors.join(', ')] : []),
  ].join('\n\n').slice(0, 1800);
  return body + '\n\nhttps://dash.mascari4615.com/#planner';
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
  constructor(private readonly memoRoot: string, private readonly send: (text: string) => Promise<void>, private readonly dataRoot = path.join(PKG_ROOT, 'data'), private readonly request: typeof fetch = fetch) {
    this.connectionFile = path.join(dataRoot, 'personal-notifications-connection.json');
    this.stateFile = path.join(dataRoot, 'personal-notifications-state.json');
    this.connection = { localEvents: [], localTasks: [] };
    this.state = { reminders: {}, episodes: {} };
    try {
      this.connection = readJson(this.connectionFile, this.connection);
      this.state = readJson(this.stateFile, this.state);
      if (!Array.isArray(this.connection.localEvents) || !Array.isArray(this.connection.localTasks) || !this.state.reminders || !this.state.episodes) throw new Error('invalid_saved_state');
    } catch { this.storageError = true; console.warn('[PersonalNotifications] 저장본 손상, 개인 알림 중단'); }
  }
  settings(): NotificationSettings {
    const raw = readJson<Partial<NotificationSettings> & { recentIds?: number[] }>(path.join(this.memoRoot, 'data/personal-notifications/settings.json'), {});
    return { enabled: raw.enabled === true, hour: raw.hour ?? 9, minute: raw.minute ?? 0, reminderMinutes: raw.reminderMinutes ?? 30, animeIds: [...new Set([...(Array.isArray(raw.animeIds) ? raw.animeIds : []), ...(Array.isArray(raw.recentIds) ? raw.recentIds : [])])].filter(id => Number.isInteger(id) && id > 0) };
  }
  updateConnection(input: Partial<SavedConnection>): void {
    this.connectionVersion++;
    this.connection = { ...this.connection, ...input };
    saveJson(this.connectionFile, this.connection);
    this.access = null;
    this.lastCollection = 0;
    this.report = null;
  }
  disconnect(): void { this.updateConnection({ refreshToken: undefined }); }
  status(): AgendaReport {
    if (this.storageError) return { collectedAt: new Date().toISOString(), connected: false, settings: this.settings(), errors: ['알림 저장본 손상, 운영 확인 필요'], events: [], tasks: [], anime: [] };
    return this.report ?? { collectedAt: '', connected: !!this.connection.refreshToken, settings: this.settings(), localUpdatedAt: this.connection.localUpdatedAt, errors: ['아직 수집 전'], events: [], tasks: [], anime: [] };
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
    const report: AgendaReport = { collectedAt: new Date(now).toISOString(), connected: !!this.connection.refreshToken, settings, localUpdatedAt: this.connection.localUpdatedAt, errors: [], events: [...this.connection.localEvents], tasks: [...this.connection.localTasks], anime: [], lastSentAt: this.state.lastSentAt };
    if (!this.connection.localUpdatedAt) report.errors.push('로컬 할 일과 일정 동기화 필요');
    else if (now - Date.parse(this.connection.localUpdatedAt) > DAY) report.errors.push('로컬 저장본 24시간 이상 경과');
    if (this.connection.localThrough && eventTime(this.connection.localThrough) <= now) { report.events = []; report.errors.push('로컬 반복 일정 수집 범위 만료'); }
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
    report.events.sort((a, b) => eventTime(a.start) - eventTime(b.start));
    if (version !== this.connectionVersion) throw new Error('connection_changed_retry');
    this.report = report;
    this.lastCollection = now;
    return report;
  }
  async tick(now = Date.now(), preview = false): Promise<void> {
    if (this.busy) { if (preview) throw new Error('notification_busy'); return; }
    this.busy = true;
    try {
      if (!this.settings().enabled && !preview) return;
      if (this.storageError) return;
      if (!this.connection.refreshToken && !this.connection.localUpdatedAt && !preview) return;
      const report = !this.report || now - this.lastCollection >= 5 * MINUTE || preview ? await this.collect(now) : this.report;
      const date = kstDate(now), local = new Date(now + 9 * 60 * MINUTE);
      const dueDaily = local.getUTCHours() * 60 + local.getUTCMinutes() >= report.settings.hour * 60 + report.settings.minute;
      if (preview || (dueDaily && this.state.daily !== date)) {
        await this.send(summaryText(report, now));
        this.state.daily = date;
        this.state.lastSentAt = new Date(now).toISOString();
        saveJson(this.stateFile, this.state);
      }
      if (preview) return;
      for (const event of dueReminders(report, this.state.reminders, now)) {
        await this.send(`${Math.ceil((eventTime(event.start) - now) / MINUTE)}분 뒤 ${event.title}\nhttps://dash.mascari4615.com/#planner`);
        this.state.reminders[reminderKey(event)] = new Date(now).toISOString();
        saveJson(this.stateFile, this.state);
      }
      for (const anime of report.anime) {
        const previous = this.state.episodes[anime.id];
        const at = Date.parse(anime.publishedAt);
        if (!Number.isFinite(at) || at > now) continue;
        if (previous && previous !== anime.publishedAt && at > Date.parse(previous)) {
          await this.send(`${anime.title} 새 에피소드 업로드\nhttps://laftel.net/item/${anime.id}\nhttps://dash.mascari4615.com/#planner`);
        }
        this.state.episodes[anime.id] = anime.publishedAt;
        saveJson(this.stateFile, this.state);
      }
      this.state.reminders = Object.fromEntries(Object.entries(this.state.reminders).filter(([, at]) => now - Date.parse(at) < 14 * DAY));
      saveJson(this.stateFile, this.state);
      report.lastSentAt = this.state.lastSentAt;
    } finally { this.busy = false; }
  }
  start(): void {
    if (this.timer) return;
    const run = (): void => { void this.tick().catch(() => console.warn('[PersonalNotifications] 수집 또는 전송 실패, 다음 회차 재시도')); };
    run(); this.timer = setInterval(run, MINUTE);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
