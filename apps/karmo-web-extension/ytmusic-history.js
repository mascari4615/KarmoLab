/**
 * 유튜브 뮤직 시청 기록 수집기. background 가 MAIN world 에 주입
 *
 * 일반 유튜브와 다른 점: ytInitialData 없음, browse 요청도 안 잡힘
 *   화면에 박혀 옴. DOM 에만 있음 (2026-09-21 실측, 첫 화면 199곡)
 * 그래서 이것만 DOM 에서
 * 정본: memo/systems/karmo-web-extension.md
 */

/** 걸음 사이 기억. 탭이 살아 있는 동안 남는다 */
function ytmState() {
  if (!globalThis.__karmoYtm) globalThis.__karmoYtm = { seen: new Map(), stall: 0, rounds: 0 };
  return globalThis.__karmoYtm;
}

/** 절 머리(오늘, 지난주)를 곡에 붙인다 */
function ytmGrab(seen) {
  let day = "";
  const all = document.querySelectorAll('h2, ytmusic-responsive-list-item-renderer');
  for (const el of all) {
    if (el.tagName === "H2") {
      const t = el.innerText.trim();
      if (t) day = t;
      continue;
    }
    const a = el.querySelector('a[href*="watch"]');
    const href = a ? a.getAttribute("href") : "";
    const m = href.match(/v=([\w-]+)/);
    if (!m || seen.has(m[1])) continue;
    const lines = el.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
    const dur = lines.find((x) => /^\d+:\d\d$/.test(x)) || "";
    seen.set(m[1], {
      id: m[1],
      day,
      duration: dur,
      channel: lines[1] || "",
      title: lines[0] || "",
      album: lines[2] && lines[2] !== dur ? lines[2] : "",
    });
  }
}

/**
 * 한 걸음에 스크롤 다섯 번. 숨은 탭이면 안 늘 수 있음
 * @returns {Promise<{count:number,done:boolean,note:string,rows:Array<object>}>}
 */
async function ytmStep() {
  const S = ytmState();
  ytmGrab(S.seen);
  for (let i = 0; i < 5; i += 1) {
    const before = S.seen.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const box = document.querySelector("ytmusic-app-layout #contentContainer, ytmusic-app-layout");
    if (box) box.scrollTop = box.scrollHeight;
    await new Promise((r) => setTimeout(r, 900));
    ytmGrab(S.seen);
    S.rounds += 1;
    if (S.seen.size === before) S.stall += 1; else S.stall = 0;
  }
  const done = S.stall >= 6 || S.rounds >= 120;
  return { count: S.seen.size, done, note: done ? "ok" : "더", rows: [...S.seen.values()] };
}

// background 의 이름 호출용 전역 등록
globalThis.ytmStep = ytmStep;

/** 내가 만든 재생목록 목록. 라이브러리 화면에서 */
async function ytmPlaylists() {
  const out = new Map();
  for (let i = 0; i < 8; i += 1) {
    for (const el of document.querySelectorAll("ytmusic-two-row-item-renderer")) {
      const a = el.querySelector('a[href*="playlist"]');
      const m = (a ? a.getAttribute("href") : "").match(/list=([\w-]+)/);
      if (!m || out.has(m[1])) continue;
      const lines = el.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
      out.set(m[1], { id: m[1], title: lines[0] || "", sub: lines[1] || "" });
    }
    if (out.size) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [...out.values()];
}

// background 의 이름 호출용 전역 등록
globalThis.ytmPlaylists = ytmPlaylists;
