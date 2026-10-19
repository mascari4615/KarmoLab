import type { Express } from 'express';
import { Routes, type Client } from 'discord.js';
import { requireDashOwner } from './dash-owner';
import { NotificationControlError, type NotificationServices } from '../services/notification-services';
import { primaryGuildId, channelIdFor } from '../services/channel-provision';

export interface NotificationConnections {
  channel: { id: string; name: string; url: string } | null;
  services: { id: string; title: string; description: string; group: string; kind: 'external'; connected: boolean; lastSeenAt: string | null; url: string }[];
}
export function registerNotificationServices(app: Express, services: NotificationServices, connections: () => Promise<NotificationConnections>, request: typeof fetch = fetch): void {
  const base = '/dash/notification-services';
  requireDashOwner(app, base, 'GET, PATCH, OPTIONS', request);
  app.get(base, async (_req, res) => {
    try {
      const internal = services.snapshot();
      const external = await connections();
      res.json({ ...internal, channel: external.channel, services: [...internal.services, ...external.services], collectedAt: new Date().toISOString(), observationsSince: new Date(Date.now() - process.uptime() * 1000).toISOString() });
    } catch { res.status(503).json({ error: 'services_unavailable' }); }
  });
  app.patch(`${base}/:id`, async (req, res) => {
    const body = req.body;
    if (!body || !Number.isSafeInteger(body.version) || Object.keys(body).some(key => !['version', 'enabled', 'running', 'values'].includes(key)) || Object.keys(body).length < 2) { res.status(400).json({ error: 'invalid_settings' }); return; }
    const { version, ...patch } = body;
    try {
      await services.change(String(req.params.id), version, patch);
      res.json(services.snapshot());
    } catch (error) {
      const control = error instanceof NotificationControlError ? error : new NotificationControlError('change_failed', 503);
      res.status(control.status).json({ error: control.code });
    }
  });
}

export async function collectNotificationConnections(client: Client): Promise<NotificationConnections> {
  const guild = primaryGuildId();
  const id = channelIdFor('ops-report');
  if (!guild || !id || !client.isReady()) throw new Error('discord_unavailable');
  const channel = await client.channels.fetch(id);
  if (!channel || !('name' in channel)) throw new Error('channel_unavailable');
  const url = `https://discord.com/channels/${guild}/${id}`;
  const hooks = await client.rest.get(Routes.guildWebhooks(guild)) as { id: string; name: string; channel_id: string }[];
  const messages = await client.rest.get(Routes.channelMessages(id), { query: new URLSearchParams({ limit: '100' }) }) as { webhook_id?: string; timestamp: string }[];
  return { channel: { id, name: channel.name, url }, services: hooks.filter(hook => hook.channel_id === id).map(hook => ({
    id: `webhook-${hook.id}`, title: hook.name || '외부 웹훅', description: '연결된 외부 서비스. 실행과 중지는 원래 서비스에서 관리', group: '외부 연결', kind: 'external', connected: true,
    lastSeenAt: messages.find(message => message.webhook_id === hook.id)?.timestamp ?? null, url,
  })) };
}
