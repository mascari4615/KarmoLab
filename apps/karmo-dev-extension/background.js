importScripts("schedule.js");

/**
 * MV3 service worker. 배지, 알림, 메시지 중계 등은 여기에 추가.
 *
 * 즐겨찾기 원격 조작: `externally_connectable` 에 허용된 페이지(블로그, 로컬호스트)에서
 *   chrome.runtime.sendMessage("<확장ID>", { type: "bookmarks.list" }, cb)
 * 로 부른다. 확장 페이지를 직접 못 여는 자동화(예: Claude in Chrome)에서 쓰라고 뚫어 둔 통로다.
 */

chrome.runtime.onInstalled.addListener(() => {
  // 개발: chrome://extensions 에서 "서비스 워커" 로그로 확인 가능
});

function flatten(nodes, folder, out) {
  for (const n of nodes) {
    if (n.url) out.push({ id: n.id, name: n.title || "", url: n.url, folder });
    if (n.children) flatten(n.children, folder ? `${folder}/${n.title}` : n.title || "", out);
  }
  return out;
}

async function listBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  return flatten(tree, "", []);
}

const ROOT_IDS = new Set(["0", "1", "2", "3"]);

/** 폴더까지 포함한 평면 목록 */
async function listAll() {
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  const walk = (nodes, folder) => {
    for (const n of nodes) {
      const path = folder ? folder + "/" + n.title : n.title || "";
      if (n.url) out.push({ id: n.id, type: "url", name: n.title || "", url: n.url, folder });
      else {
        if (!ROOT_IDS.has(n.id)) out.push({ id: n.id, type: "folder", name: n.title || "", folder });
        walk(n.children || [], path);
      }
    }
  };
  walk(tree, "");
  return out;
}

/** 폴더는 자식까지 통째로 */
async function removeTrees(ids) {
  const ok = [];
  const fail = [];
  for (const id of ids.map(String)) {
    if (ROOT_IDS.has(id)) {
      fail.push({ id, error: "루트 폴더는 못 지운다" });
      continue;
    }
    try {
      await chrome.bookmarks.removeTree(id);
      ok.push(id);
    } catch (e) {
      fail.push({ id, error: String(e && e.message ? e.message : e) });
    }
  }
  return { ok, fail };
}

/** 북마크가 하나도 없는 폴더를 안쪽부터 지운다 */
async function pruneEmptyFolders() {
  const removed = [];
  let changed = true;
  while (changed) {
    changed = false;
    const tree = await chrome.bookmarks.getTree();
    const empties = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.url) continue;
        walk(n.children || []);
        if (!ROOT_IDS.has(n.id) && (n.children || []).length === 0) empties.push({ id: n.id, name: n.title || "" });
      }
    };
    walk(tree);
    for (const f of empties) {
      try {
        await chrome.bookmarks.remove(f.id);
        removed.push(f);
        changed = true;
      } catch {
        /* 다음 회차에 다시 시도 */
      }
    }
  }
  return removed;
}

async function removeBookmarks(ids) {
  const ok = [];
  const fail = [];
  for (const id of ids.map(String)) {
    try {
      await chrome.bookmarks.remove(id);
      ok.push(id);
    } catch (e) {
      fail.push({ id, error: String(e && e.message ? e.message : e) });
    }
  }
  return { ok, fail };
}

/** 목이 안 돌아오면 기다리지 말 것. 멈춤을 무한으로 두면 원인을 못 본다 */
function within(ms, label, p) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`\uc2dc\uac04 \ucd08\uacfc ${label} ${ms}ms`)), ms)),
  ]);
}

/** 진행 한 줄. 막혔을 때 어디서인지 보려고 */
async function note(where, detail) {
  const now = new Date().toISOString();
  const cur = (await chrome.storage.local.get("karmo.progress"))["karmo.progress"] || [];
  cur.push({ at: now, where, detail });
  await chrome.storage.local.set({ "karmo.progress": cur.slice(-80) });
}

