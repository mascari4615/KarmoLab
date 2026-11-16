// 틀 시험: 소리 페이드 세 상태 촬영과 값 확인. 실행: node scripts/shot-flow.mjs <출력 폴더>
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './e2e-mount.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) throw new Error('출력 폴더 필요');
mkdirSync(out, { recursive: true });

function wav(seconds = 2, rate = 44100) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.sin((2 * Math.PI * 200 * i) / rate) >= 0 ? 24000 : -24000, 44 + i * 2);
  return buf;
}

const { server, url } = await serve(join(app, 'dist'));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '#audiofade');
await page.waitForSelector('#afDrop');
const seen = () => page.evaluate(() => ['#afDrop', '#afStatus', '#afControls', '#afRun', '#afSave', '#afPlay'].map((s) => {
  const el = document.querySelector(s);
  return s + '=' + (el && el.getClientRects().length ? 'Y' : 'N');
}).join(' '));
console.log('처음', await seen());
await page.screenshot({ path: join(out, '1-idle.png') });
await page.setInputFiles('#afFile', { name: '시험음.wav', mimeType: 'audio/wav', buffer: wav() });
await page.waitForFunction(() => !document.querySelector('#afRun').disabled);
console.log('파일 뒤', await seen());
await page.screenshot({ path: join(out, '2-loaded.png') });
await page.click('#afAuto');
await page.click('#afRun');
await page.waitForFunction(() => document.querySelector('#afPlay')?.src);
await page.waitForFunction(() => document.querySelector('#afSave').getClientRects().length > 0);
console.log('실행 뒤', await seen());
await page.screenshot({ path: join(out, '3-result.png') });
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#afSave')]);
console.log('저장', dl.suggestedFilename(), '| 상태:', await page.locator('#afStatus').innerText());
console.log('이어서', await page.locator('.tool-next-btn').count());
await browser.close();
server.close();
console.log('오류', errors.length, errors.slice(0, 2).join(' | '));
process.exit(errors.length ? 1 : 0);
