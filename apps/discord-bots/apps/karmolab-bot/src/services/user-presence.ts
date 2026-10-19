import fs from 'node:fs';
import path from 'node:path';

export const PRESENCE_STATES = ['home', 'commute', 'work', 'return', 'away', 'sleep'] as const;
export type PresenceState = typeof PRESENCE_STATES[number];
export interface PresenceRule { id: string; days: number[]; time: string; state: PresenceState }
export interface PresenceConfig {
  version: 1; revision: number; enabled: boolean; rules: PresenceRule[];
  manual: { state: PresenceState; since: number; until: number | null } | null;
}
const DAY = 86_400_000;
const isState = (v: unknown): v is PresenceState => PRESENCE_STATES.includes(v as PresenceState);
export function validRules(value: unknown): value is PresenceRule[] {
  if (!Array.isArray(value) || value.length > 32) return false;
  const slots = new Set<string>(), ids = new Set<string>();
  return value.every(r => {
    if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(r.id) || ids.has(r.id) || !isState(r.state) || typeof r.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) || !Array.isArray(r.days) || !r.days.length || r.days.length > 7) return false;
    ids.add(r.id);
    return r.days.every((d: unknown) => {
      if (!Number.isInteger(d) || Number(d) < 0 || Number(d) > 6) return false;
      const slot = `${d}/${r.time}`;
      if (slots.has(slot)) return false;
      slots.add(slot); return true;
    });
  });
}

/** Weekly boundaries in Asia/Seoul; resolve on every read, including after downtime. */
export function resolvePresence(config: PresenceConfig, now = Date.now()) {
  const date = new Date(now + 9 * 3_600_000);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - 9 * 3_600_000;
  let previous: { at: number; state: PresenceState } | null = null;
  let next: { at: number; state: PresenceState } | null = null;
  if (config.enabled) for (let offset = -7; offset <= 7; offset++) {
    const day = (date.getUTCDay() + offset + 7) % 7;
    for (const rule of config.rules) {
      if (!rule.days.includes(day)) continue;
      const [hour, minute] = rule.time.split(':').map(Number);
      const at = midnight + offset * DAY + hour * 3_600_000 + minute * 60_000;
      if (at <= now && (!previous || at > previous.at)) previous = { at, state: rule.state };
      if (at > now && (!next || at < next.at)) next = { at, state: rule.state };
    }
  }
  const manual = config.manual && (config.manual.until === null || config.manual.until > now) ? config.manual : null;
  const current = manual ? { state: manual.state, source: 'manual', since: manual.since } : previous ? { state: previous.state, source: 'schedule', since: previous.at } : { state: null, source: 'unset', since: null };
  // During an override, the first effective transition is its expiry, not a suppressed rule.
  const upcoming = manual ? manual.until === null ? null : { at: manual.until, state: resolvePresence({ ...config, manual: null }, manual.until).current.state } : next;
  return { current, next: upcoming };
}

export class UserPresence {
  constructor(private readonly file: string) {}
  private read(): PresenceConfig {
    if (!fs.existsSync(this.file)) return { version: 1, revision: 0, enabled: false, rules: [], manual: null };
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as PresenceConfig;
    if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.enabled !== 'boolean' || !validRules(data.rules) || (data.manual !== null && (!data.manual || !isState(data.manual.state) || !Number.isFinite(data.manual.since) || (data.manual.until !== null && !Number.isFinite(data.manual.until))))) throw new Error('presence_storage_invalid');
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
      if (typeof body.enabled !== 'boolean' || !validRules(body.rules)) throw new Error('invalid_input');
      config.enabled = body.enabled; config.rules = body.rules;
    } else throw new Error('invalid_input');
    config.revision++;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    return this.status(now);
  }
}
