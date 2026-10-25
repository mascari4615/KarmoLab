/**
 * 말로 부리기. 이름으로 못 찾은 자리에서 도구에 닿는가 (TASK-KL-196 E)
 *
 * 왜 화면 검사인가: 이 길은 조각 셋이 이어져야 산다. 팔레트의 빈 자리 → **누를 때 데려오는**
 * 조각(`root/ask`) → 서버 답. 그중 하나만 어긋나도 단위 시험은 초록인데 사람은 아무 데도
 * 못 간다. 특히 조각은 **빌드가 부르는 곳을 글자로 찾아** 만들어지므로, 부르는 모양을 바꾸면
 * 파일 자체가 안 만들어진다(실측으로 한 번 그랬다. 404).
 *
 * 서버 답은 **가로채서** 준다: 이 검사가 재는 것은 고르기가 정확한가(그건 모델의 몫)가
 * 아니라 고른 것이 화면에 뜨고 그 도구로 가는가다. 모델을 부르면 검사가 돈, 지연, 날씨를 탄다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-ask.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { livePage } from './lib/live-url.mjs';
import { retiredTarget } from './lib/retired-operations.mjs';

const URL_TARGET = livePage('/');
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });

let asked = 0;
const routeMethods = [];
let controlled = null;
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 10000); })]); }
  finally { clearTimeout(timer); }
}
await context.route('**/kl/route', async (route) => {
  routeMethods.push(route.request().method());
  asked++;
  let why = '글자 수를 센다';
  if (controlled) {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const index = controlled.pending.push({ release, method: route.request().method() });
    controlled.onRequest?.();
    why = 'response-' + index;
    try { await bounded(gate, 'ask response gate ' + index); }
    catch (error) { problems.push(error.message); return route.abort(); }
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ready: true, pick: { toolId: 'charcount', why } })
  });
});
// 나머지 서버 호출은 끊는다. 이 검사는 노트북이 살아 있든 말든 같아야 한다.
await context.route('**/kl/**', (route) => (route.request().url().includes('/kl/route') ? route.fallback() : route.abort()));

