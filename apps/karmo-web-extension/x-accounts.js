/**
 * X 계정 목록 수집기. background 가 MAIN world 에 주입
 *
 * 확장인 이유: 자동화 프로필의 X 로그인은 탐지 차단. 사용자 세션 안이라 무관
 * MAIN world 인 이유: 격리 세계의 window.fetch 는 화면이 쓰는 것과 다른 객체
 * 스크롤 대신 되부르기인 이유: 2026-09-21 실측, 8회 스크롤에 21칸 고정
 * 정본: memo/systems/karmo-web-extension.md
 */

/** 화면이 보낸 GraphQL 요청을 본뜬다. 커서만 갈아 끼우면 나머지가 따라온다 */
function installXCapture() {
  if (globalThis.__karmoHooked) return true;
  globalThis.__karmoHooked = 1;
  globalThis.__karmoCap = { last: null };
  const orig = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    try {
      const req = typeof input === "object" && input && input.url ? input : null;
      const url = req ? req.url : String(input);
      if (url.includes("/i/api/graphql/")) {
        const headers = {};
        const h = req ? req.headers : init && init.headers;
        if (h && typeof h.forEach === "function") h.forEach((v, k) => { headers[k] = v; });
        else if (h) Object.assign(headers, h);
        globalThis.__karmoCap.last = { url, headers };
      }
    } catch { /* 원본 호출은 막지 않는다 */ }
    return orig.apply(this, arguments);
  };
  return true;
}

/** 탭을 옆으로 눌렀다 되돌려 새 요청을 뽑는다. 새로고침은 후크가 날아간다 */
async function forceRefetch() {
  const tabs = [...document.querySelectorAll('a[role="tab"]')];
  const here = location.pathname;
  const other = tabs.find((a) => (a.getAttribute("href") || "") !== here);
  const back = tabs.find((a) => (a.getAttribute("href") || "") === here);
  if (!other || !back) return false;
  other.click();
  await new Promise((r) => setTimeout(r, 3500));
  back.click();
  await new Promise((r) => setTimeout(r, 3500));
  return !!globalThis.__karmoCap.last;
}

/** 응답 모양이 바뀌어도 버티게, 뽑을 것만 재귀로 줍는다 */
function harvest(node, users, cursors) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) harvest(x, users, cursors);
    return;
  }
  const lg = node.legacy;
  if (node.__typename === "User" && lg && lg.screen_name) {
    users.set(lg.screen_name, {
      handle: lg.screen_name,
      name: lg.name || "",
      bio: String(lg.description || "").replace(/\s+/g, " "),
    });
  }
  if (node.cursorType === "Bottom" && node.value) cursors.push(node.value);
  for (const k of Object.keys(node)) harvest(node[k], users, cursors);
}

/** 화면에 이미 붙어 있는 칸. 되부르기 전 첫 묶음 */
function grabCells(users) {
  const SKIP = new Set(["팔로우", "팔로잉", "차단됨", "Follow", "Following"]);
  for (const c of document.querySelectorAll('[data-testid="UserCell"]')) {
    const a = c.querySelector('a[role="link"][href^="/"]');
    const handle = (a ? a.getAttribute("href") : "").replace(/^\//, "");
    if (!handle || handle.includes("/") || users.has(handle)) continue;
    const lines = c.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
    users.set(handle, { handle, name: lines[0] || "", bio: lines.slice(2).filter((l) => !SKIP.has(l)).join(" ") });
  }
}

/**
 * 지금 열린 목록 화면을 끝까지. 팔로잉, 팔로워, 리스트 구성원 다 같은 길
 * @returns {Promise<{rows:Array<object>,rounds:number,note:string}>}
 */
async function collectXTimeline() {
  const users = new Map();
  grabCells(users);
  installXCapture();
  const got = await forceRefetch();
  if (!got) return { rows: [...users.values()], rounds: 0, note: "요청 본뜨기 실패. 화면 칸만" };

  const tpl = globalThis.__karmoCap.last;
  const base = new URL(tpl.url);
  const vars = JSON.parse(base.searchParams.get("variables") || "{}");
  let cursor = null;
  let rounds = 0;
  const seenCursor = new Set();

  for (; rounds < 60; rounds += 1) {
    const u = new URL(base.toString());
    if (cursor) vars.cursor = cursor; else delete vars.cursor;
    u.searchParams.set("variables", JSON.stringify(vars));
    const res = await fetch(u.toString(), { headers: tpl.headers, credentials: "include" });
    if (!res.ok) return { rows: [...users.values()], rounds, note: `응답 ${res.status}` };
    const cursors = [];
    const before = users.size;
    harvest(await res.json(), users, cursors);
    const next = cursors.find((c) => !seenCursor.has(c));
    if (!next || users.size === before) break;
    seenCursor.add(next);
    cursor = next;
    await new Promise((r) => setTimeout(r, 700));
  }
  return { rows: [...users.values()], rounds, note: "ok" };
}

/**
 * 내가 만든 리스트만. 남의 리스트는 취향 자료 아님
 * (사용자 2026-09-20 "그건 내 게 아니잖아")
 */
async function collectXOwnedLists() {
  const me = location.pathname.split("/")[1].toLowerCase();
  const out = new Map();
  for (let i = 0; i < 12; i += 1) {
    for (const a of document.querySelectorAll('a[href*="/i/lists/"]')) {
      const m = (a.getAttribute("href") || "").match(/\/i\/lists\/(\d+)/);
      if (!m || out.has(m[1])) continue;
      const lines = a.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
      const owner = (lines.find((l) => l.startsWith("@")) || "").slice(1).toLowerCase();
      if (owner && owner !== me) continue;
      out.set(m[1], { id: m[1], name: lines[0] || m[1], owner: owner || me });
    }
    if (out.size) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [...out.values()];
}

// background 의 이름 호출용 전역 등록
globalThis.collectXTimeline = collectXTimeline;
globalThis.collectXOwnedLists = collectXOwnedLists;
