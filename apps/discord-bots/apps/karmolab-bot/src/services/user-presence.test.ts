import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePresence, UserPresence, validRules, type PresenceConfig } from './user-presence';
const at = (text: string) => Date.parse(text + '+09:00');
const config: PresenceConfig = { version: 1, revision: 0, enabled: true, manual: null, rules: [
  { id: 'work', days: [1, 2, 3, 4, 5], time: '08:00', state: 'work' },
  { id: 'home', days: [1, 2, 3, 4, 5], time: '18:00', state: 'home' },
] };
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true }); });
function store() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-test-')); dirs.push(dir); const file = path.join(dir, 'state.json'); return { file, service: new UserPresence(file) }; }
describe('manual and weekly presence', () => {
  it('changes at the exact KST boundary with no running page', () => {
    expect(resolvePresence(config, at('2026-10-19T07:59:59')).current.state).toBe('home');
    expect(resolvePresence(config, at('2026-10-19T08:00:00')).current).toMatchObject({ state: 'work', source: 'schedule' });
    expect(resolvePresence(config, at('2026-10-19T08:00:00')).next?.at).toBe(at('2026-10-19T18:00:00'));
  });
  it('carries the last rule across midnight, weekends and restart', () => {
    expect(resolvePresence(config, at('2026-10-18T23:59:59')).current.state).toBe('home');
    expect(resolvePresence(config, at('2026-10-18T23:59:59')).next?.at).toBe(at('2026-10-19T08:00:00'));
    expect(resolvePresence({ ...config, rules: [{ id: 'sun', days: [0], time: '00:00', state: 'sleep' }] }, at('2026-10-19T12:00:00')).current.state).toBe('sleep');
  });
  it('manual override survives schedule boundaries and expires to the current rule', () => {
    const c = { ...config, manual: { state: 'away' as const, since: at('2026-10-19T07:00:00'), until: at('2026-10-19T09:00:00') } };
    expect(resolvePresence(c, at('2026-10-19T08:30:00')).current.state).toBe('away');
    expect(resolvePresence(c, at('2026-10-19T08:30:00')).next?.state).toBe('work');
    expect(resolvePresence(c, at('2026-10-19T09:00:00')).current.state).toBe('work');
    expect(resolvePresence({ ...c, manual: { ...c.manual, until: null } }, at('2026-10-26T12:00:00')).next).toBeNull();
  });
  it('disabled or empty schedule resolves unset after override expiry', () => {
    expect(resolvePresence({ ...config, enabled: false }).current.state).toBeNull();
    expect(resolvePresence({ ...config, rules: [] }).next).toBeNull();
  });
  it('rejects duplicate slots, invalid hours, missing days and unknown states', () => {
    expect(validRules([...config.rules, { ...config.rules[0], id: 'other' }])).toBe(false);
    for (const patch of [{ time: '24:00' }, { days: [] }, { days: [7] }, { state: 'unknown' }]) expect(validRules([{ ...config.rules[0], ...patch }])).toBe(false);
  });
  it('persists across instances, rejects stale device writes, and resumes', () => {
    const { service, file } = store(), now = at('2026-10-19T10:00:00');
    expect(service.status(now).current.state).toBeNull();
    service.update({ action: 'schedule', revision: 0, enabled: true, rules: config.rules }, now);
    service.update({ action: 'manual', revision: 1, state: 'away', until: now + 60_000 }, now);
    expect(new UserPresence(file).status(now).current.state).toBe('away');
    expect(() => service.update({ action: 'resume', revision: 1 }, now)).toThrow('revision_conflict');
    expect(service.status(now + 60_000).current.state).toBe('work');
    expect(service.update({ action: 'resume', revision: 2 }, now).current.state).toBe('work');
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
