import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

export async function checkOpacityControls() {
  const { outputFiles } = await build({ entryPoints: ['src/lib/window-opacity-controls.ts'], bundle: true, write: false, format: 'iife', globalName: 'OpacityFixture' });
  const targets = [{ id: 'a', process_id: 1, title: 'Test window A' }, { id: 'b', process_id: 2, title: 'Test window B' }];
  let current = { session_id: null, target: null, opacity: 100, changed: false };
  let nextSession = 0;
  let cancelNext = false;
  let polls = 0;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main></main>
    <script>window.__KARMOLAB_DESKTOP__=true;window.__TAURI__={core:{invoke:(c,a)=>window.fixtureInvoke(c,a)},event:{listen:async()=>()=>{}}};</script>
    <script>${outputFiles[0].text}</script><script>OpacityFixture.buildWindowOpacity(document.querySelector('main'),location.search.includes('compact'));</script></body></html>`;
  const server = http.createServer(async (request, response) => {
    if (request.url === '/apps/karmolab/css/window-opacity.css') {
      try { response.setHeader('Content-Type', 'text/css'); response.end(await fs.readFile('css/window-opacity.css')); }
      catch { response.writeHead(404).end(); }
    } else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const until = async (check, label) => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${label}`);
  };
  try {
    const context = await browser.newContext();
    await context.exposeBinding('fixtureInvoke', async (_, command, args) => {
      switch (command) {
        case 'window_opacity_list': return targets;
        case 'window_opacity_status': polls++; return structuredClone(current);
        case 'window_opacity_connect':
          current = { session_id: null, target: null, opacity: 100, changed: false };
          if (cancelNext) { cancelNext = false; throw new Error('Permission cancelled'); }
          current = { session_id: String(++nextSession), target: targets.find(target => target.id === args.id), opacity: 100, changed: false };
          return structuredClone(current);
        case 'window_opacity_set':
          assert.equal(args.sessionId, current.session_id, 'Slider request identifies its connection');
          current.opacity = args.opacity; current.changed = true;
          return structuredClone(current);
        case 'window_opacity_restore':
          assert.equal(args.sessionId, current.session_id, 'Restore request identifies its connection');
          current = { session_id: null, target: null, opacity: 100, changed: false };
          return structuredClone(current);
        default: throw new Error(`Unexpected command: ${command}`);
      }
    });
    const main = await context.newPage();
    const small = await context.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await main.goto(base);
    await small.goto(`${base}/?compact`);
    await main.getByLabel('연결할 창', { exact: true }).selectOption('a');
    await main.getByRole('button', { name: '연결', exact: true }).click();
    await until(async () => await small.getByRole('slider').isEnabled(), 'two-view connection');
    const slider = small.getByRole('slider');
    await slider.press('End');
    await slider.press('ArrowLeft');
    await until(async () => (await main.locator('[data-value]').textContent()) === '99%' && (await small.locator('[data-value]').textContent()) === '99%', 'two-view value synchronization');
    await main.getByLabel('연결할 창', { exact: true }).selectOption('b');
    const before = polls;
    await until(async () => polls >= before + 2, 'status polling');
    assert.equal(await main.getByLabel('연결할 창', { exact: true }).inputValue(), 'b', 'Polling preserves the next target selection');
    cancelNext = true;
    await main.getByRole('button', { name: '연결', exact: true }).click();
    await until(async () => (await main.locator('[data-status]').innerText()).includes('Permission cancelled'), 'cancellation error');
    assert.equal(await main.getByRole('slider').isDisabled(), true, 'Cancelled reconnect clears stale active controls');
    await main.getByRole('button', { name: '연결', exact: true }).click();
    await until(async () => (await main.locator('[data-status]').innerText()).includes('Test window B 연결됨'), 'reconnect after cancellation');
    await main.getByRole('button', { name: '원상복구', exact: true }).click();
    await until(async () => await main.getByRole('slider').isDisabled() && await small.getByRole('slider').isDisabled(), 'both views reset');
    console.log('PASS: two-view sync, session-bound requests, draft selection, cancelled reconnect recovery and restore (fixture, no native window changes)');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
