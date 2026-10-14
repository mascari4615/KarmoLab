import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPersonalNotifications } from './personal-notifications-api';
import type { PersonalNotifications } from '../services/personal-notifications';

const servers: http.Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function setup(login = 'mascari4615') {
  const report = { collectedAt: '2026-10-14T00:00:00Z', connected: true, errors: [], events: [], tasks: [], anime: [] };
  const service = { status: vi.fn(() => report), collect: vi.fn(async () => report), updateConnection: vi.fn(), disconnect: vi.fn(), tick: vi.fn(async () => {}) };
  const request = vi.fn(async () => Response.json({ login }));
  const app = express(); app.use(express.json()); registerPersonalNotifications(app, service as unknown as PersonalNotifications, request as typeof fetch);
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.on('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const call = (method: string, body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fixture-owner' }): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/dash/notifications', method, headers: { 'Content-Type': 'application/json', ...headers } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: text ? JSON.parse(text) : null }));
    }); req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
  return { call, service, request };
}
describe('개인 알림 API 인증과 저장', () => {
  it('무인증 읽기와 저장 차단, 외부 인증 요청도 없음', async () => {
    const x = await setup(); expect((await x.call('GET', undefined, {})).status).toBe(401);
    expect((await x.call('POST', { refreshToken: 'secret' }, {})).status).toBe(401);
    expect(x.request).not.toHaveBeenCalled(); expect(x.service.updateConnection).not.toHaveBeenCalled();
  });
  it('다른 계정과 다른 출처 차단', async () => {
    const x = await setup('someone-else'); expect((await x.call('GET')).status).toBe(403);
    expect((await x.call('GET', undefined, { Authorization: 'Bearer fixture', Origin: 'https://other.example' })).status).toBe(403);
    expect(x.service.status).not.toHaveBeenCalled();
  });
  it('깨진 일정과 토큰으로 저장 전 상태 유지', async () => {
    const x = await setup();
    expect((await x.call('POST', { localEvents: [{ id: 'one', title: 'bad', start: 'not-a-date' }], localTasks: [], localThrough: '2026-12-01', refreshToken: 'fixture-token' })).status).toBe(400);
    expect(x.service.updateConnection).not.toHaveBeenCalled();
  });
  it('허용된 연결 저장, 응답에 토큰 제외, 요청한 시험 전송만 실행', async () => {
    const x = await setup(); const response = await x.call('POST', { localEvents: [], localTasks: [], localThrough: '2026-12-01', refreshToken: 'fixture-secret-token', preview: true });
    expect(response.status).toBe(200); expect(JSON.stringify(response.body)).not.toContain('fixture-secret-token');
    expect(x.service.updateConnection.mock.calls[0][0].refreshToken).toBe('fixture-secret-token'); expect(x.service.tick).toHaveBeenCalledOnce();
  });
  it('일반 동기화는 시험 전송하지 않음, 구글 연결 해제', async () => {
    const x = await setup(); expect((await x.call('POST', { localEvents: [], localTasks: [], localThrough: '2026-12-01' })).status).toBe(200);
    expect(x.service.tick).not.toHaveBeenCalled(); expect((await x.call('DELETE')).status).toBe(200); expect(x.service.disconnect).toHaveBeenCalledOnce();
  });
});
