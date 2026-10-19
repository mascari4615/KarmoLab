import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({ post: vi.fn(async () => ({})), send: vi.fn(async () => ({})) }));
vi.mock('discord.js', async importOriginal => ({ ...await importOriginal<typeof import('discord.js')>(), REST: class { setToken() { return this; } post = mocks.post; } }));
vi.mock('../services/webhook-routes', () => ({ getChannelsForRepo: () => ['CHANNEL'] }));
vi.mock('../services/notification-services', () => ({ notificationServices: { deliver: (_id: string, send: () => unknown) => Promise.resolve(send()) } }));
vi.mock('../services/channel-provision', () => ({ channelIdFor: () => 'CHANNEL' }));
vi.mock('../services/digest-webhook', () => ({ isDigestCommit: () => false, handleDigestCommit: vi.fn() }));
import { createGithubWebhookApp } from './webhook';
import { reportStartup, reportDeploy, reportError, reportDeployFreshness, type OpsReportContext } from '../services/ops-self-report';

let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; vi.clearAllMocks(); });
async function push(messages: string[]) {
  const client = { on: vi.fn(), channels: { fetch: async () => ({ isSendable: () => true, send: mocks.send }) } };
  const app = createGithubWebhookApp(client as never, { getMessage: () => 'GitHub' } as never);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as { port: number };
  return fetch(`http://127.0.0.1:${address.port}/webhook/github`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-github-event': 'push' }, body: JSON.stringify({ repository: { full_name: 'owner/repo' }, commits: messages.map(message => ({ id: 'abc1234', message, url: 'https://github.com/owner/repo/commit/abc1234' })) }) });
}
const ctx: OpsReportContext = { token: 'test', env: 'prod', hostname: 'host', gitCommit: 'unknown', adminMentionIds: ['123'] };
describe('actual notification send paths', () => {
  it('sends push as a small blue embed with no author or body', async () => {
    expect((await push(['fix: visible\n\nbody\nCo-Authored-By: hidden'])).status).toBe(200);
    const body = mocks.send.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ allowedMentions: { parse: [] }, embeds: [{ color: 0x4285f4 }] });
    expect(JSON.stringify(body)).not.toMatch(/body|Co-Authored|author|timestamp|footer/);
  });
  it('does not send routine backup/heartbeat pushes', async () => {
    expect((await push(['chore(heartbeat): alive', 'chore(charstate): snapshot'])).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('startup sends one short message and slash success stays in logs', async () => {
    await reportDeploy(ctx, { count: 17, target: 'guild:test' });
    expect(mocks.post).not.toHaveBeenCalled();
    await reportStartup(ctx, { botTag: 'Byeoru#1234', guilds: 2, users: 2 });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const body = (mocks.post.mock.calls[0][1] as { body: { embeds: { color: number; description: string }[] } }).body;
    expect(body.embeds[0].color).toBe(0x2ecc71);
    expect(body.embeds[0].description.split('\n')).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/unknown|footer|timestamp|author/);
  });
  it('critical errors still ping only allowed admins', async () => {
    await reportError(ctx, new Error('unique compact failure'), 'uncaughtException');
    const body = (mocks.post.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.content).toContain('<@123>');
    expect(body.allowed_mentions).toEqual({ parse: [], users: ['123'] });
  });
  it('shows unreachable, stale and recovered as noun labels with distinct colors', async () => {
    for (const state of ['unreachable', 'stale', 'fresh'] as const) {
      await reportDeployFreshness(ctx, { state, healthy: state === 'fresh', reason: 'long diagnostic prose only for logs', ageMin: 90, httpStatus: state === 'unreachable' ? 404 : undefined, workflowUrl: 'https://github.com/owner/repo/actions', siteCommit: 'aaaaaaa', headCommit: 'bbbbbbb' });
    }
    const cards = mocks.post.mock.calls.map(call => (call[1] as { body: { embeds: { color: number; description: string }[] } }).body.embeds[0]);
    expect(cards.map(card => card.color)).toEqual([0xe67e22, 0xe74c3c, 0x2ecc71]);
    expect(cards[0].description).toContain('조회 실패 / HTTP 404');
    expect(cards[1].description).toContain('업데이트 지연');
    expect(cards[2].description).toContain('최신 버전');
    expect(JSON.stringify(cards)).not.toMatch(/long diagnostic|배포가 안|건너뛰/);
  });
});
