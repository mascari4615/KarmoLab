import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { UserPresence } from '../services/user-presence';
import { registerUserPresenceFeed } from './user-presence-feed';

it('authenticates the read-only feed, exposes only effective state and fails closed on storage errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-feed-'));
  const file = path.join(dir, 'state.json'), service = new UserPresence(file);
  let token = 'a'.repeat(64);
  const app = express();
  registerUserPresenceFeed(app, service, () => token);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/user-presence`;
  const get = (value: string) => fetch(url, { headers: { Authorization: `Bearer ${value}` } });
  try {
    expect((await fetch(url)).status).toBe(401);
    expect((await get('b'.repeat(64))).status).toBe(401);
    const initial = await get(token);
    expect(initial.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(await initial.json()).sort()).toEqual(['evaluatedAt', 'state']);
    service.update({ action: 'manual', revision: 0, state: 'work', until: null });
    expect((await (await get(token)).json()).state).toBe('work');
    expect((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    token = '';
    expect((await get('a'.repeat(64))).status).toBe(401);
    token = 'b'.repeat(64);
    expect((await get('a'.repeat(64))).status).toBe(401);
    fs.writeFileSync(file, '{bad');
    expect((await get(token)).status).toBe(503);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true });
  }
});
