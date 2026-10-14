import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { channelMetadata, registerDiscordChannels } from './discord-channels-api';

const servers: http.Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function setup(login = 'mascari4615', collect = vi.fn(async () => ({ guilds: [], collectedAt: 'fixture' }))) {
  const app = express();
  const auth = vi.fn(async () => Response.json({ login }));
  registerDiscordChannels(app, collect, auth as typeof fetch);
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.on('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const call = (headers: Record<string, string> = { Authorization: 'Bearer fixture' }, method = 'GET'): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/dash/discord-channels', method, headers }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: text ? JSON.parse(text) : null }));
    }); req.on('error', reject); req.end();
  });
  return { collect, auth, call };
}
it('인증 없는 사용자와 다른 계정, 출처는 채널 수집 전에 차단', async () => {
  const x = await setup('other');
  expect((await x.call({})).status).toBe(401);
  expect(x.auth).not.toHaveBeenCalled();
  expect((await x.call()).status).toBe(403);
  expect((await x.call({ Authorization: 'Bearer fixture', Origin: 'https://example.com' })).status).toBe(403);
  expect(x.collect).not.toHaveBeenCalled();
});
it('본인 조회는 캐시 공유, OPTIONS는 인증과 수집 없이 응답', async () => {
  const x = await setup();
  expect((await x.call({}, 'OPTIONS')).status).toBe(204);
  expect(x.auth).not.toHaveBeenCalled();
  const replies = await Promise.all([x.call(), x.call()]);
  expect(replies.map(reply => reply.status)).toEqual([200, 200]);
  expect(x.collect).toHaveBeenCalledOnce();
  expect((await x.call()).status).toBe(200);
  expect(x.collect).toHaveBeenCalledOnce();
});
it('조회 실패는 빈 목록으로 숨기지 않고 503, 다음 요청에서 복구', async () => {
  const collect = vi.fn().mockRejectedValueOnce(new Error('fixture')).mockResolvedValue({ guilds: [], collectedAt: 'restored' });
  const x = await setup('mascari4615', collect);
  expect((await x.call()).status).toBe(503);
  expect((await x.call()).body.collectedAt).toBe('restored');
});
it('메시지 본문과 webhook 비밀을 제외, 글 시각과 운영 ID는 보존', () => {
  const id = ((BigInt(Date.parse('2026-10-14T00:00:00Z') - 1420070400000) << 22n) + 1n).toString();
  const raw = { id: 'one', name: 'same', type: 0, parent_id: 'cat', position: 2, last_message_id: id, topic: 'https://discord.com/api/webhooks/123/secret', token: 'private', messages: ['private-body'] };
  const [channel] = channelMetadata([raw], [{ key: 'news', id: 'one' }]);
  expect(channel.lastMessageAt).toBe('2026-10-14T00:00:00.000Z');
  expect(channel.logicalKeys).toEqual(['news']);
  expect(JSON.stringify(channel)).not.toContain('secret');
  expect(JSON.stringify(channel)).not.toContain('private');
  expect(channelMetadata([{ ...raw, type: 15, last_message_id: null }], [])[0].lastMessageAt).toBeNull();
});