/** 탭 로드 대기. 30초 넘으면 그냥 간다 */
async function waitLoaded(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    if (t && t.status === "complete") {
      await new Promise((r) => setTimeout(r, 3000));
      return;
    }
  } catch { /* 못 읽으면 아래 대기로 */ }
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(done);
        setTimeout(resolve, 3000);
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 30000);
  });
}

/** 이 확장이 연 수집 탭 id. 워커가 죽으면 finally 가 안 돌아 탭이 남는다 (2026-09-22 치지직, X 탭 실측) */
const OPEN_TABS_KEY = "karmo.openTabs";

async function openWorkTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  const cur = (await chrome.storage.local.get(OPEN_TABS_KEY))[OPEN_TABS_KEY] || [];
  await chrome.storage.local.set({ [OPEN_TABS_KEY]: [...cur, tab.id] });
  return tab;
}

async function closeWorkTab(tabId) {
  try { await chrome.tabs.remove(tabId); } catch { /* 이미 닫혔으면 무시 */ }
  const cur = (await chrome.storage.local.get(OPEN_TABS_KEY))[OPEN_TABS_KEY] || [];
  await chrome.storage.local.set({ [OPEN_TABS_KEY]: cur.filter((id) => id !== tabId) });
}

/** 워커가 다시 뜰 때 지난 실행이 남긴 탭을 닫는다. 사용자가 직접 연 탭은 목록에 없어 안 건드린다 */
async function reapOrphanTabs() {
  const cur = (await chrome.storage.local.get(OPEN_TABS_KEY))[OPEN_TABS_KEY] || [];
  let closed = 0;
  /* 에이전트가 주소로 연 bridge 탭 (주소에 run 이 붙은 것). ext.reload 로 워커가 새로 뜨면 4초 뒤 닫기 타이머가 사라져 남음
     (사용자 2026-09-25 "다 쓰면 좀 닫았으면"). 사람이 연 bridge (run 없음) 는 안 건드림 */
  try {
    const left = await chrome.tabs.query({ url: ["http://127.0.0.1/*", "http://localhost/*"] });
    for (const t of left) {
      if (/\/karmo-(dev|web)-extension\/bridge\.html\?(.*&)?run=/.test(t.url || "")) {
        try { await chrome.tabs.remove(t.id); closed += 1; } catch { /* 이미 없음 */ }
      }
    }
  } catch { /* tabs.query 실패는 무시 */ }
  for (const id of cur) {
    try { await chrome.tabs.remove(id); closed += 1; } catch { /* 이미 없음 */ }
  }
  if (cur.length) await chrome.storage.local.set({ [OPEN_TABS_KEY]: [] });
  if (closed) await note("reap", `고아 탭 ${closed}개 닫음`);
  return closed;
}

reapOrphanTabs();

/**
 * 한 걸음씩 되부르기. MV3 워커는 30초 무활동이면 종료
 * 긴 await 하나면 응답이 영영 안 옴 (2026-09-21 15분 멈춤 실측)
 * @param {string} url 열 주소
 * @param {string} file 주입할 파일
 * @param {string} fnName done 을 돌려주는 걸음 함수
 * @param {number} [maxSteps] 걸음 상한
 */
async function stepInTab(url, file, fnName, maxSteps) {
  const tab = await openWorkTab(url);
  try {
    try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch { /* 지원 안 하면 그대로 */ }
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id }, world: "MAIN" };
    try {
      await within(20000, "inject", chrome.scripting.executeScript({ ...where, files: [file] }));
    } catch (e) {
      await note("inject-fail", `${url} ${e.message}`);
      return { count: 0, done: true, note: "\uc8fc\uc785 \uc2e4\ud328 " + e.message, rows: [] };
    }
    let last = null;
    for (let i = 0; i < (maxSteps || 90); i += 1) {
      let out;
      try {
        [out] = await within(45000, `step${i}`, chrome.scripting.executeScript({
          ...where,
          func: (n) => globalThis[n](),
          args: [fnName],
        }));
      } catch (e) {
        await note("step-fail", `${url} #${i} ${e.message}`);
        return last || { count: 0, done: true, note: "\uac78\uc74c \uc2e4\ud328 " + e.message, rows: [] };
      }
      last = out && out.result;
      await note("step", `${url} #${i} ${last ? last.count + " " + last.note : "no-result"}`);
      if (!last || last.done) return last;
    }
    return last;
  } finally {
    await closeWorkTab(tab.id);
  }
}

