import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

import { webBody } from '../dist/index.js';

/**
 * **진짜 창을 띄워서** 잠근다. 글자 맞춰보기가 아니라.
 *
 * 여기 잠그는 넷은 전부 조용히 되돌아가는 종류다(2026-08-19 실측):
 *
 *   ① 보낸 말이 거절돼도(400) 화면이 아무 말도 안 했다. `/say` 의 **답을 아예 안 봤다.**
 *      내 말풍선은 멀쩡히 뜨고 얘는 영영 대답을 안 한다. 내 말을 못 알아듣는 것 같다의 정체.
 *   ② 알아챈 것이 말 방(page)에서 통째로 빠졌다. `알아챈것()` 첫 줄이 `if (pageSurface) return`.
 *      들었다: ...도 기억에 담았다도 긴 채팅 화면엔 한 줄도 안 떴다.
 *   ③ 우클릭 설정창에 **닫는 단추가 없었다.** 뚫린 창에서는 바깥이 클릭을 안 받고, 창에
 *      초점이 없으면 Esc 도 안 먹는다. 한 번 열면 못 닫는 창.
 *   ④ 창을 열자마자 `body3d` TDZ 로 터졌다(`text.focus()` → setState). ①②를 고쳐
 *      실패가 화면에 빨갛게 뜨자 **그 자리에서** 잡힌 것이다.
 *
 * 글자 맞춰보기(다른 test/*.test.mjs 가 쓰는 손)로는 ④를 절대 못 잡는다. 그래서 여기만
 * 진짜 브라우저를 쓴다. 크로뮴이 없으면 **건너뛰지 않고 실패한다**. 조용히 안 도는
 * 검사는 없는 검사다(`npx playwright install chromium`).
 */

const port2 = 4631;
const url2 = `http://127.0.0.1:${port2}`;

/** 크로뮴이 없으면 **건너뛰지 않고 실패한다**. 조용히 안 도는 검사는 없는 검사다. */
function chromium2() {
  try {
    return require('playwright').chromium;
  } catch {
    return null;
  }
}

const require = createRequire(import.meta.url);
const chromium = chromium2();

