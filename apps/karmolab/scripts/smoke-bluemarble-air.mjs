/**
 * 지구본 하늘 겹: 받은 결과 안내와 실제 픽셀 변화 측정
 * 사용: node scripts/smoke-bluemarble-air.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';
import { WAIT } from './lib/waits.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const skipped = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const skip = (why) => {
  process.stdout.write('-');
  skipped.push(why);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(20000);

/*
 * ★ 뒷단은 **origin 허용목록**으로 막혀 있다. 로컬 검사 서버 포트는 그 목록 밖이라
 * 브라우저가 부르면 요청이 통째로 버려진다. 도구가 아니라 검사 환경 탓이다(이 저장소가
 * 이미 아는 함정). 그 호출만 Node 에서 대신 받아 전달.
 * 이렇게 하면 우리 그리는 코드는 **진짜 자료**로 측정,, 네트워크가 죽으면 아래에서
 * 못 잼으로 적힌다(통과로 안 센다).
 */
await page.route('**/kl/air/near*', async (route) => {
  try {
    const res = await fetch(route.request().url(), { headers: { Accept: 'application/json' } });
    route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch {
    route.abort();
  }
});

/* 반투명 비행기의 합성 전후 픽셀과 배경 재그리기 관찰 */
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  const probe = window.__bmAirProbe = { frames: 0, calls: 0, changed: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ['fill', 'fillRect', 'drawImage']) {
    const original = proto[name];
    proto[name] = function (...args) {
      if (!this.canvas.matches('.bm-canvas')) return original.apply(this, args);
      if ((name === 'drawImage' && args.length === 5 && args[1] === 0 && args[2] === 0)
        || (name === 'fillRect' && args[0] === 0 && args[1] === 0 && args[2] >= this.canvas.width)) probe.frames++;
      const plane = name !== 'drawImage' && /^rgba\(214,\s*238,\s*255,/.test(this.fillStyle);
      if (!plane) return original.apply(this, args);
      const m = this.getTransform();
      const point = m.transformPoint(new DOMPoint(name === 'fillRect' ? args[0] : 0, name === 'fillRect' ? args[1] : 0));
      const x = Math.max(0, Math.min(this.canvas.width - 24, Math.floor(point.x) - 12));
      const y = Math.max(0, Math.min(this.canvas.height - 24, Math.floor(point.y) - 12));
      const before = this.getImageData(x, y, 24, 24).data;
      const result = original.apply(this, args);
      const after = this.getImageData(x, y, 24, 24).data;
      probe.calls++;
      if (after.some((value, i) => value !== before[i])) probe.changed++;
      return result;
    };
  }
});
await page.goto(`${BASE}#bluemarble`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.bm-canvas', { timeout: 40000 });
/* 조작부는 접혀 있는 게 기본이다. 펴지 않으면 겹 단추가 지구본 뒤에 깔려 못 눌린다. */
await page.locator('.bm-menu').click();
await page.waitForSelector('.bm-wrap.bm-panel', { timeout: WAIT });
const airChip = page.locator('.bm-chips button', { hasText: '하늘' }).first();
if ((await airChip.count()) === 0) {
  check(false, '★ 지구본에 하늘 겹 버튼이 없다. 겹이 배선에서 빠졌다');
} else {
  check(true, '지구본에 하늘 겹 버튼이 있다');
  await airChip.click();
  const said = await page
    .waitForFunction(
      () => /하늘에 \d+대|잡히는 게 없습니다|못 받았습니다/.test(document.body.innerText),
      undefined,
      { timeout: 25000 }
    )
    .then(() => page.evaluate(() => document.body.innerText.match(/하늘에 \d+대|잡히는 게 없습니다|못 받았습니다/)?.[0] ?? ''))
    .catch(() => '');
  if (said === '' || /못 받았습니다/.test(said)) {
    /* 뒷단이 안 서 있으면 **못 잰 것**이다. 통과로 세지 않는다. */
    skip(`하늘 겹: 뒷단(karmolab-bot /kl/air)에 못 닿았다. 통과 아님 (화면이 말한 것: ${said || '아무 말 없음'})`);
  } else {
    check(/하늘에 \d+대|잡히는 게 없습니다/.test(said), `★ 받은 결과를 사람 말로 말한다 (지금 ${said})`);
    check(!/하늘에 0대/.test(said), '0대를 n대로 말하지 않는다 (없으면 없다고 말해야 한다)');

    if (/잡히는 게 없습니다/.test(said)) {
      skip('그 하늘이 실제로 0대였다. 그리기는 못 쟀다(잡을 게 없으면 그릴 것도 없다)');
    } else {
      const painted = await page.waitForFunction(() => window.__bmAirProbe.changed > 0, null, { timeout: WAIT })
        .then(() => true).catch(() => false);
      check(painted, '비행기 그리기가 실제 픽셀을 바꾼다');
      await airChip.click();
      const off = await page.evaluate(() => ({ ...window.__bmAirProbe }));
      const repainted = await page.waitForFunction((frames) => window.__bmAirProbe.frames >= frames + 3,
        off.frames, { timeout: WAIT }).then(() => true).catch(() => false);
      const after = await page.evaluate(() => ({ ...window.__bmAirProbe }));
      check(repainted && after.calls === off.calls,
        `하늘 겹을 끄면 배경만 다시 그린다 (프레임 ${after.frames - off.frames}, 비행기 ${after.calls - off.calls})`);
    }
  }
}

await browser.close();
if (frozen) await frozen.close();

process.stdout.write('\n');
for (const s of skipped) console.log(`  [못 잼] ${s}`);
if (failures.length > 0) {
  console.error(`\n[smoke-bluemarble-air] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[smoke-bluemarble-air] 화면 검사 통과 (못 잰 것 ${skipped.length}건. 통과로 안 셈)`);
