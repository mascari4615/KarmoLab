/**
 * X 계정 목록 수집기. background 가 MAIN world 에 주입
 *
 * 확장인 이유: 자동화 프로필의 X 로그인은 탐지 차단. 사용자 세션 안이라 무관
 * MAIN world 인 이유: 격리 세계의 window.fetch 는 화면이 쓰는 것과 다른 객체
 * 스크롤이 아닌 이유: 수집 탭은 visibilityState 가 hidden. 무한 스크롤 로더 정지
 * 요청 본뜨기는 x-hook.js 가 document_start 에서
 * 한 걸음씩인 이유: MV3 워커 30초 무활동 종료
 * 정본: memo/systems/karmo-web-extension.md
 */

/** 걸음 사이 기억. 탭이 살아 있는 동안 남는다 */
function xState() {
  if (!globalThis.__karmoX) {
    globalThis.__karmoX = { users: new Map(), seenCursor: new Set(), cursor: null, phase: "init", rounds: 0, note: "" };
  }
  return globalThis.__karmoX;
}

/** 화면이 보낸 요청 중 이 목록에 맞는 것 */
function pickTemplate() {
  const cap = globalThis.__karmoCap;
  if (!cap) return null;
  const want = ["ListMembers", "ListSubscribers", "Following", "Followers", "BlueVerifiedFollowers"];
  for (const op of want) {
    if (cap.byOp && cap.byOp[op]) return cap.byOp[op];
  }
  return cap.last || null;
}

/** x-hook.js 가 못 실린 경우의 뒷문 */
function installXCapture() {
  if (globalThis.__karmoHooked) return;
  globalThis.__karmoHooked = 1;
  globalThis.__karmoCap = { last: null, byOp: {} };
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
        const op = url.split("?")[0].split("/").pop();
        const rec = { url, headers, op };
        globalThis.__karmoCap.last = rec;
        globalThis.__karmoCap.byOp[op] = rec;
      }
    } catch { /* 원본 호출은 막지 않는다 */ }
    return orig.apply(this, arguments);
  };
}

/** 탭을 옆으로 눌렀다 되돌려 새 요청 뽑기. 새로고침은 후크가 날아감 */
async function forceRefetch() {
  const here = location.pathname;
  const tabs = [...document.querySelectorAll('a[role="tab"]')];
  const other = tabs.find((a) => (a.getAttribute("href") || "") !== here);
  const back = tabs.find((a) => (a.getAttribute("href") || "") === here);
  if (!other || !back) return;
  other.click();
  await new Promise((r) => setTimeout(r, 3000));
  back.click();
  await new Promise((r) => setTimeout(r, 3000));
}

/**
 * 응답 모양이 바뀌어도 버티게, 뽑을 것만 재귀로
 * 2026-09-21 기준 핸들은 core.screen_name. 예전 legacy.screen_name 도 허용
 */
function harvest(node, users, cursors, depth) {
  if (!node || typeof node !== "object" || depth > 30) return;
  if (Array.isArray(node)) {
    for (const x of node) harvest(x, users, cursors, depth + 1);
    return;
  }
  const core = node.core && typeof node.core.screen_name === "string" ? node.core : null;
  const lg = node.legacy && typeof node.legacy.screen_name === "string" ? node.legacy : null;
  const who = core || lg;
  if (who) {
    const bio = (node.legacy && node.legacy.description) || (node.profile_bio && node.profile_bio.description) || "";
    users.set(who.screen_name, {
      handle: who.screen_name,
      name: who.name || "",
      bio: String(bio).replace(/\s+/g, " "),
    });
  }
  if (node.cursorType === "Bottom" && node.value) cursors.push(node.value);
  for (const k of Object.keys(node)) harvest(node[k], users, cursors, depth + 1);
}

/** 화면에 이미 붙어 있는 칸. 되부르기가 막혔을 때의 최소 수확 */
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
  return {
    count: S.users.size,
    rounds: S.rounds,
    note: S.note,
    done: S.phase !== "page",
    rows: [...S.users.values()],
  };
}

/**
 * 한 걸음. 워커가 done 까지 되부름
 * @returns {Promise<{count:number,rounds:number,note:string,done:boolean,rows:Array<object>}>}
 */
async function xStep() {
  const S = xState();

  if (S.phase === "init") {
    // 화면이 아직 요청 전일 수 있음. 잠깐 대기 (실측: 리스트 2명에서 정지)
    for (let i = 0; i < 8 && !pickTemplate(); i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!pickTemplate()) {
      grabCells(S.users);
      installXCapture();
      await forceRefetch();
    }
    const first = pickTemplate();
    S.phase = first ? "page" : "stop";
    S.note = first ? first.op : "요청 본뜨기 실패. 화면 칸만";
    return xSnap(S);
  }
  if (S.phase !== "page") return xSnap(S);

  const tpl = pickTemplate();
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
  if (!next || S.users.size === before || S.rounds >= 60) {
    S.phase = "stop";
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
  const cap = globalThis.__karmoCap;
  const tpl = cap && cap.byOp && cap.byOp.ListsManagementPageTimeline;
  if (!tpl) return [];
  const res = await fetch(tpl.url, { headers: tpl.headers, credentials: "include" });
  if (!res.ok) return [];

  const out = new Map();
  const walk = (n, d) => {
    if (!n || typeof n !== "object" || d > 30) return;
    if (Array.isArray(n)) {
      for (const x of n) walk(x, d + 1);
      return;
    }
    const id = n.id_str || n.rest_id;
    if (id && n.name && n.member_count !== undefined) {
      const ur = n.user_results && n.user_results.result;
      const owner = ((ur && ur.core && ur.core.screen_name) || (ur && ur.legacy && ur.legacy.screen_name) || "").toLowerCase();
      if (owner === me) out.set(String(id), { id: String(id), name: n.name, members: n.member_count });
    }
    for (const k of Object.keys(n)) walk(n[k], d + 1);
  };
  walk(await res.json(), 0);
  return [...out.values()];
}

// background 의 이름 호출용 전역 등록
globalThis.xStep = xStep;
globalThis.collectXOwnedLists = collectXOwnedLists;
