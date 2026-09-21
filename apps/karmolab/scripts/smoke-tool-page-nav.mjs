/**
 * 도구 전환이 **페이지 이동**인지 잰다 (change.tool-page-navigation, 2026-09-21).
 *
 * 왜 있나: 제자리 교체는 떠나는 도구가 켠 타이머, 소리, 그리기 루프를 스스로 거둬야 끊김
 * 빠뜨리면 다음 도구에서 배경음 지속 (사용자 2026-09-21). 문서를 갈아타면 브라우저가 전부 버림
 * 계약은 `switchPage` 분기 하나. 누가 되돌리면 화면 멀쩡, 검사 전부 초록
 *
 * 재는 법: 이동 전 `window` 에 표식, 이동 뒤 남았는지 확인. 남았으면 같은 문서
 *  1. `/#loan` 해시 진입은 그 자리에 그린다 (검사 30개가 이 길로 연다. 떠날 때는 어차피 이동)
 *  2. `/t/loan/` 에서 qr 을 고르면 `/t/qr/` 새 문서
 *  3. `/` 에서 loan 을 고르면 `/t/loan/` 새 문서
 *  4. `/` 에서 제 주소 없는 도구: 제자리 (계약 그대로)
 *
 * 사용: node scripts/smoke-tool-page-nav.mjs
 */
import assert from 'node:assert/strict';
import { serveRepo } from './lib/serve-static.mjs';
import { launchOrSkip } from './lib/browser.mjs';

const TAG = 'smoke-tool-page-nav';
const server = await serveRepo();
const base = server.base;
const browser = await launchOrSkip(TAG, { headless: true });
if (!browser) { await server.close(); process.exit(0); }

const shellReady = (page) => page.waitForFunction(
  () => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage && Array.isArray(window.KARMOLAB_TOOL_PAGES),
  null, { timeout: 20000 },
);
const plant = (page) => page.evaluate(() => { window.__navMarker = 'same-document'; });
const marker = (page) => page.evaluate(() => window.__navMarker ?? null);

const findings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. 해시 진입: 제자리 (검사 30개가 이 길로 도구를 엶)
  await page.goto(`${base}/#loan`, { waitUntil: 'load' });
  await shellReady(page);
  await page.waitForSelector('.tool-page.active', { timeout: 15000 });
  assert.equal(new URL(page.url()).hash, '#loan', '해시로 들어왔는데 주소가 바뀌었다');
  findings.push('해시 진입: 제자리');

  // 2. 도구 장에서 다른 도구
  await page.goto(`${base}/t/loan/`, { waitUntil: 'load' });
  await shellReady(page);
  await plant(page);
  await page.evaluate(() => Toolbox.switchPage('qr'));
  await page.waitForURL('**/t/qr/**', { timeout: 15000 });
  assert.equal(await marker(page), null, '도구 장에서 다른 도구로 갔는데 같은 문서다');
  findings.push('도구 → 도구: 새 문서');

  // 3. 뿌리에서 도구
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await shellReady(page);
  await plant(page);
  await page.evaluate(() => Toolbox.switchPage('loan'));
  await page.waitForURL('**/t/loan/**', { timeout: 15000 });
  assert.equal(await marker(page), null, '뿌리에서 도구로 갔는데 같은 문서다 (제자리 교체로 되돌아갔다)');
  findings.push('뿌리 → 도구: 새 문서');

  // 4. 제 주소 없는 도구는 제자리
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await shellReady(page);
  const noPage = await page.evaluate(() => {
    const pages = new Set(window.KARMOLAB_TOOL_PAGES);
    const m = (window.KARMOLAB_LAZY_META || []).find((t) => t && !t.hidden && !pages.has(t.id) && t.id !== 'home');
    return m ? m.id : null;
  });
  assert.ok(noPage, '제 주소 없는 도구를 하나도 못 찾았다. 목록 모양이 바뀌었나');
  await plant(page);
  await page.evaluate((id) => Toolbox.switchPage(id), noPage);
  await page.waitForTimeout(400);
  assert.equal(await marker(page), 'same-document', `제 주소 없는 ${noPage} 인데 문서가 바뀌었다`);
  findings.push(`뿌리 → ${noPage} (제 주소 없음): 제자리`);

  console.log(`[${TAG}] 통과. ${findings.join(', ')}`);
} catch (e) {
  console.error(`[${TAG}] 실패: ${e && e.message}`);
  if (findings.length) console.error(`[${TAG}] 여기까지는 됐다: ${findings.join(', ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
