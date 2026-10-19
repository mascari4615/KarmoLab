import type { Express } from 'express';
import type { PersonalNotifications, AgendaEvent, AgendaTask } from '../services/personal-notifications';
import { requireDashOwner } from './dash-owner';

const PATH = '/dash/notifications';

export function registerPersonalNotifications(app: Express, service: PersonalNotifications, request: typeof fetch = fetch): void {
  requireDashOwner(app, PATH, 'GET, POST, DELETE, OPTIONS', request);
  app.get(PATH, async (_req, res) => {
    try { res.json(service.status().collectedAt ? service.status() : await service.collect()); }
    catch { res.status(503).json({ error: 'collection_unavailable' }); }
  });
  app.post(`${PATH}/anime`, (req, res) => {
    const body = req.body;
    if (!body || typeof body.key !== 'string' || body.key.length > 200 || typeof body.watched !== 'boolean') { res.status(400).json({ error: 'invalid_episode_update' }); return; }
    try { res.json(service.setAnimeWatched(body.key, body.watched)); }
    catch (error) { res.status((error as Error).message === 'episode_not_found' ? 404 : 503).json({ error: 'episode_update_failed' }); }
  });
  app.post(PATH, async (req, res) => {
    const body = req.body;
    if (!body || typeof body.deviceId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.deviceId)) { res.status(400).json({ error: 'device_id_required_reload' }); return; }
    if (!body || !Array.isArray(body.localEvents) || !Array.isArray(body.localTasks) || body.localEvents.length > 500 || body.localTasks.length > 1000) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    const validString = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
    const dateString = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value) && Number.isFinite(Date.parse(value));
    if (body.localEvents.some((e: AgendaEvent) => !e || !validString(e.id) || !validString(e.title) || !dateString(e.start) || !dateString(e.end) || typeof e.allDay !== 'boolean') || body.localTasks.some((t: AgendaTask) => !t || !validString(t.id) || !validString(t.title) || (t.due !== undefined && !dateString(t.due))) || !dateString(body.localThrough) || (body.refreshToken !== undefined && (!validString(body.refreshToken, 2048) || body.refreshToken.length < 10))) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    try {
      service.updateConnection({
        deviceId: body.deviceId,
        ...(body.refreshToken ? { refreshToken: body.refreshToken } : {}),
        localEvents: body.localEvents.map((e: AgendaEvent) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, source: '이 브라우저' })),
        localTasks: body.localTasks.map((t: AgendaTask) => ({ id: t.id, title: t.title, due: t.due, status: t.status })),
        localThrough: body.localThrough, localUpdatedAt: new Date().toISOString(),
      });
      const report = await service.collect();
      if (body.preview === true) await service.tick(Date.now(), true);
      res.json(report);
    } catch { res.status(503).json({ error: 'sync_or_send_failed' }); }
  });
  app.delete(PATH, (_req, res) => { service.disconnect(); res.json({ connected: false }); });
}