/**
 * 탭 개설 -> 주입 파일 실행 -> 탭 정리
 * @param {string} url 열 주소
 * @param {string} file 주입할 파일
 * @param {string} fnName 그 파일이 전역에 깐 함수 이름
 * @param {string} [world] "MAIN" 이면 페이지와 같은 세계. fetch 를 가로채야 할 때만
 */
async function runInTab(url, file, fnName, world) {
  const tab = await openWorkTab(url);
  try {
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id } };
    if (world) where.world = world;
    await within(20000, "inject", chrome.scripting.executeScript({ ...where, files: [file] }));
    const [out] = await within(60000, "call", chrome.scripting.executeScript({
      ...where,
      func: (n) => globalThis[n](),
      args: [fnName],
    }));
    return out && out.result;
  } finally {
    await closeWorkTab(tab.id);
  }
}

/**
 * 핀터레스트 쪽 하나에서 pinterest.js 의 pinScrape(opt). 탭은 끝나면 닫음
 * 레퍼런스 모으기의 "비슷한 핀" (karmo-design collect.mjs --seed). 로그인된 사용자 Edge 라 핀이 안 잠김
 */
async function pinRun(url, opt) {
  const tab = await openWorkTab(url);
  try {
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id } };
    await within(20000, "inject", chrome.scripting.executeScript({ ...where, files: ["pinterest.js"] }));
    const [out] = await within(90000, "call", chrome.scripting.executeScript({
      ...where,
      func: (o) => globalThis.pinScrape(o),
      args: [opt],
    }));
    return out && out.result;
  } finally {
    await closeWorkTab(tab.id);
  }
}

const PIN_HASH_RE = /^[0-9a-f]{32}$/;
const PIN_PAGE_RE = /^https:\/\/([a-z]+\.)?pinterest\.com\/pin\/[0-9]+\/?$/;

/** 씨앗 (좋다 받은 핀) 마다 핀 쪽을 찾아 아래 비슷한 핀을 줍는다. 씨앗은 12개, 한 씨앗에 80장까지 */
async function pinterestRelated(msg) {
  const per = Math.max(1, Math.min(80, Number(msg.per) || 25));
  const out = [];
  for (const s of (Array.isArray(msg.seeds) ? msg.seeds : []).slice(0, 12)) {
    if (!PIN_HASH_RE.test(String(s.key || ""))) continue;
    let href = String(s.pin || "");
    if (!href && s.q) {
      const r = await pinRun("https://kr.pinterest.com/search/pins/?q=" + encodeURIComponent(String(s.q)), { key: s.key });
      href = (r && r.href) || "";
    }
    href = href.split("?")[0];
    if (!PIN_PAGE_RE.test(href)) {
      out.push({ seed: s.key, error: "핀 쪽 주소를 못 찾음" });
      await note("pinterest.related", s.key + " 핀 쪽 없음");
      continue;
    }
    const r = await pinRun(href, { want: per });
    const rows = ((r && r.rows) || []).filter((x) => x.hash !== s.key);
    out.push({ seed: s.key, pin: href, rows });
    await note("pinterest.related", s.key + " " + rows.length);
  }
  return out;
}

/**
 * Google Cloud Console OAuth 클라이언트 화면 (gcp.js). **보이는 탭** 필수 (숨은 탭은 화면을 안 그림).
 * dryRun 이면 원본 칸만 읽기, 아니면 없는 원본만 더하고 저장. 탭은 끝나면 닫음 (keep 이면 남김)
 */
const GCP_CLIENT_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
/* 더할 수 있는 원본은 내 도메인뿐. 남의 사이트가 bridge 를 불러 제 출처를 끼우는 길 차단 */
const GCP_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?mascari4615\.com$/;

