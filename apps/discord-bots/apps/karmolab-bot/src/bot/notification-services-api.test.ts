import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationServices } from '../services/notification-services';
import { registerNotificationServices } from './notification-services-api';

const servers: http.Server[] = [], directories: string[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
async function setup(login = 'mascari4615') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-api-')); directories.push(dir);
  const service = new NotificationServices(path.join(dir, 'settings.json'));
  const collect = vi.fn(async () => ({ channel: null, services: [] }));
  const app = express(); app.use(express.json());
  registerNotificationServices(app, service, collect, (async () => Response.json({ login })) as typeof fetch);
  const server = app.listen(0, '127.0.0.1'); servers.push(server); await new Promise<void>(resolve => server.on('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const call = (method: string, suffix = '', body?: object, headers: Record<string,string> = { Authorization: 'Bearer test' }): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/dash/notification-services' + suffix, method, headers: { ...headers, 'Content-Type': 'application/json' } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode!, body: text ? JSON.parse(text) : null }));
    }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  return { service, collect, call };
}
it('rejects anonymous, non-owner and unrelated origins before modifying settings', async () => {
  const x = await setup('other');
  expect((await x.call('PATCH', '/github', { version: 0, enabled: false }, {})).status).toBe(401);
  expect((await x.call('PATCH', '/github', { version: 0, enabled: false })).status).toBe(403);
  expect((await x.call('GET', '', undefined, { Authorization: 'Bearer test', Origin: 'https://example.org' })).status).toBe(403);
  expect(x.service.enabled('github')).toBe(true);
  expect(x.collect).not.toHaveBeenCalled();
});
it('edits only declared controls and detects concurrent changes', async () => {
  const x = await setup();
  expect((await x.call('GET')).body.services.length).toBeGreaterThan(0);
  expect((await x.call('PATCH', '/github', { version: 0, enabled: false })).status).toBe(200);
  expect(x.service.enabled('github')).toBe(false);
  expect((await x.call('PATCH', '/github', { version: 0, enabled: true })).status).toBe(409);
  expect((await x.call('PATCH', '/github', { version: 1, running: false })).status).toBe(409);
  expect((await x.call('PATCH', '/not-registered', { version: 1, enabled: true })).status).toBe(404);
  expect((await x.call('PATCH', '/github', { version: 1, command: 'anything' })).status).toBe(400);
});
it('external collection failure is explicit and does not fabricate a healthy list', async () => {
  const x = await setup(); x.collect.mockRejectedValueOnce(Error('secret-token'));
  const result = await x.call('GET'); expect(result.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain('secret-token');
});
