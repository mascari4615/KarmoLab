/**
 * KarmoWebExtension 수집 탭 회수 검사.
 *
 * 왜 있나: MV3 워커는 30초 무활동이면 죽는다. 죽으면 `finally` 가 안 돌아
 * 수집 탭이 사용자 창에 그대로 남는다. 2026-09-22 에 치지직 창 다섯이 남아
 * Edge 사망 뒤 작업 표시줄 유령. 0.12.3 에서 수정
 *
 * 재는 것 둘
 *   A. 수집 한 바퀴 뒤 탭 수가 제자리, 기록도 비어 있다 (정상 경로)
 *   B. 기록에 남은 id 를 회수 함수가 닫는다 (워커 사망 뒤 경로)
 *
 * 사용자 Edge 와 무관. 전용 프로필에 확장 별도 적재
 * playwright 나 Edge 가 없으면 CANNOT-RUN 으로 끝낸다 (통과 아님).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..', '..', 'karmo-web-extension');
const PW = path.join(os.homedir(), '.wm-playwright', 'node_modules', 'playwright', 'index.mjs');
const PROFILE = path.join(os.homedir(), '.karmoddrine', 'ext-test-profile');

if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
  console.error('[ext-tabs] FAIL 확장 폴더 없음:', EXT);
  process.exit(1);
}
if (!fs.existsSync(PW)) {
  console.log('[ext-tabs] CANNOT-RUN playwright 없음:', PW);
  process.exit(0);
}

const { chromium } = await import(pathToFileURL(PW).href);

let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'msedge',
    headless: false,
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
} catch (e) {
  console.log('[ext-tabs] CANNOT-RUN Edge 를 못 띄움:', e.message);
  process.exit(0);
}

const fails = [];
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  const ver = await sw.evaluate(() => chrome.runtime.getManifest().version);
  const before = await sw.evaluate(() => chrome.tabs.query({}).then((t) => t.length));

  // A. 정상 경로. 로그인 여부와 무관, 탭은 열린 뒤 닫힘
  await sw.evaluate(() => runInTab('https://chzzk.naver.com/', 'follows.js', 'collectChzzkFollows').catch(() => null));
  const afterA = await sw.evaluate(() => chrome.tabs.query({}).then((t) => t.length));
  const leftA = await sw.evaluate(() => chrome.storage.local.get('karmo.openTabs').then((o) => o['karmo.openTabs'] || []));
  if (afterA !== before) fails.push(`A 탭이 남았다 ${before} -> ${afterA}`);
  if (leftA.length) fails.push(`A 기록이 안 비었다 ${JSON.stringify(leftA)}`);

  // B. 워커 사망 뒤 경로. 고아 생성 후 회수
  const seeded = await sw.evaluate(async () => {
    const t = await chrome.tabs.create({ url: 'https://chzzk.naver.com/', active: false });
    await chrome.storage.local.set({ 'karmo.openTabs': [t.id] });
    return t.id;
  });
  const closed = await sw.evaluate(() => reapOrphanTabs());
  const alive = await sw.evaluate((id) => chrome.tabs.get(id).then(() => true).catch(() => false), seeded);
  const end = await sw.evaluate(() => chrome.tabs.query({}).then((t) => t.length));
  if (closed !== 1) fails.push(`B 회수 수가 1 이 아니다 ${closed}`);
  if (alive) fails.push('B 심은 탭이 안 닫혔다');
  if (end !== before) fails.push(`B 끝 탭 수가 다르다 ${before} -> ${end}`);

  console.log(`[ext-tabs] 판 ${ver}, 탭 ${before} -> ${afterA} -> ${end}, 회수 ${closed}`);
} catch (e) {
  fails.push('예외 ' + e.message);
} finally {
  await ctx.close().catch(() => {});
}

if (fails.length) {
  for (const f of fails) console.error('[ext-tabs] FAIL', f);
  process.exit(1);
}
console.log('[ext-tabs] PASS 수집 탭 회수 2건');