async function gcpClient(msg) {
  if (!GCP_CLIENT_RE.test(String(msg.clientId || ""))) throw new Error("clientId 형식 아님");
  const origins = Array.isArray(msg.origins) ? msg.origins.map(String) : [];
  const bad = origins.filter((o) => !GCP_ORIGIN_RE.test(o));
  if (bad.length) throw new Error("허용 안 된 원본: " + bad.join(", "));
  const project = /^[a-z0-9-]+$/.test(String(msg.project || "")) ? "?project=" + msg.project : "";
  const url = "https://console.cloud.google.com/auth/clients/" + msg.clientId + project;
  const tab = await chrome.tabs.create({ url, active: true });
  const cur = (await chrome.storage.local.get(OPEN_TABS_KEY))[OPEN_TABS_KEY] || [];
  await chrome.storage.local.set({ [OPEN_TABS_KEY]: [...cur, tab.id] });
  try {
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id } };
    await within(20000, "inject", chrome.scripting.executeScript({ ...where, files: ["gcp.js"] }));
    await note("gcp", "injected " + url);
    const [out] = await within(60000, "call", chrome.scripting.executeScript({
      ...where,
      func: (a) => globalThis.gcpClientStep(a),
      args: [{ origins, dryRun: !!msg.dryRun }],
    }));
    const result = out && out.result;
    /* 응답이 불러간 쪽에 못 닿는 경우가 있어 (2026-09-23 두 번) 결과를 남기고 gcp.last 로 읽게 */
    await chrome.storage.local.set({ "karmo.gcpLast": { at: new Date().toISOString(), result } });
    return result;
  } catch (e) {
    await chrome.storage.local.set({ "karmo.gcpLast": { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) } });
    throw e;
  } finally {
    if (!msg.keep) await closeWorkTab(tab.id);
  }
}

/**
 * Console 화면 하나를 보이는 탭으로 열어 gcp.js 의 함수 하나를 부르고 닫음.
 * 비밀값이 오갈 수 있어 결과를 저장소에 안 남김 (gcp.client 와 다름)
 */
async function gcpOnce(url, fnName, arg, mainHook) {
  const tab = await chrome.tabs.create({ url, active: true });
  const cur = (await chrome.storage.local.get(OPEN_TABS_KEY))[OPEN_TABS_KEY] || [];
  await chrome.storage.local.set({ [OPEN_TABS_KEY]: [...cur, tab.id] });
  try {
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id } };
    /* 페이지 세계 (MAIN) 에 응답 가로채기부터. 비밀값은 내부 API 응답에만 온다 */
    if (mainHook) {
      const main = { target: { tabId: tab.id }, world: "MAIN" };
      await within(20000, "inject-main", chrome.scripting.executeScript({ ...main, files: ["gcp.js"] }));
      await within(10000, "hook", chrome.scripting.executeScript({ ...main, func: (n) => globalThis[n](), args: [mainHook] }));
    }
    await within(20000, "inject", chrome.scripting.executeScript({ ...where, files: ["gcp.js"] }));
    const [out] = await within(60000, "call", chrome.scripting.executeScript({
      ...where,
      func: (n, a) => globalThis[n](a),
      args: [fnName, arg || {}],
    }));
    return out && out.result;
  } finally {
    await closeWorkTab(tab.id);
  }
}

function gcpProject(msg) {
  return /^[a-z0-9-]+$/.test(String(msg.project || "")) ? "?project=" + msg.project : "";
}

/**
 * 유튜브 시청 기록 수집 (백그라운드 탭)
 * 자동화 브라우저의 구글 로그인은 차단됨. 이 확장은 사용자 세션 안이라 무관
 * @param {number} rounds 미사용. 걸음 함수가 스스로 멈춤
 */
