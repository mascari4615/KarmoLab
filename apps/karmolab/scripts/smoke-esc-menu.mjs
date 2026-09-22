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
  for (const url of ['/apps/karmolab/index.html', '/t/loan/']) {
    await page.goto(server.base + url);
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
    if (!url.includes('loan')) {
      await page.locator('[data-home-chrome]').click();
      await menu.waitFor({ state: 'visible' });
      await menu.locator('.esc-close').click();
      await menu.waitFor({ state: 'hidden' });
    }
    console.log(`[esc-menu] ${url}: 열기, 닫기, 입력 보호 통과`);
  }
} finally {
  await browser.close();
  server?.close();
}
