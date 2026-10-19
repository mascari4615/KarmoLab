import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import type { UserPresence } from '../services/user-presence';

function feedToken(): string {
  try { return fs.readFileSync(path.join(os.homedir(), '.karmoddrine', 'user-presence-token'), 'utf8').trim(); }
  catch { return ''; }
}

export function registerUserPresenceFeed(app: Express, service: UserPresence, token = feedToken): void {
  app.get('/internal/user-presence', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = token();
    const actual = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] || '';
    const expectedBytes = Buffer.from(expected), actualBytes = Buffer.from(actual);
    if (expected.length < 32 || actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      res.status(401).json({ error: 'unauthorized' }); return;
    }
    try {
      const report = service.status();
      res.json({ state: report.current.state, evaluatedAt: report.evaluatedAt });
    } catch { res.status(503).json({ error: 'presence_storage_unavailable' }); }
  });
}