async function collectYoutubeHistory(rounds) {
  const r = await stepInTab("https://www.youtube.com/feed/history", "youtube-history.js", "ytStep");
  return (r && r.rows) || [];
}
/** X 핸들. 바꾸려면 storage 에 karmo.xHandle 로 넣는다 */
async function xHandle() {
  const v = (await chrome.storage.local.get("karmo.xHandle"))["karmo.xHandle"];
  return v || "Mascari4615";
}

/**
 * 팔로잉과 내가 만든 리스트 멤버를 한 표로
 * 남이 만든 리스트는 안 담는다 (사용자 2026-09-20)
 * @returns {Promise<{rows:Array<object>,notes:string[]}>}
 */
async function collectXAccounts() {
  const me = await xHandle();
  const merged = new Map();
  const add = (rows, kind) => {
    for (const r of rows || []) {
      const cur = merged.get(r.handle);
      if (cur) cur.kind = cur.kind.includes(kind) ? cur.kind : cur.kind + "," + kind;
      else merged.set(r.handle, { handle: r.handle, name: r.name, bio: r.bio, kind });
    }
  };

  const notes = [];
  // 화면 하나에 4분 상한. 없으면 한 갈래가 바퀴를 통째로 잡는다 (2026-09-21 실측)
  const pull = async (url, kind) => {
    let r = null;
    try {
      r = await within(240000, `pull:${kind}`, stepInTab(url, "x-accounts.js", "xStep"));
    } catch (e) {
      notes.push(`${kind} 시간 초과 ${e.message}`);
      return;
    }
    add(r && r.rows, kind);
    notes.push(kind + " " + ((r && r.rows) || []).length + " " + (r ? r.note : "no-response"));
  };

  await chrome.storage.local.set({ "karmo.progress": [] });
  await pull("https://x.com/" + me + "/following", "\ud314\ub85c\uc789");
  // X \uac00 \ubc30\uacbd \ud0ed\uc744 \ud648\uc73c\ub85c \ub418\ub3cc\ub9ac\ub294 \ud310\uc774 \uc11e\uc784. \uc138 \ubc88\uae4c\uc9c0 \ub2e4\uc2dc \uc5f0\ub2e4 (2026-09-21 \uc2e4\uce21)
  let lists = [];
  for (let try_ = 0; try_ < 3 && !lists.length; try_ += 1) {
    try {
      lists = (await runInTab("https://x.com/" + me + "/lists", "x-accounts.js", "collectXOwnedLists", "MAIN")) || [];
    } catch (e) {
      await note("lists-fail", `#${try_} ${e.message}`);
    }
    await note("lists", `#${try_} \ub0b4 \ub9ac\uc2a4\ud2b8 ${lists.length}\uac1c`);
  }
  for (const l of lists || []) {
    await pull("https://x.com/i/lists/" + l.id + "/members", l.name || l.id);
  }
  return { rows: [...merged.values()], notes };
}

/** bridge 탭 정리. 에이전트가 주소로 부를 때마다 사람 창에 탭이 하나씩 쌓였다 (2026-09-23, 7개에서 dev 서버 연결이 막힘) */
async function closeBridgeTabs(exceptId) {
  const tabs = await chrome.tabs.query({ url: ["http://127.0.0.1/*", "http://localhost/*"] });
  let n = 0;
  for (const t of tabs) {
    if (t.id === exceptId || !/\/apps\/karmo-dev-extension\/bridge\.html\?run=/.test(t.url || "")) continue;
    try { await chrome.tabs.remove(t.id); n += 1; } catch { /* 이미 닫힘 */ }
  }
  return n;
}

