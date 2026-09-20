/**
 * 유튜브 시청 기록 수집기. background 가 탭에 주입
 *
 * 확장인 이유: 자동화 브라우저의 구글 신규 로그인은 탐지 차단
 * 사용자가 직접 설치한 확장이라 그 벽과 무관
 * 한 걸음씩인 이유: MV3 워커 30초 무활동 종료. 긴 스크롤 중 탭 소멸
 *   (2026-09-21 실측 "Frame with ID 0 was removed")
 * 정본: memo/systems/karmo-web-extension.md
 *
 * 화면 태그 2026-09 변경. ytd-video-renderer -> yt-lockup-view-model
 * 결과 0 이면 여기부터 확인
 */

/** 걸음 사이 기억. 탭이 살아 있는 동안 남는다 */
function ytState() {
  if (!globalThis.__karmoYt) globalThis.__karmoYt = { seen: new Map(), stall: 0, rounds: 0 };
  return globalThis.__karmoYt;
}

function ytGrab(seen) {
  const BULLET = String.fromCharCode(0x2022);
  for (const v of document.querySelectorAll("yt-lockup-view-model")) {
    const a = v.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
    const href = a ? a.getAttribute("href") : "";
    const m = href.match(/v=([\w-]+)/) || href.match(/shorts\/([\w-]+)/);
    const id = m && m[1];
    if (!id || seen.has(id)) continue;
    const parts = v.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
    const duration = /^\d+:\d+/.test(parts[0]) ? parts.shift() : "";
    const title = parts.shift() || "";
    const channel = (parts[0] && parts[0] !== BULLET && !parts[0].startsWith("조회수")) ? parts[0] : "";
    const sec = v.closest("ytd-item-section-renderer");
    const head = sec && sec.querySelector("#title");
    seen.set(id, { id, day: head ? head.textContent.trim() : "", duration, channel, title });
  }
}

/**
 * 한 걸음에 스크롤 다섯 번. 워커가 done 까지 되부름
 * @returns {Promise<{count:number,done:boolean,note:string,rows:Array<object>|null}>}
 */
async function ytStep() {
  const S = ytState();
  ytGrab(S.seen);
  for (let i = 0; i < 5; i += 1) {
    const before = S.seen.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 900));
    ytGrab(S.seen);
    S.rounds += 1;
    if (S.seen.size === before) S.stall += 1; else S.stall = 0;
  }
  const done = S.stall >= 20 || S.rounds >= 300;
  return { count: S.seen.size, done, note: done ? "ok" : "더", rows: done ? [...S.seen.values()] : null };
}

// background 의 이름 호출용 전역 등록
globalThis.ytStep = ytStep;
