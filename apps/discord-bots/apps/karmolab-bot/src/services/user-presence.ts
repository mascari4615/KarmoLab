import fs from 'node:fs';
import path from 'node:path';

export const PRESENCE_STATES = ['home', 'commute', 'work', 'return', 'away', 'sleep'] as const;
export type PresenceState = typeof PRESENCE_STATES[number];
export interface PresenceRule { id: string; days: number[]; start: string; end: string; state: PresenceState }
export interface PresenceConfig {
  version: 2; revision: number; enabled: boolean; defaultState: PresenceState | null; rules: PresenceRule[];
  manual: { state: PresenceState; since: number; until: number | null } | null;
}
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const isState = (v: unknown): v is PresenceState => PRESENCE_STATES.includes(v as PresenceState);
const validTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minuteOf = (time: string): number => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const durationOf = (rule: PresenceRule): number => (minuteOf(rule.end) - minuteOf(rule.start) + 1440) % 1440 || 1440;
export function validRules(value: unknown): value is PresenceRule[] {
  if (!Array.isArray(value) || value.length > 256) return false;
  const ids = new Set<string>(), ranges: Array<[number, number]> = [];
  if (!value.every(r => {
    if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(r.id) || ids.has(r.id) || !isState(r.state) || !validTime(r.start) || !(validTime(r.end) || r.end === '24:00') || r.start === r.end || !Array.isArray(r.days) || !r.days.length || r.days.length > 7 || new Set(r.days).size !== r.days.length) return false;
    ids.add(r.id);
    return r.days.every((d: unknown) => {
      if (!Number.isInteger(d) || Number(d) < 0 || Number(d) > 6) return false;
      const start = Number(d) * DAY + minuteOf(r.start) * 60_000, end = start + durationOf(r) * 60_000;
      ranges.push([start, Math.min(end, WEEK)]);
      if (end > WEEK) ranges.push([0, end - WEEK]);
      return true;
    });
  })) return false;
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges.every((range, i) => i === 0 || ranges[i - 1][1] <= range[0]);
}

/** Weekly boundaries in Asia/Seoul; resolve on every read, including after downtime. */
export function resolvePresence(config: PresenceConfig, now = Date.now()) {
  const date = new Date(now + 9 * 3_600_000);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - 9 * 3_600_000;
  const intervals: Array<{ start: number; end: number; state: PresenceState }> = [];
  if (config.enabled) for (let offset = -1; offset <= 7; offset++) {
    const day = (date.getUTCDay() + offset + 7) % 7;
    for (const rule of config.rules) {
      if (!rule.days.includes(day)) continue;
      const start = midnight + offset * DAY + minuteOf(rule.start) * 60_000;
      intervals.push({ start, end: start + durationOf(rule) * 60_000, state: rule.state });
    }
  }
  const manual = config.manual && (config.manual.until === null || config.manual.until > now) ? config.manual : null;
  const scheduledAt = (at: number) => intervals.find(i => i.start <= at && at < i.end);
  const active = scheduledAt(now);
  const current = manual ? { state: manual.state, source: 'manual', since: manual.since } : active ? { state: active.state, source: 'schedule', since: active.start } : { state: config.defaultState, source: config.defaultState ? 'default' : 'unset', since: null };
  const boundaries = [...new Set(intervals.flatMap(i => [i.start, i.end]))].filter(at => at > now && at <= now + WEEK).sort((a, b) => a - b);
  const nextAt = boundaries.find(at => (scheduledAt(at)?.state ?? config.defaultState) !== current.state);
  const next = nextAt === undefined ? null : { at: nextAt, state: scheduledAt(nextAt)?.state ?? config.defaultState };
  // During an override, the first effective transition is its expiry, not a suppressed rule.
  const upcoming = manual ? manual.until === null ? null : { at: manual.until, state: resolvePresence({ ...config, manual: null }, manual.until).current.state } : next;
  return { current, next: upcoming };
}

/** Preserve v1's last-boundary semantics by splitting its weekly spans into daily intervals. */
function migrateLegacy(data: any): PresenceConfig {
  if (!Array.isArray(data.rules) || data.rules.length > 32) throw new Error('presence_storage_invalid');
  const points: Array<{ at: number; state: PresenceState }> = [];
  const ids = new Set<string>();
  for (const r of data.rules) {
    if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(r.id) || ids.has(r.id) || !validTime(r.time) || !isState(r.state) || !Array.isArray(r.days) || !r.days.length || r.days.length > 7) throw new Error('presence_storage_invalid');
    ids.add(r.id);
    for (const day of r.days) {
      if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('presence_storage_invalid');
      points.push({ at: day * 1440 + minuteOf(r.time), state: r.state });
    }
  }
  points.sort((a, b) => a.at - b.at);
  if (points.some((p, i) => i > 0 && p.at === points[i - 1].at)) throw new Error('presence_storage_invalid');
  const groups = new Map<string, PresenceRule>();
  const time = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  points.forEach((p, i) => {
    let cursor = p.at;
    const stop = i + 1 < points.length ? points[i + 1].at : points[0].at + 10080;
    while (cursor < stop) {
      const day = Math.floor(cursor / 1440), end = Math.min(stop, (day + 1) * 1440);
      const startTime = time(cursor - day * 1440), endTime = time(end - day * 1440), key = `${startTime}/${endTime}/${p.state}`;
      let rule = groups.get(key);
      if (!rule) { rule = { id: `legacy-${groups.size}`, days: [], start: startTime, end: endTime, state: p.state }; groups.set(key, rule); }
      rule.days.push(day % 7); cursor = end;
    }
  });
  return { ...data, version: 2, defaultState: null, rules: [...groups.values()] };
}

export class UserPresence {
  constructor(private readonly file: string) {}
  private read(): PresenceConfig {
    if (!fs.existsSync(this.file)) return { version: 2, revision: 0, enabled: false, defaultState: null, rules: [], manual: null };
    const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    const data = (saved?.version === 1 ? migrateLegacy(saved) : saved) as PresenceConfig;
    if (!data || data.version !== 2 || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.enabled !== 'boolean' || !(data.defaultState === null || isState(data.defaultState)) || !validRules(data.rules) || (data.manual !== null && (!data.manual || !isState(data.manual.state) || !Number.isFinite(data.manual.since) || (data.manual.until !== null && !Number.isFinite(data.manual.until))))) throw new Error('presence_storage_invalid');
    return data;
  }
  status(now = Date.now()) {
    const config = this.read();
    return { config, ...resolvePresence(config, now), evaluatedAt: now, timezone: 'Asia/Seoul' };
  }
  update(input: unknown, now = Date.now()) {
    const body = input as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') throw new Error('invalid_input');
    const config = this.read();
    if (body.revision !== config.revision) throw new Error('revision_conflict');
    if (body.action === 'manual') {
      if (!isState(body.state) || (body.until !== null && (typeof body.until !== 'number' || !Number.isFinite(body.until) || body.until <= now || body.until > now + 7 * DAY))) throw new Error('invalid_input');
      config.manual = { state: body.state, since: now, until: body.until as number | null };
    } else if (body.action === 'resume') config.manual = null;
    else if (body.action === 'schedule') {
      if (typeof body.enabled !== 'boolean' || !(body.defaultState === null || isState(body.defaultState)) || !validRules(body.rules)) throw new Error('invalid_input');
      config.enabled = body.enabled; config.rules = body.rules; config.defaultState = body.defaultState as PresenceState | null;
    } else throw new Error('invalid_input');
    config.revision++;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    return this.status(now);
  }
}