/** 웹페이지(허용 도메인) → 확장 */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  /* 주소로 부른 bridge 는 결과를 보낸 뒤 탭을 닫는다. bridge 가 closeAfter 를 붙인다 */
  if (msg && msg.closeAfter && sender && sender.tab) {
    const id = sender.tab.id;
    const orig = sendResponse;
    sendResponse = (x) => { orig(x); setTimeout(() => { chrome.tabs.remove(id).catch(() => {}); }, 4000); };
  }
  (async () => {
    try {
      if (msg?.type === "dash.inspect") {
        /* 사람 창의 dash 탭이 어떤 판을 싣고 있나. 읽기만. 탭을 바꾸거나 누르지 않는다 */
        const tabs = await chrome.tabs.query({ url: ["https://dash.mascari4615.com/*"] });
        const out = [];
        for (const t of tabs) {
          let page = null;
          try {
            [page] = await chrome.scripting.executeScript({
              target: { tabId: t.id },
              func: () => ({
                href: location.href,
                scripts: Array.from(document.scripts).map((s) => s.src).filter(Boolean),
                strip: Array.from(document.querySelectorAll(".myd-strip .myd-item .myd-label")).map((x) => x.textContent),
                title: (document.querySelector(".myd-title") || {}).textContent || "",
              }),
            });
          } catch (e) { page = { result: { error: String(e && e.message ? e.message : e) } }; }
          out.push({ id: t.id, url: t.url, active: t.active, discarded: t.discarded, page: page && page.result });
        }
        sendResponse({ ok: true, tabs: out });
        return;
      }
      if (msg?.type === "bridge.cleanup") {
        sendResponse({ ok: true, closed: await closeBridgeTabs(sender && sender.tab && sender.tab.id) });
        return;
      }
      if (msg?.type === "bookmarks.list") {
        sendResponse({ ok: true, items: await listBookmarks() });
      } else if (msg?.type === "bookmarks.remove") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        if (!ids.length) throw new Error("ids 가 비었다");
        const result = await removeBookmarks(ids);
        sendResponse({ ok: true, ...result, remaining: (await listBookmarks()).length });
      } else if (msg?.type === "bookmarks.listAll") {
        sendResponse({ ok: true, items: await listAll() });
      } else if (msg?.type === "bookmarks.removeTree") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        if (!ids.length) throw new Error("ids 가 비었다");
        sendResponse({ ok: true, ...(await removeTrees(ids)), remaining: (await listAll()).length });
      } else if (msg?.type === "bookmarks.pruneEmptyFolders") {
        const removed = await pruneEmptyFolders();
        sendResponse({ ok: true, removed, remaining: (await listAll()).length });
      } else if (msg?.type === "youtube.history") {
        const rows = await collectYoutubeHistory(msg.rounds);
        sendResponse({ ok: true, count: rows.length, rows });
      } else if (msg?.type === "ytmusic.history") {
        // \ubb34\uac70\uc6b4 \uc751\ub2f5\uc740 \uc720\uc2e4\ub41c\ub2e4. \ud30c\uc77c\ub85c
        (async () => {
          try {
            const r = await stepInTab("https://music.youtube.com/history", "ytmusic-history.js", "ytmStep");
            const out = await dumpTsv("ytmusic-history", (r && r.rows) || []);
            await chrome.storage.local.set({ "karmo.lastYtm": { at: new Date().toISOString(), file: out.file, count: out.count, note: r && r.note } });
          } catch (e) {
            await chrome.storage.local.set({ "karmo.lastYtm": { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) } });
          }
        })();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "ytmusic.playlists") {
        const r = await runInTab("https://music.youtube.com/library/playlists", "ytmusic-history.js", "ytmPlaylists", "MAIN");
        sendResponse({ ok: true, count: (r || []).length, rows: r });
      } else if (msg?.type === "ytmusic.playlist") {
        // 무거운 응답은 유실된다. 파일로
        (async () => {
          try {
            const url = "https://music.youtube.com/playlist?list=" + msg.list;
            const r = await stepInTab(url, "ytmusic-history.js", "ytmPlaylistStep", 200);
            const out = await dumpTsv("ytmusic-playlist", (r && r.rows) || []);
            await chrome.storage.local.set({ "karmo.lastPl": { at: new Date().toISOString(), list: msg.list, file: out.file, count: out.count, note: r && r.note } });
          } catch (e) {
            await chrome.storage.local.set({ "karmo.lastPl": { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) } });
          }
        })();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "youtube.playlist") {
        // \uc77c\ubc18 \uc720\ud29c\ube0c \ucabd\uc740 ytInitialData \uc640 browse \uc774\uc5b4\ubc1b\uae30\uac00 \uba39\ub294\ub2e4
        (async () => {
          try {
            const url = "https://www.youtube.com/playlist?list=" + msg.list;
            const r = await stepInTab(url, "youtube-history.js", "ytStep", 200);
            const out = await dumpTsv("youtube-playlist", (r && r.rows) || []);
            await chrome.storage.local.set({ "karmo.lastPl": { at: new Date().toISOString(), list: msg.list, file: out.file, count: out.count, note: r && r.note } });
          } catch (e) {
            await chrome.storage.local.set({ "karmo.lastPl": { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) } });
          }
        })();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "ytmusic.playlistLast") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get("karmo.lastPl"))["karmo.lastPl"] || null });
      } else if (msg?.type === "ytmusic.last") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get("karmo.lastYtm"))["karmo.lastYtm"] || null });
      } else if (msg?.type === "chzzk.follows") {
        const r = await runInTab("https://chzzk.naver.com/", "follows.js", "collectChzzkFollows");
        sendResponse({ ok: true, count: (r && r.rows || []).length, total: r && r.total, rows: r && r.rows });
      } else if (msg?.type === "soop.favorites") {
        const rows = await runInTab("https://www.sooplive.com/my/favorite", "follows.js", "collectSoopFavorites");
        sendResponse({ ok: true, count: (rows || []).length, rows });
      } else if (msg?.type === "x.accounts") {
        const r = await collectXAccounts();
        sendResponse({ ok: true, count: r.rows.length, notes: r.notes, rows: r.rows });
      } else if (msg?.type === "collect.all") {
        // 무거운 일의 응답은 유실된다 (2026-09-21 실측). 결과는 collect.status 로
        collectAll();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "x.one") {
        const r = await stepInTab(msg.url, "x-accounts.js", "xStep", msg.steps || 3);
        sendResponse({ ok: true, result: r });
      } else if (msg?.type === "x.dump") {
        // \ubb34\uac70\uc6b4 \uc751\ub2f5\uc740 \uc720\uc2e4\ub41c\ub2e4. \ud30c\uc77c\ub85c \ub5a8\uad74\uace0 \ud30c\uc77c\ub85c \ud655\uc778
        (async () => {
          try {
            const r = await collectXAccounts();
            const out = await dumpTsv("x-accounts", r.rows);
            await chrome.storage.local.set({ "karmo.lastX": { at: new Date().toISOString(), file: out.file, count: out.count, notes: r.notes } });
          } catch (e) {
            await chrome.storage.local.set({ "karmo.lastX": { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) } });
          }
        })();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "x.last") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get("karmo.lastX"))["karmo.lastX"] || null });
      } else if (msg?.type === "collect.forget") {
        // 알람 발화 측정용. 가드 비우기
        await chrome.storage.local.remove(STATE_KEY);
        sendResponse({ ok: true, forgot: true });
      } else if (msg?.type === "collect.progress") {
        sendResponse({ ok: true, lines: (await chrome.storage.local.get("karmo.progress"))["karmo.progress"] || [] });
      } else if (msg?.type === "collect.status") {
        let alarms = "\uc54c\ub78c API \uc5c6\uc74c";
        if (chrome.alarms) {
          try {
            const got = await within(5000, "alarms", chrome.alarms.getAll());
            alarms = got.map((a) => ({ name: a.name, every: a.periodInMinutes, next: new Date(a.scheduledTime).toISOString() }));
          } catch (e) {
            alarms = "\uc54c\ub78c \uc77d\uae30 \uc2e4\ud328 " + e.message;
          }
        }
        sendResponse({
          ok: true,
          last: (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || null,
          alarms,
        });
      } else if (msg?.type === "pinterest.related") {
        /* 무거운 일. 시작만 알리고 결과는 pinterest.last 로 (collect.all 과 같은 까닭) */
        /* 끝나면 notify (로컬 수신기) 로 결과를 밀어줌. 부르는 쪽이 bridge 탭을 되풀이해 열며 묻지 않게
           (사용자 2026-09-25 "포커스는 왜 자꾸 가져가", "정신없어") */
        const notify = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(String(msg.notify || "")) ? msg.notify : "";
        (async () => {
          let last;
          try {
            last = { at: new Date().toISOString(), result: await pinterestRelated(msg) };
          } catch (e) {
            last = { at: new Date().toISOString(), error: String(e && e.message ? e.message : e) };
          }
          await chrome.storage.local.set({ "karmo.lastPin": last });
          if (notify) {
            try { await fetch(notify, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(last) }); } catch { /* 수신기가 먼저 닫힘 */ }
          }
        })();
        sendResponse({ ok: true, started: true });
      } else if (msg?.type === "pinterest.last") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get("karmo.lastPin"))["karmo.lastPin"] || null });
      } else if (msg?.type === "gcp.last") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get("karmo.gcpLast"))["karmo.gcpLast"] || null });
      } else if (msg?.type === "gcp.secret") {
        if (!GCP_CLIENT_RE.test(String(msg.clientId || ""))) throw new Error("clientId 형식 아님");
        const url = "https://console.cloud.google.com/auth/clients/" + msg.clientId + gcpProject(msg);
        sendResponse({ ok: true, result: await gcpOnce(url, "gcpAddSecretStep", {}, "gcpHookSecret") });
      } else if (msg?.type === "gcp.read") {
        /* 읽기 전용. Google 인증 플랫폼의 정해진 화면만 */
        let page = "";
        if (["branding", "audience", "overview", "scopes"].includes(msg.page)) page = msg.page;
        else if (msg.page === "client" && GCP_CLIENT_RE.test(String(msg.clientId || ""))) page = "clients/" + msg.clientId;
        if (!page) throw new Error("모르는 화면: " + msg.page);
        const url = "https://console.cloud.google.com/auth/" + page + gcpProject(msg);
        sendResponse({ ok: true, result: await gcpOnce(url, "gcpReadStep") });
      } else if (msg?.type === "gcp.secretRow") {
        if (!GCP_CLIENT_RE.test(String(msg.clientId || ""))) throw new Error("clientId 형식 아님");
        const url = "https://console.cloud.google.com/auth/clients/" + msg.clientId + gcpProject(msg);
        sendResponse({ ok: true, result: await gcpOnce(url, "gcpSecretRowStep", { suffix: msg.suffix, action: msg.action }) });
      } else if (msg?.type === "gcp.branding") {
        /* 링크는 내 도메인만 */
        const okUrl = (u) => /^https:\/\/([a-z0-9-]+\.)?mascari4615\.com(\/[A-Za-z0-9\/_-]*)?$/.test(String(u || ""));
        if (!okUrl(msg.homepage) || !okUrl(msg.privacy)) throw new Error("허용 안 된 링크");
        const url = "https://console.cloud.google.com/auth/branding" + gcpProject(msg);
        sendResponse({ ok: true, result: await gcpOnce(url, "gcpBrandingStep", { homepage: msg.homepage, privacy: msg.privacy }) });
      } else if (msg?.type === "gcp.audience") {
        const url = "https://console.cloud.google.com/auth/audience" + gcpProject(msg);
        sendResponse({ ok: true, result: await gcpOnce(url, "gcpAudienceStep", { publish: !!msg.publish }) });
      } else if (msg?.type === "gcp.client") {
        sendResponse({ ok: true, result: await gcpClient(msg) });
      } else if (msg?.type === "ext.version") {
        const m = chrome.runtime.getManifest();
        sendResponse({ ok: true, version: m.version, name: m.name });
      } else if (msg?.type === "ext.reload") {
        // 언팩 확장은 reload 시 디스크에서 다시 읽는다 = 코드 갱신 반영.
        sendResponse({ ok: true, reloading: true });
        setTimeout(() => chrome.runtime.reload(), 50);
      } else {
        sendResponse({ ok: false, error: `모르는 type: ${msg?.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // 비동기 응답
});
