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

/**
 * 한 걸음씩 되부르기. MV3 워커는 30초 무활동이면 종료
 * 긴 await 하나면 응답이 영영 안 옴 (2026-09-21 15분 멈춤 실측)
 * @param {string} url 열 주소
 * @param {string} file 주입할 파일
 * @param {string} fnName done 을 돌려주는 걸음 함수
 * @param {number} [maxSteps] 걸음 상한
 */
async function stepInTab(url, file, fnName, maxSteps) {
  const tab = await chrome.tabs.create({ url, active: false });
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
    try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫혔으면 무시 */ }
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
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitLoaded(tab.id);
    const where = { target: { tabId: tab.id } };
    if (world) where.world = world;
    await chrome.scripting.executeScript({ ...where, files: [file] });
    const [out] = await chrome.scripting.executeScript({
      ...where,
      func: (n) => globalThis[n](),
      args: [fnName],
    });
    return out && out.result;
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫혔으면 무시 */ }
  }
}

/**
 * 유튜브 시청 기록 수집 (백그라운드 탭)
 * 자동화 브라우저의 구글 로그인은 차단됨. 이 확장은 사용자 세션 안이라 무관
 * @param {number} rounds 스크롤 시도 상한
 */
async function collectYoutubeHistory(rounds) {
  const tab = await chrome.tabs.create({ url: "https://www.youtube.com/feed/history", active: false });
  try {
    await new Promise((resolve) => {
      const done = (id, info) => {
        if (id === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(done);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(done);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 30000);
    });
    await new Promise((r) => setTimeout(r, 3000));

    const [out] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["youtube-history.js"],
    }).then(() => chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (n) => collectYoutubeHistory(n),
      args: [rounds || 200],
    }));
    return out && out.result ? out.result : [];
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫혔으면 무시 */ }
  }
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
  const pull = async (url, kind) => {
    const r = await stepInTab(url, "x-accounts.js", "xStep");
    add(r && r.rows, kind);
    notes.push(kind + " " + ((r && r.rows) || []).length + " " + (r ? r.note : "no-response"));
  };

  await chrome.storage.local.set({ "karmo.progress": [] });
  await pull("https://x.com/" + me + "/following", "\ud314\ub85c\uc789");
  const lists = await runInTab("https://x.com/" + me + "/lists", "x-accounts.js", "collectXOwnedLists", "MAIN");
  await note("lists", `\ub0b4 \ub9ac\uc2a4\ud2b8 ${(lists || []).length}\uac1c`);
  for (const l of lists || []) {
    await pull("https://x.com/i/lists/" + l.id + "/members", l.name || l.id);
  }
  return { rows: [...merged.values()], notes };
}

/** 웹페이지(허용 도메인) → 확장 */
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
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
        sendResponse({ ok: true, results: await collectAll() });
      } else if (msg?.type === "x.one") {
        const r = await stepInTab(msg.url, "x-accounts.js", "xStep", msg.steps || 3);
        sendResponse({ ok: true, result: r });
      } else if (msg?.type === "collect.progress") {
        sendResponse({ ok: true, lines: (await chrome.storage.local.get("karmo.progress"))["karmo.progress"] || [] });
      } else if (msg?.type === "collect.status") {
        sendResponse({ ok: true, last: (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || null });
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
