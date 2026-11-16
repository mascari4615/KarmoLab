// 실제 파일을 넣은 전 도구 화면 촬영과 오류 수집. 실행: node scripts/review-all.mjs <출력 폴더>
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './e2e-mount.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) throw new Error('출력 폴더 필요');
mkdirSync(out, { recursive: true });
const require = createRequire(join(app, '../karmolab/package.json'));
const sharp = require('sharp');
const work = mkdtempSync(join(tmpdir(), 'karmo-edit-review-'));
const png = join(work, 'photo.png');
const jpg = join(work, 'photo.jpg');
const mp4 = join(work, 'clip.mp4');
const wav = join(work, 'sound.wav');
const srt = join(work, 'sub.srt');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g"><stop offset="0" stop-color="#2d6cdf"/><stop offset="1" stop-color="#f0a030"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="600" cy="400" r="220" fill="#fff"/></svg>');
await sharp(svg).png().toFile(png);
await sharp(svg).withExif({ IFD0: { Make: 'KarmoTestCam' } }).jpeg().toFile(jpg);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', wav]);
writeFileSync(srt, '1\n00:00:01,000 --> 00:00:02,000\n시험 자막\n');

const table = JSON.parse(readFileSync(join(app, 'tools.json'), 'utf8'));
const ids = [...new Set([...Object.keys(table.hubs), ...Object.values(table.hubs).flat(), ...table.standalone])];
const fileFor = (accept) => {
  const a = (accept || '').toLowerCase();
  if (a.includes('srt') || a.includes('.vtt')) return srt;
  if (a.includes('image')) return a.includes('jpeg') ? jpg : png;
  if (a.includes('video')) return mp4;
  if (a.includes('audio')) return wav;
  return null;
};

const { server, url } = await serve(join(app, 'dist'));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let errors = [];
page.on('pageerror', (e) => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' <- ')));
page.on('requestfailed', (r) => errors.push('요청 실패: ' + r.url()));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__karmoEditOpen);
const rows = [];
for (const id of ids) {
  errors = [];
  await page.evaluate((x) => window.__karmoEditOpen(x), id);
  await page.waitForTimeout(900);
  const input = page.locator('#ktMain input[type=file]').first();
  let used = '';
  if (await input.count()) {
    const f = fileFor(await input.getAttribute('accept'));
    if (f) {
      await input.setInputFiles(f);
      used = f.split(/[\\/]/).pop();
      await page.waitForTimeout(/video/.test(await input.getAttribute('accept') || '') ? 2600 : 1400);
    }
  }
  await page.screenshot({ path: join(out, id + '.png') });
  const m = await page.evaluate(() => {
    const main = document.getElementById('ktMain');
    const visible = (el) => el.getClientRects().length > 0;
    const buttons = [...main.querySelectorAll('button')].filter(visible);
    const primary = buttons.filter((b) => b.classList.contains('btn-primary'));
    const overflow = main.scrollWidth - main.clientWidth;
    const narrowest = primary.length ? Math.round(primary[0].getBoundingClientRect().width) : 0;
    const tall = [...main.querySelectorAll('canvas,img,video')].filter(visible).filter((e) => e.getBoundingClientRect().height > innerHeight * 0.66).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : ''));
    const runBelow = primary.length ? Math.round(primary[0].getBoundingClientRect().bottom - innerHeight) : 0;
    return { tall, runBelow, buttons: buttons.length, primary: primary.length, primaryWidth: narrowest, overflow, status: (main.querySelector('.tool-status')?.textContent || '').trim().slice(0, 70) };
  });
  rows.push({ id, used, ...m, errors: errors.slice(0, 2) });
  console.log([id, used || '-', 'btn', m.buttons, 'primary', m.primary, m.primaryWidth + 'px', 'over', m.overflow, 'tall', m.tall.join(',') || '-', 'below', m.runBelow, m.status, errors.length ? 'ERR ' + errors[0].slice(0, 200) : ''].join(' | '));
}
writeFileSync(join(out, 'review.json'), JSON.stringify(rows, null, 1));
await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });
console.log('오류 도구', rows.filter((r) => r.errors.length).length, '/', rows.length);
