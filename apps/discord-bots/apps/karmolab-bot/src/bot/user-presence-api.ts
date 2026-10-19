import type { Express } from 'express';
import { requireDashOwner } from './dash-owner';
import type { UserPresence } from '../services/user-presence';

export function registerUserPresence(app: Express, service: UserPresence, request: typeof fetch = fetch): void {
  const route = '/dash/user-presence';
  requireDashOwner(app, route, 'GET, POST, OPTIONS', request);
  app.get(route, (_req, res) => {
    try { res.json(service.status()); }
    catch { res.status(503).json({ error: 'presence_storage_unavailable' }); }
  });
  app.post(route, (req, res) => {
    try { res.json(service.update(req.body)); }
    catch (error) {
      const message = (error as Error).message;
      res.status(message === 'revision_conflict' ? 409 : message === 'invalid_input' ? 400 : 503).json({ error: message === 'revision_conflict' || message === 'invalid_input' ? message : 'presence_storage_unavailable' });
    }
  });
}
