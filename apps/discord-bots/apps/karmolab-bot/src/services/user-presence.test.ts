import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePresence, UserPresence, validRules, type PresenceConfig } from './user-presence';
const at = (text: string) => Date.parse(text + '+09:00');
const config: PresenceConfig = { version: 2, revision: 0, enabled: true, defaultState: 'home', manual: null, rules: [
  { id: 'work', days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', state: 'work' },
] };
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true }); });
function store() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-test-')); dirs.push(dir); const file = path.join(dir, 'state.json'); return { file, service: new UserPresence(file) }; }
describe('manual and weekly intervals', () => {
  it('includes start, excludes end, then restores default in KST', () => {
    expect(resolvePresence(config, at('2026-10-19T07:59:59')).current).toMatchObject({ state: 'home', source: 'default' });
    expect(resolvePresence(config, at('2026-10-19T08:00:00')).current).toMatchObject({ state: 'work', source: 'schedule' });
    expect(resolvePresence(config, at('2026-10-19T16:59:59')).next).toEqual({ at: at('2026-10-19T17:00:00'), state: 'home' });
    expect(resolvePresence(config, at('2026-10-19T17:00:00')).current.state).toBe('home');
  });
  it('does not leak a weekday interval into weekends or next week', () => {
    expect(resolvePresence(config, at('2026-10-18T23:59:59')).current.state).toBe('home');
    expect(resolvePresence(config, at('2026-10-18T23:59:59')).next?.at).toBe(at('2026-10-19T08:00:00'));
    expect(resolvePresence(config, at('2026-10-24T12:00:00')).current.state).toBe('home');
  });
  it('handles overnight Sunday-to-Monday and exact midnight', () => {
    const c = { ...config, rules: [{ id: 'sleep', days: [0], start: '22:00', end: '07:00', state: 'sleep' as const }] };
    expect(resolvePresence(c, at('2026-10-19T00:00:00')).current.state).toBe('sleep');
    expect(resolvePresence(c, at('2026-10-19T06:59:59')).next?.state).toBe('home');
    expect(resolvePresence(c, at('2026-10-19T07:00:00')).current.state).toBe('home');
    expect(resolvePresence(c, at('2026-10-19T22:00:00')).current.state).toBe('home');
  });
  it('supports an explicit 24:00 end and continuous full days without a fake next change', () => {
    const full = { ...config, rules: [{ id: 'full', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00', state: 'away' as const }] };
    expect(validRules(full.rules)).toBe(true);
    expect(resolvePresence(full, at('2026-10-19T00:00:00')).current.state).toBe('away');
    expect(resolvePresence(full, at('2026-10-19T12:00:00')).next).toBeNull();
  });
  it('allows adjacent intervals and rejects overlap including next-day spill and week wrap', () => {
    const base = config.rules[0];
    expect(validRules([base, { id: 'after', days: [1], start: '17:00', end: '18:00', state: 'work' }])).toBe(true);
    expect(validRules([base, { id: 'overlap', days: [1], start: '16:59', end: '18:00', state: 'away' }])).toBe(false);
    expect(validRules([{ id: 'sun', days: [0], start: '22:00', end: '09:00', state: 'sleep' }, base])).toBe(false);
    expect(validRules([{ id: 'sat', days: [6], start: '22:00', end: '09:00', state: 'sleep' }, { id: 'sun', days: [0], start: '08:00', end: '12:00', state: 'away' }])).toBe(false);
    for (const patch of [{ end: '08:00' }, { start: '24:00' }, { end: '24:01' }, { days: [] }, { days: [1, 1] }, { state: 'unknown' }]) expect(validRules([{ ...base, ...patch }])).toBe(false);
  });
  it('manual override wins, expires to an active interval or its default, and can be indefinite', () => {
    const c = { ...config, manual: { state: 'away' as const, since: at('2026-10-19T07:00:00'), until: at('2026-10-19T18:00:00') } };
    expect(resolvePresence(c, at('2026-10-19T08:30:00')).current.state).toBe('away');
    expect(resolvePresence(c, at('2026-10-19T08:30:00')).next?.state).toBe('home');
    expect(resolvePresence(c, at('2026-10-19T18:00:00')).current.state).toBe('home');
    expect(resolvePresence({ ...c, manual: { ...c.manual, until: null } }, at('2026-10-26T12:00:00')).next).toBeNull();
  });
  it('disabled or empty schedule resolves default, including an unset default', () => {
    expect(resolvePresence({ ...config, enabled: false }).current.state).toBe('home');
    expect(resolvePresence({ ...config, rules: [] }).next).toBeNull();
    expect(resolvePresence({ ...config, defaultState: null, rules: [] }).current.state).toBeNull();
  });
  it('persists intervals and default across restart, rejects stale device writes, and resumes', () => {
    const { service, file } = store(), now = at('2026-10-19T10:00:00');
    service.update({ action: 'schedule', revision: 0, enabled: true, defaultState: 'home', rules: config.rules }, now);
    service.update({ action: 'manual', revision: 1, state: 'away', until: now + 60_000 }, now);
    expect(new UserPresence(file).status(now).current.state).toBe('away');
    expect(() => service.update({ action: 'resume', revision: 1 }, now)).toThrow('revision_conflict');
    expect(service.status(now + 60_000).current.state).toBe('work');
    expect(service.update({ action: 'resume', revision: 2 }, now).current.state).toBe('work');
    expect(service.status(at('2026-10-19T17:00:00')).current.state).toBe('home');
  });
  it('migrates legacy boundaries without losing any weekday, weekend or manual state', () => {
    const { file, service } = store();
    const legacy = { version: 1, revision: 4, enabled: true, manual: null, rules: [
      { id: 'work', days: [1, 2, 3, 4, 5], time: '08:00', state: 'work' },
      { id: 'home', days: [1, 2, 3, 4, 5], time: '17:00', state: 'home' },
    ] };
    fs.writeFileSync(file, JSON.stringify(legacy));
    expect(service.status(at('2026-10-19T08:00:00')).current.state).toBe('work');
    expect(service.status(at('2026-10-19T17:00:00')).current.state).toBe('home');
    expect(service.status(at('2026-10-25T23:59:59')).current.state).toBe('home');
    expect(service.status().config.version).toBe(2);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(1);
    service.update({ action: 'resume', revision: 4 });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(2);
  });
  it('preserves a single legacy weekly boundary as a continuous weekly state', () => {
    const { file, service } = store();
    fs.writeFileSync(file, JSON.stringify({ version: 1, revision: 0, enabled: true, manual: null, rules: [{ id: 'one', days: [1], time: '08:00', state: 'work' }] }));
    for (let day = 18; day <= 25; day++) expect(service.status(at('2026-10-' + day + 'T07:00:00')).current.state).toBe('work');
    expect(service.status(at('2026-10-19T10:00:00')).next).toBeNull();
  });
  it('also merges v1 boundaries before interval migration', () => {
    const { file, service } = store();
    fs.writeFileSync(file, JSON.stringify({ version: 1, revision: 2, enabled: true, manual: null, rules: [
      { id: 'out', days: [1], time: '07:00', state: 'commute' },
      { id: 'back', days: [1], time: '17:00', state: 'return' },
      { id: 'home', days: [1], time: '18:00', state: 'home' },
    ] }));
    expect(service.status(at('2026-10-19T07:30:00')).current.state).toBe('work');
    expect(service.status(at('2026-10-19T17:30:00')).current.state).toBe('work');
    expect(service.status(at('2026-10-19T18:00:00')).current.state).toBe('home');
  });
  it('merges saved commute and return states without losing intervals, overrides or revisions', () => {
    const { file, service } = store(), now = at('2026-10-19T08:30:00');
    const saved = { ...config, revision: 7, defaultState: 'return', manual: { state: 'commute', since: now, until: now + 60_000 }, rules: [
      { id: 'out', days: [1], start: '07:00', end: '08:00', state: 'commute' },
      ...config.rules,
      { id: 'back', days: [1], start: '17:00', end: '18:00', state: 'return' },
    ] };
    fs.writeFileSync(file, JSON.stringify(saved));
    const report = service.status(now);
    expect(report.current.state).toBe('work');
    expect(report.config).toEqual({ ...saved, defaultState: 'work', manual: { ...saved.manual, state: 'work' }, rules: saved.rules.map(rule => ({ ...rule, state: 'work' })) });
    expect(service.status(at('2026-10-19T17:30:00')).current.state).toBe('work');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(saved);
    service.update({ action: 'resume', revision: 7 }, now);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).rules.every((rule: { state: string }) => rule.state === 'work')).toBe(true);
    expect(service.update({ action: 'manual', revision: 8, state: 'return', until: null }, now).current.state).toBe('work');
    expect(validRules([{ ...config.rules[0], state: 'commute' }])).toBe(false);
  });
  it('invalid input and corrupt storage cannot silently overwrite state', () => {
    const { service, file } = store();
    expect(() => service.update({ action: 'manual', revision: 0, state: 'home', until: 0 })).toThrow('invalid_input');
    expect(fs.existsSync(file)).toBe(false);
    fs.writeFileSync(file, '{broken');
    expect(() => service.status()).toThrow();
    expect(() => service.update({ action: 'resume', revision: 0 })).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{broken');
  });
});
