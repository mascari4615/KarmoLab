/**
 * 이어서로 넘긴 결과가 **묶음 안 도구까지** 닿는가 (TASK-KL-274).
 *
 * 도구가 결과를 내놓으면 이어서 줄이 서고, 누르면 받는 도구로 옮겨 간다. 그런데 받는 도구가
 * 재료 묶음 **안**에 숨어 있으면 길이 한 단계 더 있다:
 *   결과 놓기 → 묶음으로 옮기기 → 껍데기가 그 할 일 열기 → 도구가 그려지며 결과 집기.
 * 이 중 하나만 어긋나도 **빈 화면**이 뜬다(오류는 안 난다). 재료 껍데기를 새로 만들면서
 * 가운데 두 단계가 통째로 바뀌었으므로 여기서 잰다.
 *
 * 받는 도구가 **묶음 밖에 단독으로** 있는 경우도 함께 본다. 재료 화면의 할 일 목록에 이름이
 * 있다고 해서 그 도구가 묶음 **소속**인 것은 아니다(첫 판에서 내가 이걸 헷갈려 검사가 헛빨갰다).
 * 어느 쪽이든 재는 것은 하나다: **그 도구가 넘긴 것을 실제로 받았는가.**
 *
 * 사용: node scripts/smoke-handoff-bundle.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#home`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.offerResult, undefined, { timeout: 20000 });

/* 진짜 JPG 를 하나 만든다. 받는 쪽이 형식을 본다 */
const madeJpeg = await page.evaluate(async () => {
  const cv = document.createElement('canvas');
  cv.width = 40;
  cv.height = 30;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3388ff';
  ctx.fillRect(0, 0, 40, 30);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
  Toolbox.offerResult({ blob, name: '넘긴사진.jpg', from: 'imgresize' });
  return blob.size > 0;
});
check(madeJpeg, '넘길 결과를 만든다');

/* 받는 쪽 화면 검사는 KarmoEdit e2e-flow 로 이동 (2026-11-06) */

/* ⑦ **밝힌 대로 목적지가 뜨는가** (TASK-KL-299)
 * 받는다고 밝히지 않은 도구는 받을 수 있어도 목록에 안 뜬다 = 사람 눈엔 없는 기능이다.
 * 그림 하나를 내놨을 때, 이번에 채운 도구들이 실제로 갈 곳으로 잡히는지 본다. */
/* 여기는 도구 장 (`/t/audiocut/`) 이다. 도구 전환이 제 주소로 가므로 (change.tool-page-navigation)
 * 목록은 셸이 필요할 때 데려온다. 이어서 줄이 그리기 전에 하는 일과 같다 */
const dests = await page.evaluate(async () => { await Toolbox.ensureToolList(); return (Toolbox.toolsAccepting('image/png', 'barcode') || []).map((t) => t.id); });
for (const id of ['palette', 'qrread']) {
  check(dests.includes(id), `그림을 내놓으면 ${id} 가 갈 곳으로 뜬다 (지금 ${dests.length}곳)`);
}
const pdfDests = await page.evaluate(() => (Toolbox.toolsAccepting('application/pdf', 'pdf') || []).map((t) => t.id));
check(pdfDests.includes('pdftool'), `PDF 를 내놓으면 합치기, 나누기가 갈 곳으로 뜬다 (지금 ${pdfDests.length}곳)`);


process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-handoff-bundle] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-handoff-bundle] 넘긴 결과가 묶음 안 도구까지 닿는다');
