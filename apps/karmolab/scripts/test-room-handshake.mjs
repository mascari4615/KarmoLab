/** 화면 없이 실제 WebRTC 네 참가자의 인사와 양방향 메시지 재현 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { traceRtc } from './lib/rtc-diagnostics.mjs';
import { nostrTestRelay } from './lib/nostr-test-relay.mjs';
import { trysteroReadyRetry } from './lib/trystero-ready-retry.mjs';

const rounds = Number(process.argv[2] ?? 4);
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 100, 'round count must be 1..100');
const bundle = await build({ entryPoints: ['src/lib/room.ts'], bundle: true, write: false, format: 'iife', globalName: 'RoomApi', plugins: process.argv.includes('--unpatched') ? [] : [trysteroReadyRetry] });
const browser = await chromium.launch();
try {
  for (let round = 0; round < rounds; round++) {
    const dropReady = process.env.ROOM_DROP_READY === '1' || round % 2 === 1;
    const relay = nostrTestRelay();
    const contexts = [];
    const pages = [];
    try {
      for (let seat = 0; seat < 4; seat++) {
        const context = await browser.newContext();
        contexts.push(context);
        await traceRtc(context);
        await relay.attach(context, seat);
        if (dropReady) await context.addInitScript(() => {
          window.__droppedReady = 0;
          const send = RTCDataChannel.prototype.send;
          RTCDataChannel.prototype.send = function (data) {
            const text = new TextDecoder().decode(data);
            if (!window.__droppedReady && text.includes('@_hsready')) {
              window.__droppedReady++;
              return;
            }
            return send.call(this, data);
          };
        });
        await context.route('http://127.0.0.1/room-test', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Room handshake test</title>' }));
        const page = await context.newPage();
        pages.push(page);
        if (process.env.ROOM_CPU_RATE) {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.ROOM_CPU_RATE) });
        }
        await page.goto('http://127.0.0.1/room-test');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
      }
      await Promise.all(pages.map((page, seat) => page.evaluate(({ seat, round }) => {
        window.received = [];
        window.room = RoomApi.openRoom({ appId: 'room-handshake-test', code: `round-${round}`, host: seat === 0, name: `seat-${seat}` });
        window.channel = room.channel('check', (data, peerId) => received.push({ data, peerId }));
      }, { seat, round })));
      await Promise.all(pages.map((page) => page.waitForFunction(() => room.peers().length === 3, null, { timeout: 20000 })));
      const ids = await Promise.all(pages.map((page) => page.evaluate(() => room.selfId)));
      await Promise.all(pages.map((page, seat) => page.evaluate((seat) => channel.send(seat), seat)));
      await Promise.all(pages.map((page) => page.waitForFunction(() => received.length === 3, null, { timeout: 5000 })));
      for (let seat = 0; seat < 4; seat++) {
        const result = await pages[seat].evaluate(() => ({ peers: room.peers(), received }));
        assert.deepEqual(result.peers.map(({ name }) => name).sort(), [0, 1, 2, 3].filter((other) => other !== seat).map((other) => `seat-${other}`));
        assert.deepEqual(result.received.map(({ peerId }) => peerId).sort(), ids.filter((_, other) => other !== seat).sort());
        if (dropReady) assert.equal(await pages[seat].evaluate(() => window.__droppedReady), 1);
      }
      console.log(`[room-handshake] ${round + 1}/${rounds}: four peers and bidirectional messages PASS (drop first ready: ${dropReady})`);
    } catch (error) {
      console.error(JSON.stringify(await Promise.all(pages.map((page) => page.evaluate(() => ({ peers: window.room?.peers(), rtc: window.__rtcTrace }))))));
      throw error;
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
} finally {
  await browser.close();
}
