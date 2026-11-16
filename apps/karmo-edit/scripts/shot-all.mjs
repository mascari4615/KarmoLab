// 도구 전부를 1920x1080으로 촬영. 실행: node scripts/shot-all.mjs <출력 폴더>
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from './e2e-mount.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) throw new Error('출력 폴더 필요');
mkdirSync(out, { recursive: true });
const table = JSON.parse(readFileSync(join(app, 'tools.json'), 'utf8'));
const ids = [...Object.keys(table.hubs), ...Object.values(table.hubs).flat(), ...table.standalone];
const { server, url } = await serve(join(app, 'dist'));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
for (const id of [...new Set(ids)]) {
  await page.evaluate((x) => window.__karmoEditOpen(x), id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, id + '.png') });
}
await browser.close();
server.close();
console.log('촬영', new Set(ids).size);