const page = await context.newPage();
const routeErrors = [];
page.on('console', message => {
  if (message.type() === 'error' && message.text().includes('/kl/route')) routeErrors.push(message.text());
});
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));
const missing = [];
page.on('response', (r) => {
  if (r.status() === 404 && /\/js\//.test(r.url())) missing.push(r.url());
});

await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.landing-palette input', { timeout: 15000 });

// ① 이름으로 안 찾아지는 말을 친다 → 하려는 일로 찾기가 떠야 한다.
await page.fill('.landing-palette input', '사진에서 글자만 빼줘');
await page.waitForSelector('.kp-empty', { timeout: 8000 });
if (!(await page.locator('.kp-ask').count())) {
  problems.push('0건인데 하려는 일로 찾기가 없다');
}

// ② 누르면 조각을 데려와 서버에 묻고, 고른 도구가 화면에 뜬다.
await page.click('.kp-ask');
try {
  await page.waitForSelector('.kp-ask-hit', { timeout: 15000 });
} catch (error) {
  const state = await page.evaluate(() => ({
    api: window.KarmoAccount?.apiBase,
    message: document.querySelector('.kp-ask-none')?.textContent || '',
    result: document.querySelector('.kp-inline .kp-results')?.textContent || ''
  }));
  console.error('[smoke-ask] route diagnostic', { asked, routeMethods, routeErrors, state });
  await browser.close();
  throw error;
}
if (asked !== 1) problems.push(`서버를 ${asked}번 불렀다 (한 번이어야 한다)`);
const hit = await page.locator('.kp-ask-hit').innerText();
if (!/글자/.test(hit)) problems.push(`고른 것이 이상하다: ${hit}`);

// ③ 누르면 그 도구로 간다.
const target = retiredTarget('charcount').tool;
await page.click('.kp-ask-hit');
await page.waitForURL(url => url.pathname === `/t/${target}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.locator(`#page-${target}.active .pf-shell #pfText`).waitFor({ state: 'visible', timeout: 15000 });

// ④ 조각이 **실제로 만들어져 있어야** 한다. 부르는 모양이 바뀌면 파일이 안 만들어진다.
/* ★ 한 번 더 확인하고 말한다 (2026-08-12). 이 검사는 배포 직후에 도는데, 그 사이 **다음
 *   배포가 자산을 갈아 끼우면** 이름에 해시가 붙은 조각이 잠깐 404 가 된다. 제품이 깨진 게
 *   아니라 사이트가 교체 중인 순간을 잰 것이다(실측: perf.<해시>.js 가 그렇게 빨갰고,
 *   같은 주소를 곧바로 다시 부르니 200 이었다). 진짜로 없는 조각은 다시 불러도 없다. */
const stillMissing = [];
for (const url of missing) {
  const again = await fetch(url).then((r) => r.status).catch(() => 0);
  if (again !== 200) stillMissing.push(url);
}
if (stillMissing.length) problems.push(`받아야 할 조각이 없다(404): ${stillMissing.join(', ')}`);

// ⑤ 결과가 있는 물음에서는 이 자리가 아예 없어야 한다. 있으면 매번 모델을 부르게 된다.
/* 앱은 마지막에 보던 화면을 기억한다. 그냥 첫 주소로 가면 도구 화면이 다시 열려
   첫 화면의 찾는 칸이 안 보인다(여기서 한 번 헛짚었다). 대놓고 첫 화면을 부른다. */
await page.goto(`${URL_TARGET}#home`, { waitUntil: 'networkidle' });
await page.waitForSelector('.landing-palette input', { state: 'visible', timeout: 15000 });
await page.fill('.landing-palette input', 'json');
await page.waitForTimeout(500);
if (await page.locator('.kp-ask').count()) problems.push('이름으로 찾아지는데도 하려는 일로 찾기가 떠 있다');

// Same question survives an index refresh; newer input and view instances own later replies.
try {
  for (const scenario of ['refresh-same', 'different-question', 'close-reopen', 'consecutive']) {
    controlled = { pending: [], onRequest: null };
    const check = await context.newPage();
    check.setDefaultTimeout(10000);
    check.on('pageerror', error => problems.push(scenario + ': ' + error.message));
    const request = async count => {
      if (controlled.pending.length < count) await bounded(new Promise(resolve => { controlled.onRequest = resolve; }), scenario + ' request ' + count);
      assert.equal(controlled.pending.length, count);
    };
    await check.goto(`${URL_TARGET.replace(/#.*$/, '')}#home`, { waitUntil: 'networkidle', timeout: 30000 });
    await check.locator('.landing-palette input').waitFor();
    const overlay = scenario === 'close-reopen';
    if (overlay) await check.keyboard.press('Control+k');
    const scope = overlay ? '.kp-overlay' : '.kp-inline';
    const input = check.locator(scope + ' input.kp-input');
    await input.fill('사진에서 글자만 빼줘');
    await check.locator(scope + ' .kp-ask').click();
    await request(1);
    if (scenario === 'refresh-same' || scenario === 'consecutive') await check.evaluate(() => window.KarmoPalette.refresh());
    if (scenario === 'different-question') await input.fill('새로운질문_xyz');
    if (overlay) {
      await check.locator('.kp-overlay .kp-close').click();
      await check.locator('.kp-overlay').waitFor({ state: 'detached' });
      await check.keyboard.press('Control+k');
      await check.locator('.kp-overlay input.kp-input').fill('사진에서 글자만 빼줘');
    }
    if (scenario === 'consecutive') {
      await check.locator(scope + ' .kp-ask').click();
      await request(2);
      controlled.pending[1].release();
      await check.locator(scope + ' .kp-ask-hit').waitFor();
      assert.match(await check.locator(scope + ' .kp-ask-hit').innerText(), /response-2/);
    }
    const response = check.waitForResponse(reply => reply.url().includes('/kl/route'));
    controlled.pending[0].release();
    await (await response).finished();
    await check.evaluate(() => new Promise(requestAnimationFrame));
    const hit = check.locator(scope + ' .kp-ask-hit');
    if (scenario === 'refresh-same') { await hit.waitFor(); assert.match(await hit.innerText(), /response-1/); }
    else if (scenario === 'consecutive') assert.match(await hit.innerText(), /response-2/);
    else assert.equal(await hit.count(), 0);
    assert.equal(await check.locator(scope + ' input.kp-input').inputValue(), scenario === 'different-question' ? '새로운질문_xyz' : '사진에서 글자만 빼줘');
    if (overlay) assert.equal(await check.locator(scope + ' input.kp-input').evaluate(element => element === document.activeElement), true);
    assert.deepEqual(controlled.pending.map(item => item.method), scenario === 'consecutive' ? ['POST', 'POST'] : ['POST']);
    console.log('[smoke-ask] lifetime ' + scenario + ' PASS');
    await check.close();
  }
  for (const focus of ['.kp-input', '.kp-ask', '.kp-close']) {
    const check = await context.newPage();
    await check.goto(URL_TARGET, { waitUntil: 'networkidle' });
    await check.keyboard.press('Control+k');
    await check.locator('.kp-overlay .kp-input').fill('사진에서 글자만 빼줘');
    const target = check.locator('.kp-overlay ' + focus);
    await target.waitFor();
    await target.focus();
    const before = asked;
    await check.keyboard.press('Escape');
    assert.equal(await check.locator('.kp-overlay').count(), 0, 'Escape closes from ' + focus);
    assert.equal(asked, before, 'Escape does not submit an ask');
    assert.equal(await check.locator('.esc-menu:not([hidden])').count(), 0, 'Escape does not open the shell menu');
    console.log('[smoke-ask] Escape ' + focus + ' PASS');
    await check.close();
  }
} catch (error) { problems.push('ask lifetime: ' + error.message); }
finally { await browser.close(); }

if (problems.length) {
  console.error('❌ 말로 부리기\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('✅ 말로 부리기. 0건에서만 뜸, 누르면 조각 받아 서버 1회, 고른 도구로 이동, 404 없음, 요청 수명 4경계와 Escape focus 3종');
