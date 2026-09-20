/**
 * X 계정 목록 수집기. background 가 MAIN world 에 주입
 *
 * 확장인 이유: 자동화 프로필의 X 로그인은 탐지 차단. 사용자 세션 안이라 무관
 * MAIN world 인 이유: 격리 세계의 window.fetch 는 화면이 쓰는 것과 다른 객체
 * 스크롤 대신 되부르기인 이유: 2026-09-21 실측, 8회 스크롤에 21칸 고정
 * 한 걸음씩인 이유: MV3 워커는 30초 무활동이면 종료. 긴 await 는 응답 없음
 * 정본: memo/systems/karmo-web-extension.md
 */

/** 걸음 사이 기억. 탭이 살아 있는 동안 남는다 */
function xState() {
  if (!globalThis.__karmoX) {
    globalThis.__karmoX = {
      users: new Map(),
      seenCursor: new Set(),
      cursor: null,
      phase: "init",
      rounds: 0,
      note: "",
    };
  }
  return globalThis.__karmoX;
}

/** 화면이 보낸 GraphQL 요청을 본뜬다. 커서만 갈아 끼우면 나머지가 따라온다 */
function installXCapture() {
  if (globalThis.__karmoHooked) return;
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
}

/** 탭을 옆으로 눌렀다 되돌려 새 요청을 뽑는다. 새로고침은 후크가 날아간다 */
async function forceRefetch() {
  const here = location.pathname;
  const tabs = [...document.querySelectorAll('a[role="tab"]')];
  const other = tabs.find((a) => (a.getAttribute("href") || "") !== here);
  const back = tabs.find((a) => (a.getAttribute("href") || "") === here);
  if (!other || !back) return false;
  other.click();
  await new Promise((r) => setTimeout(r, 3000));
  back.click();
  await new Promise((r) => setTimeout(r, 3000));
  return !!(globalThis.__karmoCap && globalThis.__karmoCap.last);
}

/** 응답 모양이 바뀌어도 버티게, 뽑을 것만 재귀로 줍는다 */
function harvest(node, users, cursors, depth) {
  if (!node || typeof node !== "object" || depth > 24) return;
  if (Array.isArray(node)) {
    for (const x of node) harvest(x, users, cursors, depth + 1);
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
  for (const k of Object.keys(node)) harvest(node[k], users, cursors, depth + 1);
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

function xSnap(S) {
  const done = S.phase !== "page";
  return { count: S.users.size, rounds: S.rounds, note: S.note, done, rows: done ? [...S.users.values()] : null };
}

/**
 * 한 걸음. 워커가 done 까지 되부름
 * @returns {Promise<{count:number,rounds:number,note:string,done:boolean,rows:Array<object>|null}>}
 */
async function xStep() {
  const S = xState();

  if (S.phase === "init") {
    grabCells(S.users);
    installXCapture();
    const ok = await forceRefetch();
    S.phase = ok ? "page" : "stop";
    S.note = ok ? "ok" : "요청 본뜨기 실패. 화면 칸만";
    return xSnap(S);
  }
  if (S.phase !== "page") return xSnap(S);

  const tpl = globalThis.__karmoCap.last;
  const u = new URL(tpl.url);
  const vars = JSON.parse(u.searchParams.get("variables") || "{}");
  if (S.cursor) vars.cursor = S.cursor; else delete vars.cursor;
  u.searchParams.set("variables", JSON.stringify(vars));

  const res = await fetch(u.toString(), { headers: tpl.headers, credentials: "include" });
  S.rounds += 1;
  if (!res.ok) {
    S.phase = "stop";
    S.note = `응답 ${res.status}`;
    return xSnap(S);
  }
  const cursors = [];
  const before = S.users.size;
  harvest(await res.json(), S.users, cursors, 0);
  const next = cursors.find((c) => !S.seenCursor.has(c));
  if (!next || S.users.size === before || S.rounds >= 80) {
    S.phase = "stop";
    if (!S.note) S.note = "ok";
    return xSnap(S);
  }
  S.seenCursor.add(next);
  S.cursor = next;
  return xSnap(S);
}

/**
 * 내가 만든 리스트만. 남의 리스트는 취향 자료 아님
 * (사용자 2026-09-20 "그건 내 게 아니잖아")
 */
async function collectXOwnedLists() {
  const me = location.pathname.split("/")[1].toLowerCase();
  const out = new Map();
  for (let i = 0; i < 8; i += 1) {
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
globalThis.xStep = xStep;
globalThis.collectXOwnedLists = collectXOwnedLists;
