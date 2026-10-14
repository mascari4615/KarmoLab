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
      globalThis.chrome = {
        runtime: { sendMessage: async (msg) => msg.type === "arca.embed.read" ? { ok: true, embed: { image: "https://ac.arca.live/preview-test.svg" } } : ({ ok: true, at: Date.now(), rows }) },
        storage: { local: { get: async () => ({ likelist: { arca: { [key]: { name: key.split("#")[0] } } }, karmoLikedProfiles: {} }), set: async () => {} }, onChanged: { addListener() {} } },
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
    await page.locator(".refs-title").first().focus();
    await page.waitForFunction(() => !document.querySelector(".article-preview").hidden && document.querySelector(".article-preview-image").naturalWidth > 0);
    const previewSize = await page.locator('.article-preview').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    assert.equal(previewSize.width, Math.min(560, width - 24));
    assert.ok(previewSize.left >= 12 && previewSize.right <= width - 12);
    assert.ok(previewSize.top >= 12 && previewSize.bottom <= 888);
    await page.screenshot({ path: path.join(out, `large-preview-test-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    if (width < 500) {
      await page.locator('.refs-preview-button').first().tap();
      assert.equal(await page.locator('.article-preview').first().isVisible(), true);
      await page.locator('.refs-preview-button').first().tap();
      assert.equal(await page.locator('.article-preview').first().isVisible(), false);
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
    assert.deepEqual(errors, []);
    results.push({ width, posts: fixture.rows.length, rowHeight, previewWidth: previewSize.width, embedFocus: true, overflow: false, keyboard: true, touch: width < 500 });
    await context.close();
  }
  console.log(JSON.stringify(results));
  fs.writeFileSync(path.join(out, "browser-results.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