test('창 검사. 실패는 빨갛게, 알아챔은 말 방에도, 설정창은 닫힌다', { concurrency: false }, async (t) => {
  assert.notEqual(chromium, null, '크로뮴이 없다. `npx playwright install chromium`. 검사를 건너뛰지 않는다');

  const body = webBody({ port: port2, open: false });
  body.sense.start(() => {});
  const browser = await chromium.launch();
  const consoleMask = [];

  const openWindow = async (after = '') => {
    const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
    page.on('pageerror', (e) => consoleMask.push(`${after || '/'} pageerror: ${e.message}`));
    await page.goto(url2 + '/' + after, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    return page;
  };

  try {
    await t.test('거절당한 말이 대화창에 빨갛게 남는다. 조용히 사라지면 고장과 구분이 안 된다', async () => {
      // 말 방(page)은 어느 줄에서 일할지 고르기 전엔 입력칸이 잠긴다. 치는 검사는 이쪽 창에서.
      const page = await openWindow();
      // 서버가 400 + 안받은이유 로 돌려보내는 글(깨진 글)을 일부러 보낸다.
      await page.fill('#text', '�����');
      await page.press('#text', 'Enter');
      await page.waitForSelector('.line.fail', { timeout: 5000 });

      /* **거절 때문에** 뜬 줄인지 본다. 아무 빨간 줄이나 세면 안 된다. 이 검사 자리에는
         모델 파일이 없어서 3D 몸을 못 세웠다도 같이 빨갛게 뜬다(그건 그것대로 맞다). */
      const all = await page.locator('.line.fail .what').allInnerTexts();
      const reject = all.find((t) => t.includes('보낸 말이'));
      assert.ok(reject !== undefined, `보낸 말이 거절된 것을 화면이 안 알렸다: ${JSON.stringify(all)}`);
      assert.match(reject, /깨져/, `왜 안 됐는지가 그 줄에 있어야 한다: ${reject}`);

      // 빨간지도 본다. 떴다와 눈에 띈다는 다른 말이다.
      const color = await page.locator('.line.fail .what', { hasText: '보낸 말이' }).first()
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number);
      assert.ok(r > 180 && r > g + 80 && r > b + 80, `실패 줄이 안 빨갛다: ${color}`);
      await page.close();
    });

    await t.test('알아챈 것이 말 방(page)에도 뜬다. 여기서 통째로 빠져 있었다', async () => {
      const page = await openWindow('?surface=page');
      body.noticed('기억에 담았다. 검사');
      await page.waitForSelector('.line.notice', { timeout: 5000 });
      const content = await page.locator('.line.notice .what').last().innerText();
      assert.match(content, /기억에 담았다/, `알아챈 것이 말 방 대화창에 안 뜬다: ${content}`);
      await page.close();
    });

    await t.test('우클릭은 원형, 더보기는 판, 판은 닫기 버튼으로 닫힌다. Esc, 바깥누르기는 뚫린 창에서 안 먹는다', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      assert.equal(await page.locator('#ring .ring-btn').count(), 7, '우클릭했는데 원형 버튼 7개 (켜고 끄기 6, 더보기) 가 안 떴다');
      await page.locator('#ring .ring-btn.more').click();
      assert.equal(!(await page.evaluate(() => document.getElementById('ring').hidden)), false, '더보기를 눌렀는데 원형이 남아 있다');
      assert.equal(await page.locator('#menu').isVisible(), true, '더보기를 눌렀는데 판이 안 열렸다');
      assert.equal(await page.locator('#menuTiles .menu-tile').count(), 6, '판의 켜고 끄기 칸이 6개가 아니다');
      assert.equal(await page.locator('#menuClose').isVisible(), true, '닫는 단추가 눈에 안 보인다');
      await page.click('#menuClose');
      assert.equal(await page.locator('#menu').isVisible(), false, '단추를 눌렀는데 안 닫힌다');
      await page.close();
    });

    await t.test('원형은 키보드로 고른다. 첫 버튼에 포커스, 화살표로 이동, Enter 로 바꾼 뒤에도 같은 버튼', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      const focused = () => page.evaluate(() => [...document.querySelectorAll('#ring .ring-btn')].indexOf(document.activeElement));
      assert.equal(await focused(), 0, '원형을 열었는데 첫 버튼에 포커스가 없다');
      await page.keyboard.press('ArrowRight');
      assert.equal(await focused(), 1, '오른쪽 화살표로 다음 버튼에 안 간다');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await focused(), 6, '처음에서 왼쪽 화살표면 마지막 (더보기) 으로 돌아야 한다');
      // 듣기 버튼은 서버를 거치지 않는 값 (earMode) 이라 시험 서버에서도 그대로 남음
      await page.keyboard.press('ArrowRight');
      const before = await page.evaluate(() => document.getElementById('earMode').value);
      await page.keyboard.press('Enter');
      const after = await page.evaluate(() => document.getElementById('earMode').value);
      assert.equal((before === 'off') !== (after === 'off'), true, `Enter 로 듣기가 안 바뀐다 (${before} -> ${after})`);
      assert.equal(await focused(), 0, '바꾼 뒤 포커스가 같은 버튼에 안 남았다');
      // 더보기도 키보드로. 판이 열리면 첫 칸에 포커스, 칸은 3열이라 아래 화살표가 3칸
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      const tile = () => page.evaluate(() => [...document.querySelectorAll('#menuTiles .menu-tile')].indexOf(document.activeElement));
      assert.equal(await page.locator('#menu').isVisible(), true, '키보드로 더보기를 눌렀는데 판이 안 열렸다');
      assert.equal(await tile(), 0, '판이 열렸는데 첫 칸에 포커스가 없다');
      await page.keyboard.press('ArrowDown');
      assert.equal(await tile(), 3, '아래 화살표가 다음 줄 같은 칸으로 안 간다');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      assert.equal(await tile(), 0, '칸을 바꾼 뒤 포커스가 같은 칸에 안 남았다');
      await page.keyboard.press('Escape');
      assert.equal(!(await page.evaluate(() => document.getElementById('ring').hidden)), false, 'Esc 로 원형이 안 닫힌다');
      await page.close();
    });

    await t.test('몸이 화면 끝에 있어도 원형 버튼이 화면 안에 겹치지 않고 펼쳐진다', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      for (const roomX of ['40', '480']) {
        await page.evaluate((x) => { localStorage.setItem('companion.roomX', x); localStorage.setItem('companion.roomY', '40'); }, roomX);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await page.locator('.stage').click({ button: 'right', force: true });
        const pts = await page.evaluate(() => [...document.querySelectorAll('#ring .ring-btn')].map((b) => { const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
        assert.equal(pts.length, 7, `원형 버튼이 7개가 아니다 (roomX ${roomX})`);
        const size = page.viewportSize();
        for (const [x, y] of pts) assert.ok(x >= 26 && x <= size.width - 26 && y >= 26 && y <= size.height - 26, `버튼이 화면 밖 (${x}, ${y}), roomX ${roomX}`);
        for (let i = 0; i < pts.length; i += 1) {
          for (let j = i + 1; j < pts.length; j += 1) {
            const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
            assert.ok(d >= 58, `버튼 ${i}, ${j} 이 겹친다 (거리 ${d.toFixed(0)}px, roomX ${roomX}) ${JSON.stringify(pts.map((p) => p.map(Math.round)))}`);
          }
        }
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => { localStorage.removeItem('companion.roomX'); localStorage.removeItem('companion.roomY'); });
      await page.close();
    });

    await t.test('원형이 열린 채로 몸을 끌면 원형이 닫힌다. 빈자리에 남지 않게', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      await page.evaluate(() => { localStorage.setItem('companion.roomX', '260'); localStorage.setItem('companion.roomY', '200'); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await page.locator('.stage').click({ button: 'right', force: true });
      assert.equal(!(await page.evaluate(() => document.getElementById('ring').hidden)), true, '원형이 안 열렸다');
      const box = await page.locator('.stage').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      assert.equal(!(await page.evaluate(() => document.getElementById('ring').hidden)), false, '끌었는데 원형이 옛 자리에 남았다');
      await page.evaluate(() => { localStorage.removeItem('companion.roomX'); localStorage.removeItem('companion.roomY'); });
      await page.close();
    });

    await t.test('저장이 실패하면 원형 버튼도 원래 값으로 돌아온다', async () => {
      // 이 시험 서버는 설정 저장 자리가 없어 저장이 늘 실패함
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      const before = await page.evaluate(() => document.getElementById('optScreen').checked);
      await page.locator('#ring .ring-btn').nth(1).click();
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => ({ box: document.getElementById('optScreen').checked, on: document.querySelectorAll('#ring .ring-btn')[1].classList.contains('on') }));
      assert.equal(state.box, before, '저장이 실패했는데 값 칸이 안 돌아왔다');
      assert.equal(state.on, before, '값 칸은 돌아왔는데 원형 버튼은 바뀐 채로 남았다');
      await page.close();
    });

    await t.test('원형 이름표: 켜고 끄기는 켜짐 꺼짐, 알림은 지금 값과 누르면 바뀔 값', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      const tips = await page.evaluate(() => [...document.querySelectorAll('#ring .ring-btn small')].map((s) => s.textContent));
      assert.match(tips[1], /^화면 보기 (켜짐|꺼짐)$/, `화면 보기 이름표: ${tips[1]}`);
      assert.match(tips[5], /^알림 .+, 누르면 .+$/, `알림 이름표에 다음 값이 없다: ${tips[5]}`);
      assert.doesNotMatch(tips[5], /켜짐|꺼짐/, `알림은 순환이라 켜짐 꺼짐이 아니다: ${tips[5]}`);
      assert.equal(tips[6], '더보기');
      const pressed = await page.evaluate(() => [...document.querySelectorAll('#ring .ring-btn')].map((b) => [b.getAttribute('aria-pressed'), b.classList.contains('on'), b.getAttribute('aria-label')]));
      for (const i of [0, 1, 2, 3, 4]) assert.equal(pressed[i][0], String(pressed[i][1]), `켜고 끄기 버튼 ${i} 의 aria-pressed 가 모양과 다르다`);
      assert.equal(pressed[5][0], null, '순환 (알림) 버튼에 aria-pressed 가 붙었다');
      assert.equal(pressed[6][0], null, '더보기 버튼에 aria-pressed 가 붙었다');
      assert.ok(pressed.every((p) => p[2]), '이름 (aria-label) 없는 원형 버튼이 있다');
      await page.close();
    });

    await t.test('판에서 연 "나에 대해 아는 것" 은 판 옆에 판 폭으로 뜬다. 화면 아래를 가로로 덮지 않게', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.evaluate(() => { localStorage.setItem('companion.roomX', '1300'); localStorage.setItem('companion.roomY', '300'); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await page.locator('.stage').click({ button: 'right', force: true });
      await page.locator('#ring .ring-btn.more').click();
      await page.click('.menu-rail button[data-page=more]');
      await page.click('#knownBtn');
      const [m, k] = await page.evaluate(() => [document.getElementById('menu'), document.getElementById('sheet')].map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }));
      assert.ok(k.width <= m.width + 1, `아는 것 판이 메뉴 판보다 넓다 (${k.width} > ${m.width})`);
      assert.ok(k.right <= m.left || k.left >= m.right, `아는 것 판이 메뉴 판을 덮는다 (${JSON.stringify({ m, k })})`);
      // 누르지 않고 판이 닫히는 경로 (창 크기 변경, 모니터 옮김, 끌기). 바깥 누르기 처리가 못 닫음
      await page.setViewportSize({ width: 1500, height: 900 });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.getElementById('menu').hidden), true, '창 크기가 바뀌었는데 판이 안 닫혔다');
      assert.equal(await page.evaluate(() => document.getElementById('sheet').hidden), true, '판은 닫혔는데 아는 것 판이 혼자 남았다');
      await page.evaluate(() => { localStorage.removeItem('companion.roomX'); localStorage.removeItem('companion.roomY'); });
      await page.close();
    });

    await t.test('물어보기 판은 전체 화면 창에서 몸 옆 360px. 모니터 아래를 가로로 덮지 않게', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.route('**/permission', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'test-1', what: '화면 보기' }) }));
      await page.waitForSelector('#ask:not([hidden])', { timeout: 5000 });
      const r = await page.evaluate(() => { const b = document.getElementById('ask').getBoundingClientRect(); return { width: b.width, left: b.left, text: document.getElementById('askWhat').textContent }; });
      assert.ok(r.width <= 361, `물어보기 판 폭이 ${r.width}px`);
      assert.doesNotMatch(r.text, /\?\./, `문구에 ?. 이 남았다: ${r.text}`);
      await page.unroute('**/permission');
      await page.close();
    });

    await t.test('아이콘 모드 원형도 버튼이 붙지 않는다 (가운데, 왼쪽 위 구석)', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      for (const at of [{ x: 230, y: 420 }, { x: 10, y: 10 }]) {
        await page.evaluate((p) => { localStorage.setItem('companion.iconMode', '1'); localStorage.setItem('companion.iconAt', JSON.stringify(p)); }, at);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await page.locator('#ntIcon').click({ button: 'right', force: true });
        const pts = await page.evaluate(() => [...document.querySelectorAll('#ring .ring-btn')].map((b) => { const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
        assert.equal(pts.length, 7, `원형 버튼이 7개가 아니다 (${JSON.stringify(at)})`);
        for (let i = 0; i < pts.length; i += 1) {
          for (let j = i + 1; j < pts.length; j += 1) {
            const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
            assert.ok(d >= 58, `버튼 ${i}, ${j} 간격 ${d.toFixed(0)}px (${JSON.stringify(at)})`);
          }
        }
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => { localStorage.setItem('companion.iconMode', '0'); localStorage.removeItem('companion.iconAt'); });
      await page.close();
    });

    await t.test('판은 다른 탭에서 닫았어도 빠른 설정 탭으로 다시 열리고 첫 칸에 포커스', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      await page.locator('#ring .ring-btn.more').click();
      await page.click('.menu-rail button[data-page=voice]');
      await page.click('#menuClose');
      await page.locator('.stage').click({ button: 'right' });
      await page.locator('#ring .ring-btn.more').click();
      const state = await page.evaluate(() => ({
        quick: document.querySelector('.menu-page[data-page=quick]').hidden === false,
        focus: [...document.querySelectorAll('#menuTiles .menu-tile')].indexOf(document.activeElement),
      }));
      assert.equal(state.quick, true, '지난번 탭 (목소리와 듣기) 이 남았다');
      assert.equal(state.focus, 0, '다시 연 판의 첫 칸에 포커스가 없다');
      await page.close();
    });

    await t.test('판의 탭줄도 키보드로. 위아래로 탭 사이, Enter 로 탭 바꿈, 오른쪽으로 그 탭의 첫 조작', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      await page.locator('#ring .ring-btn.more').click();
      await page.focus('.menu-rail button[data-page=quick]');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.page), 'voice', '아래 화살표로 다음 탭에 안 간다');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.querySelector('.menu-page[data-page=voice]').hidden), false, 'Enter 로 목소리와 듣기 탭이 안 열렸다');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'whoPick', '오른쪽 화살표로 그 탭의 첫 조작 (누구) 에 안 간다');
      await page.close();
    });

    await t.test('판의 끄기는 두 번 눌러야. 처음엔 빨갛게, 3초 지나면 원래대로', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      await page.locator('#ring .ring-btn.more').click();
      await page.click('#gripClose');
      assert.equal(await page.evaluate(() => document.getElementById('gripClose').classList.contains('armed')), true, '처음 눌렀는데 확인 상태가 아니다');
      await page.waitForTimeout(3200);
      assert.equal(await page.evaluate(() => document.getElementById('gripClose').classList.contains('armed')), false, '3초가 지났는데 확인 상태가 안 풀렸다');
      await page.close();
    });

    await t.test('원형 이름표는 화면 끝에서도 화면 안에 들어온다', async () => {
      const page = await openWindow('?full=1&roam=0&gravity=0');
      for (const at of [{ x: 480, y: 830 }, { x: 10, y: 830 }]) {
        await page.evaluate((p) => { localStorage.setItem('companion.iconMode', '1'); localStorage.setItem('companion.iconAt', JSON.stringify(p)); }, at);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await page.locator('#ntIcon').click({ button: 'right', force: true });
        const out = await page.evaluate(() => {
          const res = [];
          for (const b of document.querySelectorAll('#ring .ring-btn')) {
            const tip = b.querySelector('small');
            tip.style.display = 'block';
            const r = tip.getBoundingClientRect();
            if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) res.push([tip.textContent, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]);
            tip.style.display = '';
          }
          return res;
        });
        assert.deepEqual(out, [], `화면 밖 이름표 (${JSON.stringify(at)}): ${JSON.stringify(out)}`);
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => { localStorage.setItem('companion.iconMode', '0'); localStorage.removeItem('companion.iconAt'); });
      await page.close();
    });

    await t.test('원형에서 아이콘 모드를 켜면 원형이 닫힌다. 몸이 사라져 원형의 중심이 없어짐', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      // 켜고 끄기 순서: 듣기, 화면 보기, 소리, 먼저 말 걸기, 아이콘 모드, 알림, 더보기
      await page.locator('#ring .ring-btn').nth(4).click();
      assert.equal(!(await page.evaluate(() => document.getElementById('ring').hidden)), false, '아이콘 모드를 켰는데 원형이 빈자리에 남았다');
      assert.equal(await page.evaluate(() => document.body.classList.contains('iconmode')), true, '아이콘 모드가 안 켜졌다');
      await page.evaluate(() => localStorage.setItem('companion.iconMode', '0'));
      await page.close();
    });

    await t.test('창을 여는 것만으로 터지는 자리가 없다. body3d 가 TDZ 로 터지던 자리', () => {
      assert.deepEqual(consoleMask, [], `창이 열리다 터졌다: ${consoleMask.join(', ')}`);
    });
  } finally {
    await browser.close();
    await body.sense.stop?.();
  }
});
