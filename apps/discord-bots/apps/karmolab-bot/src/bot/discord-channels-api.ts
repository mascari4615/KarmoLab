import type { Express } from 'express';
import { Client, Routes } from 'discord.js';
import { requireDashOwner } from './dash-owner';
import { allowedGuildIds, channelIdFor, getChannelSpec } from '../services/channel-provision';

export interface ChannelRecord {
  id: string; name: string; type: number; parent_id?: string | null;
  position?: number; topic?: string | null; last_message_id?: string | null;
}

export function channelMetadata(channels: ChannelRecord[], mappings: { key: string; id: string | null; topic?: string }[]) {
  return channels.map(channel => {
    let lastMessageAt: string | null = null;
    if (/^\d{17,20}$/.test(channel.last_message_id || '') && [0, 5].includes(channel.type)) {
      lastMessageAt = new Date(Number(BigInt(channel.last_message_id!) >> 22n) + 1420070400000).toISOString();
    }
    return {
      id: channel.id, name: channel.name, type: channel.type, parentId: channel.parent_id || null,
      position: channel.position || 0,
      topic: (channel.topic || '').replace(/(https?:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+)\/[^\s]+/g, '$1/[redacted]'),
      lastMessageAt, logicalKeys: mappings.filter(mapping => mapping.id === channel.id).map(mapping => mapping.key),
    };
  });
}

export function registerDiscordChannels(app: Express, collect: () => Promise<unknown>, request: typeof fetch = fetch): void {
  const path = '/dash/discord-channels';
  requireDashOwner(app, path, 'GET, OPTIONS', request);
  let cache: unknown;
  let cachedAt = 0;
  let pending: Promise<unknown> | null = null;
  app.get(path, async (_req, res) => {
    try {
      if (!cache || Date.now() - cachedAt > 30_000) {
        if (!pending) pending = collect().then(data => { cache = data; cachedAt = Date.now(); return data; }).finally(() => { pending = null; });
        await pending;
      }
      res.json(cache);
    } catch { res.status(503).json({ error: 'discord_channels_unavailable' }); }
  });
}

export async function collectDiscordChannels(client: Client) {
  if (!client.isReady()) throw new Error('discord_not_ready');
  const mappings = getChannelSpec().channels.map(channel => ({ key: channel.key, id: channelIdFor(channel.key), topic: channel.topic }));
  const guilds = [];
  for (const id of allowedGuildIds()) {
    const guild = client.guilds.cache.get(id);
    if (!guild) continue;
    const channels = await client.rest.get(Routes.guildChannels(id)) as ChannelRecord[];
    guilds.push({ id, name: guild.name, channels: channelMetadata(channels, mappings) });
  }
  return { schema: 1, collectedAt: new Date().toISOString(), guilds };
}
