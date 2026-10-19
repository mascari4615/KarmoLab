import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({ post: vi.fn(async () => ({})), send: vi.fn(async () => ({})) }));
vi.mock('discord.js', async importOriginal => ({ ...await importOriginal<typeof import('discord.js')>(), REST: class { setToken() { return this; } post = mocks.post; } }));
vi.mock('../services/webhook-routes', () => ({ getChannelsForRepo: () => ['CHANNEL'] }));
vi.mock('../services/notification-services', () => ({ notificationServices: { deliver: (_id: string, send: () => unknown) => Promise.resolve(send()) } }));
vi.mock('../services/channel-provision', () => ({ channelIdFor: () => 'CHANNEL' }));
vi.mock('../services/digest-webhook', () => ({ isDigestCommit: () => false, handleDigestCommit: vi.fn() }));
import { createGithubWebhookApp } from './webhook';
import { reportStartup, reportDeploy, reportError, type OpsReportContext } from '../services/ops-self-report';

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
  it('sends push as compact text with previews and mentions disabled', async () => {
    expect((await push(['fix: visible\n\nbody\nCo-Authored-By: hidden'])).status).toBe(200);
    const body = mocks.send.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ flags: 4, allowedMentions: { parse: [] } });
    expect(body.embeds).toBeUndefined();
    expect(body.content).not.toMatch(/body|Co-Authored/);
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
    const body = (mocks.post.mock.calls[0][1] as { body: { content: string; embeds?: unknown } }).body;
    expect(body.embeds).toBeUndefined();
    expect(body.content).not.toContain('\n');
    expect(body.content).not.toContain('unknown');
  });
  it('critical errors still ping only allowed admins', async () => {
    await reportError(ctx, new Error('unique compact failure'), 'uncaughtException');
    const body = (mocks.post.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.content).toContain('<@123>');
    expect(body.allowed_mentions).toEqual({ parse: [], users: ['123'] });
  });
});
