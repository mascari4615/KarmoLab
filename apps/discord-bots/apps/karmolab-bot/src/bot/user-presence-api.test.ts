import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { UserPresence } from '../services/user-presence';
import { registerUserPresence } from './user-presence-api';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function setup(login = 'mascari4615') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-api-'));
  const app = express(); app.use(express.json());
  registerUserPresence(app, new UserPresence(path.join(dir, 'state.json')), (async () => Response.json({ login })) as typeof fetch);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
  cleanups.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true }); });
  return (method: string, body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fixture' }): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, path: '/dash/user-presence', method, headers: { 'Content-Type': 'application/json', ...headers } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: text ? JSON.parse(text) : null }));
    }); req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}
it('requires owner authentication and approved origins for reads and writes', async () => {
  const call = await setup();
  expect((await call('GET', undefined, {})).status).toBe(401);
  expect((await call('POST', { action: 'resume', revision: 0 }, {})).status).toBe(401);
  expect((await call('GET', undefined, { Authorization: 'Bearer fixture', Origin: 'https://example.org' })).status).toBe(403);
  expect((await call('OPTIONS', undefined, { Origin: 'https://dash.mascari4615.com' })).status).toBe(204);
  expect((await (await setup('other-user'))('GET')).status).toBe(403);
});
it('round trips state, rejects stale revision and leaves invalid writes unchanged', async () => {
  const call = await setup();
  expect((await call('GET')).body.current.state).toBeNull();
  expect((await call('POST', { action: 'manual', revision: 0, state: 'work', until: null })).body.current.state).toBe('work');
  expect((await call('POST', { action: 'resume', revision: 0 })).status).toBe(409);
  expect((await call('POST', { action: 'schedule', revision: 1, enabled: true, rules: [{ id: 'bad', days: [], time: '25:00', state: 'work' }] })).status).toBe(400);
  expect((await call('GET')).body.current.state).toBe('work');
  expect((await call('POST', { action: 'resume', revision: 1 })).body.current.state).toBeNull();
  const saved = await call('POST', { action: 'schedule', revision: 2, enabled: true, defaultState: 'home', rules: [{ id: 'all', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00', state: 'work' }] });
  expect(saved.status).toBe(200);
  expect(saved.body.current.state).toBe('work');
  expect((await call('GET')).body.config.rules[0]).toMatchObject({ start: '00:00', end: '24:00' });
});
