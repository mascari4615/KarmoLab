import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serveRepo } from './lib/serve-static.mjs';
import { launchOrSkip } from './lib/browser.mjs';

if (!existsSync(new URL('../../blog/t/loan/index.html', import.meta.url))) {
  console.log('[esc-menu] 못 돌림. 대출 페이지가 없다 (`npm run gen:tool-pages` 먼저)');
  process.exit(2);
}
const browser = await launchOrSkip('esc-menu');
if (!browser) process.exit(2);
let server;
try {
  server = await serveRepo();
  const page = await browser.newPage();
  if (process.argv.includes('--slow-resource')) {
    // A nonessential image never finishes; menu readiness must remain testable.
    await page.route('**/__esc_slow_resource.png', () => new Promise(() => {}));
    await page.route((url) => ['/apps/karmolab/index.html', '/t/loan/'].includes(url.pathname), async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace('</body>', '<img hidden src="/__esc_slow_resource.png"></body>');
      await route.fulfill({ response, body: html });
    });
  }
  for (const url of ['/apps/karmolab/index.html', '/t/loan/']) {
    await page.goto(server.base + url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!window.KarmoEscMenu, null, { timeout: 15000 });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    const menu = page.locator('.esc-menu');
    await menu.waitFor({ state: 'visible' });
    // 칸 아홉 (홈, 대시보드, 도구, 오락실, 커뮤니티, 즐겨찾기, KarmoGraph, 소개, 글). 2026-09-22 글 칸 추가
    assert.equal(await menu.locator('.esc-cell').count(), 9);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    const input = page.locator(url.includes('loan') ? '#loR' : '#page-home .kp-input');
    await input.click();
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false, `${url}: 입력 중 ESC가 메뉴를 열었다`);
    /* 첫 화면 구석 버튼 ([data-home-chrome]) 은 Q2 로비와 함께 없어짐 (2026-09-24 제목 로비로 되돌림). 닫기 버튼만 잰다. 입력 칸에서 빠져나온 뒤 ESC */
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'visible' });
    await menu.locator('.esc-close').click();
    await menu.waitFor({ state: 'hidden' });
    console.log(`[esc-menu] ${url}: 열기, 닫기, 입력 보호 통과`);
  }
} finally {
  await browser.close();
  server?.close();
}
