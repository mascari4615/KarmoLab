import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../karmolab/package.json", import.meta.url));
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.resolve(process.argv[2]);
const fixture = JSON.parse(fs.readFileSync(path.join(out, "profile-fixture.json"), "utf8"));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://local").pathname;
  if (pathname === "/vendor/article-list.js" || pathname === "/vendor/article-list.css") {
    res.setHeader("content-type", pathname.endsWith("css") ? "text/css" : "text/javascript");
    res.end(fs.readFileSync(path.join(root, pathname.slice(1)))); return;
  }
  const name = path.basename(pathname);
  if (!/^arca-(liked|profile)\.(html|css|js)$/.test(name)) { res.statusCode = 404; res.end(); return; }
  res.setHeader("content-type", name.endsWith("html") ? "text/html" : name.endsWith("css") ? "text/css" : "text/javascript");
  res.end(fs.readFileSync(path.join(root, name)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    await context.route('https://ac.arca.live/preview-test.svg', (route) => route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#333"/><text x="80" y="300" fill="white" font-size="48">Thumbnail size fixture</text></svg>',
    }));
    await context.addInitScript(({ key, rows }) => {
      globalThis.embedStats = { calls: 0, active: 0, max: 0 };
      globalThis.chrome = {
        runtime: { sendMessage: async (msg) => {
          if (msg.type !== 'arca.embed.read') return { ok: true, at: Date.now(), rows };
          const stats = globalThis.embedStats;
          stats.calls++; stats.active++; stats.max = Math.max(stats.max, stats.active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          stats.active--;
          const index = rows.findIndex((r) => r.href === msg.url);
          if (index === 1) return { ok: true, embed: {} };
          if (index === 2) return { ok: false, error: '접근 제한' };
          return { ok: true, embed: { image: 'https://ac.arca.live/preview-test.svg' } };
        } },
        storage: { local: { get: async () => ({ likelist: { arca: { [key]: { name: key.split("#")[0] } } }, karmoLikedProfiles: {}, karmoLikedView: localStorage.getItem('view') || 'list' }), set: async (values) => { if (values.karmoLikedView) localStorage.setItem('view', values.karmoLikedView); } }, onChanged: { addListener() {} } },
      };
    }, fixture);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/arca-liked.html`);
    await page.waitForFunction(() => document.querySelectorAll("#posts li").length > 0 && document.querySelector("#posts").getAttribute("aria-busy") === "false");
    assert.equal(await page.locator("#posts li").count(), fixture.rows.length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const rowHeight = await page.locator("#posts li").first().evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(rowHeight <= 45, `single row height ${rowHeight}`);
    assert.equal(await page.evaluate(() => embedStats.calls), 0, 'list does not preload images');
    await page.locator(".refs-title").first().focus();
    await page.waitForFunction(() => document.querySelector('.article-preview:not([hidden]) .article-preview-image')?.naturalWidth > 0);
    const previewSize = await page.locator('.article-preview:visible').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    const firstRow = await page.locator('#posts li').first().boundingBox();
    if (width >= 1100) {
      const list = await page.locator('#posts').boundingBox();
      assert.ok(previewSize.left >= list.x + list.width, 'preview beside the list');
    } else {
      const head = await page.locator('.refs-head').first().boundingBox();
      assert.ok(previewSize.top >= head.y + head.height, 'inline preview below title');
      assert.ok(firstRow.height >= previewSize.bottom - firstRow.y, 'preview occupies row space');
    }
    assert.ok(previewSize.left >= 0 && previewSize.right <= width);
    assert.equal(await page.locator('.article-preview:visible').evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
    await page.screenshot({ path: path.join(out, `large-preview-test-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    if (width >= 1100) {
      await page.locator('.refs-title').first().hover();
      await page.waitForFunction(() => !!document.querySelector('.article-preview:not([hidden])'));
      await page.mouse.move(previewSize.left + 20, previewSize.top + 20);
      assert.equal(await page.locator('.article-preview:visible').count(), 0);
    }
    if (width < 500) {
      await page.locator('.refs-preview-button').first().tap();
      assert.equal(await page.locator('.article-preview:visible').count(), 1);
      await page.locator('.refs-preview-button').first().tap();
      assert.equal(await page.locator('.article-preview:visible').count(), 0);
    }
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "refresh");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "search");
    await page.locator("#search").fill("조건에없을검색어");
    assert.equal(await page.locator("#posts li").count(), 0);
    assert.equal(await page.locator("#empty").isVisible(), true);
    await page.locator("#search").fill("");
    if (width < 500) await page.locator("#refresh").tap();
    else await page.locator("#refresh").click();
    await page.waitForFunction(() => !document.getElementById("refresh").disabled);
    await page.screenshot({ path: path.join(out, `page-${width}.png`), fullPage: true });
    await page.locator('#viewCards').click();
    await page.waitForFunction(() => document.querySelector('.article-card-image').naturalWidth > 0);
    assert.equal(await page.locator('#viewCards').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.article-preview:visible').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.waitForFunction(() => embedStats.active === 0);
    const lazyCalls = await page.evaluate(() => embedStats.calls);
    assert.ok(lazyCalls < fixture.rows.length, 'only visible cards request metadata');
    assert.ok(await page.evaluate(() => embedStats.max <= 2), 'bounded metadata concurrency');
    await page.screenshot({ path: path.join(out, `cards-${width}.png`), fullPage: true });
    await page.locator('#search').fill(fixture.rows[1].title);
    await page.waitForFunction(() => document.querySelector('.article-card-status').textContent === '공개 썸네일 없음');
    await page.locator('#search').fill(fixture.rows[2].title);
    await page.waitForFunction(() => document.querySelector('.article-card-status').textContent === '접근 제한');
    await page.locator('#search').fill('');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#posts').dataset.articleView === 'cards');
    await page.locator('#viewList').click();
    assert.equal(await page.locator('#posts li').first().evaluate((el) => el.getBoundingClientRect().height), rowHeight);
    assert.deepEqual(errors, []);
    results.push({ width, posts: fixture.rows.length, rowHeight, previewWidth: previewSize.width, embedFocus: true, overflow: false, keyboard: true, touch: width < 500, cards: true, lazyCalls, maxRequests: await page.evaluate(() => embedStats.max), persistedView: true, missingAndError: true });
    await context.close();
  }
  console.log(JSON.stringify(results));
  fs.writeFileSync(path.join(out, "browser-results.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
