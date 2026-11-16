// 실제 파일로 사용 순서 검사: 묶음 화면에 파일 넣기, 할 일 고르기, 실행, 저장, 결과 파일 판독
// 실행: node scripts/e2e-flow.mjs [--cdp 포트]. 포트가 없으면 dist를 Edge로 검사
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './e2e-mount.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(app, '../karmolab/package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');

const work = mkdtempSync(join(tmpdir(), 'karmo-edit-'));
const p = (f) => join(work, f);
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
const dur = (f) => Number(probe(f).format.duration);
// MediaRecorder webm은 머리글에 길이 없음. 패킷 시각 범위로 판독
const packetSpan = (f) => {
  const packets = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'json', f], { maxBuffer: 1 << 26 }).toString()).packets;
  const times = packets.map((x) => Number(x.pts_time)).filter(Number.isFinite);
  return Math.max(...times) - Math.min(...times);
};

ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-ac', '2', p('tone.wav'));
ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('clip.mp4'));
await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3366aa' } })
  .withExif({ IFD0: { Make: 'KarmoTestCam' } })
  .jpeg()
  .toFile(p('photo.jpg'));

// --cdp 포트: 열려 있는 앱 창(WebView2 원격 디버깅)에 접속. 저장은 다운로드 폴더의 새 파일로 판독
const cdpAt = process.argv.indexOf('--cdp');
const cdpPort = cdpAt > 0 ? process.argv[cdpAt + 1] : null;
const downloads = join(homedir(), 'Downloads');
const createdInApp = [];
const local = cdpPort ? null : await serve(join(app, 'dist'));
const browser = cdpPort ? await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`) : await chromium.launch({ channel: 'msedge' });
const context = cdpPort ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = cdpPort ? context.pages()[0] : await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
if (cdpPort) {
  await page.reload();
  await page.waitForFunction(() => !!window.__karmoEditOpen);
  console.log('앱 창', page.url(), await page.evaluate(() => ({ tauri: !!window.__TAURI__, desktop: !!window.__KARMOLAB_DESKTOP__ })));
} else {
  await page.goto(local.url);
}

async function pick(hub, file, job) {
  await page.evaluate((h) => window.__karmoEditOpen(h), hub);
  await page.setInputFiles('#pfFile', file);
  await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
  await page.click(`.pf-job[data-job="${job}"]`);
}
async function save(button, name) {
  if (cdpPort) {
    const before = new Set(readdirSync(downloads));
    await page.click(button);
    for (let i = 0; i < 300; i++) {
      const fresh = readdirSync(downloads).find((f) => !before.has(f) && !f.endsWith('.tmp'));
      if (fresh) {
        await page.waitForTimeout(300);
        const toast = await page.evaluate(() => document.getElementById('statusToast')?.textContent || '');
        createdInApp.push(join(downloads, fresh));
        return { out: join(downloads, fresh), suggested: `${fresh} (알림: ${toast.trim().slice(0, 40)})` };
      }
      await page.waitForTimeout(200);
    }
    throw new Error('다운로드 폴더에 새 파일 없음');
  }
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(button)]);
  const out = p(name);
  await dl.saveAs(out);
  return { out, suggested: dl.suggestedFilename() };
}
async function setRange(sel, value) {
  await page.$eval(sel, (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
}

const flows = {
  async 'image > 크기 맞추기: 1600px를 640px로'() {
    await pick('image', p('photo.jpg'), 'imgresize');
    await page.waitForSelector('#irRun:not([disabled])', { timeout: 15000 });
    await page.click('#irMode [data-mode="side"]');
    await page.click('[data-side="640"]');
    await page.click('#irRun');
    await page.waitForSelector('#irSave:not([disabled]):visible', { timeout: 20000 });
    const { out } = await save('#irSave', 'resized.jpg');
    const m = await sharp(out).metadata();
    return { pass: Math.max(m.width, m.height) === 640, detail: `${m.width}x${m.height}` };
  },
  async 'image > 촬영 정보 지우기: EXIF 제거'() {
    const before = (await sharp(p('photo.jpg')).metadata()).exif?.length || 0;
    await pick('image', p('photo.jpg'), 'exifclean');
    await page.waitForSelector('#exRun:visible:not([disabled])', { timeout: 15000 });
    await page.click('#exRun');
    await page.waitForSelector('#exSave:visible', { timeout: 15000 });
    const { out } = await save('#exSave', 'clean.jpg');
    const after = (await sharp(out).metadata()).exif?.length || 0;
    return { pass: before > 0 && after === 0, detail: `exif ${before} -> ${after}바이트` };
  },
  async 'videotool > 구간 자르기: 4초를 1~3초로'() {
    await pick('videotool', p('clip.mp4'), 'videotrim');
    await page.waitForSelector('#vtRun:visible:not([disabled])', { timeout: 20000 });
    // 슬라이더 단위: 전체 길이의 1000분율
    await setRange('#vtStart', 250);
    await setRange('#vtEnd', 750);
    await page.click('#vtRun');
    await page.waitForSelector('#vtSave:visible:not([disabled])', { timeout: 30000 });
    const { out, suggested } = await save('#vtSave', 'trimmed.bin');
    const d = packetSpan(out);
    const pts = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'json', out], { maxBuffer: 1 << 26 }).toString()).packets.map((x) => Number(x.pts_time)).filter(Number.isFinite);
    const gap = Math.max(...pts.slice(1).map((v, i) => v - pts[i]));
    return { pass: d > 1.2 && d < 2.8, detail: `${suggested}, ${d.toFixed(2)}초, 패킷 ${pts.length}, 최대 간격 ${gap.toFixed(2)}, 앞 ${pts.slice(0, 5).map((v) => v.toFixed(2)).join(' ')}` };
  },
  async 'videotool > 소리 뽑기'() {
    await pick('videotool', p('clip.mp4'), 'video2audio');
    await page.waitForSelector('#vaRun:visible:not([disabled])', { timeout: 20000 });
    await page.click('#vaRun');
    await page.waitForSelector('#vaSave:visible', { timeout: 20000 });
    const { out, suggested } = await save('#vaSave', 'extracted.bin');
    const s = probe(out).streams[0];
    return { pass: s.codec_type === 'audio' && Number(probe(out).format.duration) > 3, detail: `${suggested}, ${s.codec_name}` };
  },
  async 'sound > 자르기 뒤 결과를 이어받아 페이드'() {
    await pick('sound', p('tone.wav'), 'audiocut');
    await page.waitForSelector('#acRun:visible:not([disabled])', { timeout: 20000 });
    // 슬라이더 단위: 백분율. 6초 중 1초
    await setRange('#acStart', 16.67);
    await page.click('#acRun');
    await page.waitForSelector('#acSave:visible', { timeout: 20000 });
    const cut = await save('#acSave', 'cut.bin');
    const cutDur = dur(cut.out);
    await page.waitForSelector('#pfChain:visible', { timeout: 10000 });
    await page.click('#pfChainUse');
    await page.waitForFunction(() => document.querySelector('#pfName')?.textContent && !/^tone\.wav$/.test(document.querySelector('#pfName').textContent), null, { timeout: 8000 });
    await page.click('.pf-job[data-job="audiofade"]');
    await page.waitForSelector('#afRun:visible:not([disabled])', { timeout: 20000 });
    await page.click('#afRun');
    await page.waitForSelector('#afSave:visible:not([disabled])', { timeout: 20000 });
    const fade = await save('#afSave', 'fade.bin');
    const fadeDur = dur(fade.out);
    return { pass: Math.abs(cutDur - 5) < 0.3 && Math.abs(fadeDur - cutDur) < 0.3, detail: `자르기 ${cutDur.toFixed(2)}초, 페이드 ${fadeDur.toFixed(2)}초, ${fade.suggested}` };
  },
};

if (cdpPort) {
  // 탐색기 끌어 놓기와 같은 경로. CDP 드래그 이벤트로 도구의 파일 칸에 실제 파일을 놓음
  flows['앱 창 끌어 놓기: 묶음 화면에 파일 놓기'] = async () => {
    await page.evaluate(() => window.__karmoEditOpen('sound'));
    await page.waitForSelector('#pfDrop:visible');
    const box = await page.locator('#pfDrop').boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await context.newCDPSession(page);
    const data = { items: [], files: [p('tone.wav')], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, ...at, data });
    await page.waitForSelector('#pfFileBar:visible', { timeout: 10000 });
    return { pass: (await page.locator('#pfName').innerText()) === 'tone.wav', detail: await page.locator('#pfName').innerText() };
  };
}

let bad = 0;
for (const [name, run] of Object.entries(flows)) {
  errors.length = 0;
  try {
    const r = await run();
    const pass = r.pass && !errors.length;
    if (!pass) bad++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name} | ${r.detail}${errors.length ? ' | ' + errors.join(' ; ') : ''}`);
  } catch (e) {
    bad++;
    const shot = p(name.replace(/[^a-z가-힣]/g, '') + '.png');
    console.log(`FAIL ${name} | ${String(e.message).split('\n').slice(0, 3).join(' / ')}${errors.length ? ' | ' + errors.join(' ; ') : ''} | ${shot}`);
    await page.screenshot({ path: shot });
  }
}
console.log('작업 폴더', work, statSync(work).isDirectory());
// 검사가 다운로드 폴더에 만든 파일만 회수
for (const f of createdInApp) rmSync(f, { force: true });
await browser.close();
local?.server.close();
console.log(`실패 ${bad} / ${Object.keys(flows).length}`);
process.exit(bad ? 1 : 0);
