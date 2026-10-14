import type { Express, Request, Response, NextFunction } from 'express';
import type { PersonalNotifications, AgendaEvent, AgendaTask } from '../services/personal-notifications';

const PATH = '/dash/notifications';
const ORIGINS = new Set(['https://dash.mascari4615.com', 'http://127.0.0.1:8829', 'http://localhost:8829']);

export function registerPersonalNotifications(app: Express, service: PersonalNotifications, request: typeof fetch = fetch): void {
  app.use(PATH, async (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !ORIGINS.has(origin)) { res.status(403).json({ error: 'origin_not_allowed' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'login_required' }); return; }
    try {
      const user = await request('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'karmolab-dash-notifications' }, signal: AbortSignal.timeout(10_000) });
      if (!user.ok) { res.status(401).json({ error: 'login_required' }); return; }
      const data = await user.json() as { login?: string };
      if (data.login?.toLowerCase() !== 'mascari4615') { res.status(403).json({ error: 'owner_required' }); return; }
      next();
    } catch { res.status(503).json({ error: 'auth_unavailable' }); }
  });
  app.get(PATH, async (_req, res) => {
    try { res.json(service.status().collectedAt ? service.status() : await service.collect()); }
    catch { res.status(503).json({ error: 'collection_unavailable' }); }
  });
  app.post(PATH, async (req, res) => {
    const body = req.body;
    if (!body || !Array.isArray(body.localEvents) || !Array.isArray(body.localTasks) || body.localEvents.length > 500 || body.localTasks.length > 1000) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    const validString = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
    const dateString = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value) && Number.isFinite(Date.parse(value));
    if (body.localEvents.some((e: AgendaEvent) => !e || !validString(e.id) || !validString(e.title) || !dateString(e.start) || !dateString(e.end) || typeof e.allDay !== 'boolean') || body.localTasks.some((t: AgendaTask) => !t || !validString(t.id) || !validString(t.title) || (t.due !== undefined && !dateString(t.due))) || !dateString(body.localThrough) || (body.refreshToken !== undefined && (!validString(body.refreshToken, 2048) || body.refreshToken.length < 10))) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    try {
      service.updateConnection({
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
