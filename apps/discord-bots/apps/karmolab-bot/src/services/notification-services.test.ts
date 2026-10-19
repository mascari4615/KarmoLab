import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotificationServices } from './notification-services';
import type { NotificationDefinition } from './notification-definitions';
import * as channels from './channel-provision';

const dirs: string[] = [];
const definitions: NotificationDefinition[] = [{ id: 'sample', title: 'Example', description: 'Example source', group: 'Test', fields: [{ key: 'minutes', label: 'Minutes', type: 'number', min: 1, max: 60, default: 10 }] }];
function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-services-')); dirs.push(directory);
  const file = path.join(directory, 'settings.json');
  return { file, service: new NotificationServices(file, definitions, {}) };
}
afterEach(() => { vi.restoreAllMocks(); for (const directory of dirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe('notification service controls', () => {
  it('a channel delivery preference does not mute other developer channels', async () => {
    vi.spyOn(channels, 'channelIdFor').mockReturnValue('managed-channel');
    const { service } = setup();
    await service.change('sample', 0, { enabled: false });
    const send = vi.fn(async () => 'sent');
    await service.deliver('sample', send, 'managed-channel');
    await service.deliver('sample', send, 'developer-channel');
    expect(send).toHaveBeenCalledOnce();
  });
  it('a broken lifecycle probe does not hide the rest of the list', async () => {
    const { service } = setup();
    await service.bind('sample', { start() {}, stop() {}, isRunning() { throw Error('probe'); } });
    expect(service.snapshot().services[0].lifecycle).toMatchObject({ running: null, error: true });
  });
  it('broken preferences do not start schedulers or interrupt caller initialization', async () => {
    const { service, file } = setup();
    fs.writeFileSync(file, '{broken');
    const start = vi.fn();
    await expect(service.bind('sample', { start, stop() {}, isRunning: () => false })).resolves.toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });
  it('a new definition appears without a UI list; disabled delivery survives restart', async () => {
    const { file, service } = setup();
    service.register({ id: 'added', title: 'New source', description: 'Plugin', group: 'Test' });
    expect(service.snapshot().services.map(source => source.id)).toEqual(['sample', 'added']);
    const send = vi.fn(async () => 'sent');
    await service.change('sample', 0, { enabled: false });
    await service.deliver('sample', send);
    await new NotificationServices(file, definitions, {}).deliver('sample', send);
    expect(send).not.toHaveBeenCalled();
  });
  it('reports real sends and failures, without exposing exception text', async () => {
    const { service } = setup();
    await service.deliver('sample', async () => 'ok');
    await expect(service.deliver('sample', async () => { throw Error('secret-token'); })).rejects.toThrow();
    const snapshot = service.snapshot();
    expect(snapshot.services[0].observation).toMatchObject({ sent: 1, failed: 1 });
    expect(JSON.stringify(snapshot)).not.toContain('secret-token');
  });
  it('rejects stale writes, unknown services and invalid values', async () => {
    const { service } = setup();
    await service.change('sample', 0, { values: { minutes: 20 } });
    await expect(service.change('sample', 0, { enabled: false })).rejects.toMatchObject({ code: 'settings_conflict' });
    await expect(service.change('missing', 1, { enabled: false })).rejects.toMatchObject({ status: 404 });
    await expect(service.change('sample', 1, { values: { minutes: 500 } })).rejects.toMatchObject({ code: 'invalid_settings' });
    expect(service.setting('sample', 'minutes')).toBe(20);
  });
  it('starts and stops the adapter; stopped service remains stopped after restart', async () => {
    const { file, service } = setup();
    let running = false;
    const adapter = { start: vi.fn(() => { running = true; }), stop: vi.fn(() => { running = false; }), isRunning: () => running };
    await service.bind('sample', adapter);
    expect(running).toBe(true);
    await service.change('sample', 0, { running: false });
    expect(running).toBe(false);
    const rebooted = new NotificationServices(file, definitions, {});
    await rebooted.bind('sample', adapter);
    expect(running).toBe(false);
    await rebooted.change('sample', 1, { running: true });
    expect(running).toBe(true);
  });
  it('does not claim a start succeeded when the adapter cannot start', async () => {
    const { service } = setup();
    await service.bind('sample', { start() {}, stop() {}, isRunning: () => false });
    await expect(service.change('sample', 0, { running: true })).rejects.toMatchObject({ code: 'service_not_configured' });
    expect(service.snapshot().services[0].lifecycle).toMatchObject({ running: false, error: true });
  });
  it('failed disk writes preserve the previous policy', async () => {
    const { file, service } = setup();
    service.snapshot();
    fs.mkdirSync(file + '.tmp');
    await expect(service.change('sample', 0, { enabled: false })).rejects.toMatchObject({ code: 'change_failed' });
    expect(service.enabled('sample')).toBe(true);
    expect(service.snapshot().version).toBe(0);
  });
  it('corrupt settings do not silently enable disabled deliveries', async () => {
    const { file, service } = setup();
    fs.writeFileSync(file, '{broken');
    const send = vi.fn(async () => undefined);
    await expect(service.deliver('sample', send)).rejects.toMatchObject({ code: 'settings_unavailable' });
    expect(send).not.toHaveBeenCalled();
  });
});
