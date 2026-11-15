import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const endpoint = args.includes('--cdp') ? argument('--cdp') : 'http://127.0.0.1:9294';
const target = args.includes('--target') ? argument('--target') : null;
const output = args.includes('--out') ? argument('--out') : null;
const until = async (check, label, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
};
const status = page => page.locator('.window-opacity-controls [data-status]');
await until(async () => {
  try { return (await fetch(`${endpoint}/json/version`)).ok; }
  catch { return false; }
}, 'preview WebView debugging endpoint');
const browser = await chromium.connectOverCDP(endpoint);
let main;
let small;
let connected = false;
try {
  main = await until(async () => browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('#windowopacity')), 'main opacity tool');
  await main.locator('.window-opacity-controls').waitFor();
  await main.getByRole('button', { name: '작은 조절창', exact: true }).click();
  small = await until(async () => browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('/window-opacity.html')), 'compact window');
  await small.locator('.window-opacity-controls').waitFor();
  const bounds = await small.locator('[data-restore]').boundingBox();
  const viewport = await small.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(bounds && bounds.y + bounds.height <= viewport.height, 'Restore button fits inside compact window');
  console.log(JSON.stringify({ phase: 'both-guis-open', compact: viewport, restoreBottom: bounds.y + bounds.height }));
  if (target) {
    await main.getByLabel('연결할 창', { exact: true }).selectOption(target);
    await main.getByRole('button', { name: '연결', exact: true }).click();
    await until(async () => {
      const text = await status(main).innerText();
      if (await status(main).evaluate(element => element.classList.contains('error'))) throw new Error(text);
      return text.includes('연결됨');
    }, 'native helper connection (approve the Windows prompt)', 95000);
    connected = true;
    console.log(JSON.stringify({ phase: 'native-connected', status: await status(main).innerText() }));
    await until(async () => await small.getByRole('slider', { name: '불투명도', exact: true }).isEnabled(), 'compact state sync');
    const slider = small.getByRole('slider', { name: '불투명도', exact: true });
    await slider.press('End');
    for (let step = 0; step < 20; step++) await slider.press('ArrowLeft');
    await until(async () => (await status(main).innerText()).includes('80% 적용됨') && (await status(small).innerText()).includes('80% 적용됨'), 'both views reflect 80%');
    console.log(JSON.stringify({ phase: 'native-80-both-views', main: await status(main).innerText(), small: await status(small).innerText() }));
    if (output) {
      await fs.mkdir(output, { recursive: true });
      await main.screenshot({ path: path.join(output, 'main-dark.png') });
      await small.screenshot({ path: path.join(output, 'compact-dark.png') });
      for (const [page, name] of [[main, 'main'], [small, 'compact']]) {
        const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        try {
          await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
          await page.screenshot({ path: path.join(output, `${name}-light.png`) });
        } finally {
          await page.evaluate(previous => {
            if (previous === null) document.documentElement.removeAttribute('data-theme');
            else document.documentElement.setAttribute('data-theme', previous);
          }, theme);
        }
      }
    }
    await main.getByRole('button', { name: '원상복구', exact: true }).click();
    await until(async () => (await status(main).innerText()).includes('게임 창을 선택') && (await status(small).innerText()).includes('게임 창을 선택'), 'both views disconnected after restore');
    connected = false;
    assert.equal(await small.getByRole('slider', { name: '불투명도', exact: true }).isDisabled(), true);
    console.log(JSON.stringify({ phase: 'native-restored-both-views' }));
  }
  console.log('PASS: compact layout' + (target ? ', live native helper, two-view opacity sync and restore' : ' (native interaction not requested)'));
} finally {
  if (connected && main) {
    try { await main.getByRole('button', { name: '원상복구', exact: true }).click(); }
    catch (error) { console.error('Restore retry failed:', error.message); }
  }
  await browser.close();
}
