import type { Express, Request, Response, NextFunction } from 'express';

const ORIGINS = new Set(['https://dash.mascari4615.com', 'http://127.0.0.1:8829', 'http://localhost:8829']);

export function requireDashOwner(app: Express, path: string, methods: string, request: typeof fetch = fetch): void {
  app.use(path, async (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !ORIGINS.has(origin)) { res.status(403).json({ error: 'origin_not_allowed' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'login_required' }); return; }
    try {
      const user = await request('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'karmolab-dash' }, signal: AbortSignal.timeout(10_000) });
      if (!user.ok) { res.status(401).json({ error: 'login_required' }); return; }
      const data = await user.json() as { login?: string };
      if (data.login?.toLowerCase() !== 'mascari4615') { res.status(403).json({ error: 'owner_required' }); return; }
      next();
    } catch { res.status(503).json({ error: 'auth_unavailable' }); }
  });
}
