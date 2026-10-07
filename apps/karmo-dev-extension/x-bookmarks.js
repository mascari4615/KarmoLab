/**
 * X 북마크 읽기와 해제. background 가 MAIN world 에 주입. 요청 본뜨기는 x-hook.js
 *
 * 읽기: 화면이 보낸 Bookmarks GraphQL 을 커서로 이어받기 (x-accounts.js 와 같은 결)
 * 해제: DeleteBookmark mutation. queryId 는 화면 스크립트에서 찾음 (바뀌어도 버팀)
 * 봇 감지 대비 (사용자 요구, skill bookmarks A-2): 해제는 한 건씩 1~2.5초 간격 (사용자 2026-10-08 "너무 보수적"), 한 번에 상한은 부르는 쪽
 * 정본: memo/systems/karmo-dev-extension.md
 */

function xbState() {
  if (!globalThis.__karmoXb) {
    globalThis.__karmoXb = { rows: new Map(), seenCursor: new Set(), cursor: null, phase: "init", rounds: 0, note: "" };
  }
  return globalThis.__karmoXb;
}

function xbTemplate() {
  const cap = globalThis.__karmoCap;
  return cap && cap.byOp && cap.byOp.Bookmarks;
}

function xbText(t) {
  const note = t.note_tweet && t.note_tweet.note_tweet_results && t.note_tweet.note_tweet_results.result;
  return String((note && note.text) || (t.legacy && t.legacy.full_text) || "").replace(/\s+/g, " ").trim();
}

/** 응답에서 트윗만. tweet_results 안의 rest_id, 작성자, 본문, 링크 */
function xbHarvest(node, rows, cursors, depth) {
  if (!node || typeof node !== "object" || depth > 40) return;
  if (Array.isArray(node)) { for (const x of node) xbHarvest(x, rows, cursors, depth + 1); return; }
  if (node.tweet_results && node.tweet_results.result) {
    let t = node.tweet_results.result;
    if (t.tweet) t = t.tweet; // TweetWithVisibilityResults
    const user = t.core && t.core.user_results && t.core.user_results.result;
    const handle = (user && ((user.core && user.core.screen_name) || (user.legacy && user.legacy.screen_name))) || "";
    if (t.rest_id && !rows.has(t.rest_id)) {
      const urls = ((t.legacy && t.legacy.entities && t.legacy.entities.urls) || []).map((u) => u.expanded_url).filter(Boolean);
      rows.set(t.rest_id, { id: t.rest_id, handle, text: xbText(t), at: (t.legacy && t.legacy.created_at) || "", urls });
    }
  }
  if (node.cursorType === "Bottom" && node.value) cursors.push(node.value);
  for (const k of Object.keys(node)) xbHarvest(node[k], rows, cursors, depth + 1);
}

function xbSnap(S) {
  return { count: S.rows.size, rounds: S.rounds, note: S.note, done: S.phase !== "page", rows: [...S.rows.values()] };
}

/** 한 걸음. 워커가 done 까지 되부름 */
async function xbStep() {
  const S = xbState();
  if (S.phase === "init") {
    for (let i = 0; i < 12 && !xbTemplate(); i += 1) await new Promise((r) => setTimeout(r, 1500));
    S.phase = xbTemplate() ? "page" : "stop";
    S.note = S.phase === "page" ? "ok" : "Bookmarks 요청 본뜨기 실패";
    return xbSnap(S);
  }
  if (S.phase !== "page") return xbSnap(S);
  const tpl = xbTemplate();
  const u = new URL(tpl.url);
  const vars = JSON.parse(u.searchParams.get("variables") || "{}");
  if (S.cursor) vars.cursor = S.cursor; else delete vars.cursor;
  vars.count = 50;
  u.searchParams.set("variables", JSON.stringify(vars));
  // 이어받기 사이 1.5~3초. 한꺼번에 몰지 않음
  if (S.rounds > 0) await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  const res = await fetch(u.toString(), { headers: tpl.headers, credentials: "include" });
  S.rounds += 1;
  if (!res.ok) { S.phase = "stop"; S.note = `응답 ${res.status}`; return xbSnap(S); }
  const cursors = [];
  const before = S.rows.size;
  xbHarvest(await res.json(), S.rows, cursors, 0);
  const next = cursors.find((c) => !S.seenCursor.has(c));
  if (!next || S.rows.size === before || S.rounds >= 80) { S.phase = "stop"; return xbSnap(S); }
  S.seenCursor.add(next);
  S.cursor = next;
  return xbSnap(S);
}

/** 화면 스크립트에서 DeleteBookmark 의 queryId */
async function xbDeleteQueryId() {
  if (globalThis.__karmoXbDelQ) return globalThis.__karmoXbDelQ;
  const srcs = [...document.scripts].map((s) => s.src).filter((s) => /abs\.twimg\.com\/responsive-web\/client-web/.test(s));
  for (const src of srcs) {
    try {
      const js = await (await fetch(src)).text();
      const m = js.match(/queryId:"([\w-]+)",operationName:"DeleteBookmark"/);
      if (m) { globalThis.__karmoXbDelQ = m[1]; return m[1]; }
    } catch { /* 다음 파일 */ }
  }
  return null;
}

/**
 * 한 건씩 해제, 1~2.5초 간격
 * @param {string[]} ids
 */
async function xbRemove(ids) {
  const tpl = xbTemplate() || (globalThis.__karmoCap && globalThis.__karmoCap.last);
  if (!tpl) throw new Error("요청 본뜨기 실패");
  const qid = await xbDeleteQueryId();
  if (!qid) throw new Error("DeleteBookmark queryId 못 찾음");
  const done = [];
  const failed = [];
  const headers = { ...tpl.headers, "content-type": "application/json" };
  for (const id of ids) {
    const res = await fetch(`https://x.com/i/api/graphql/${qid}/DeleteBookmark`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ variables: { tweet_id: id }, queryId: qid }),
    });
    const j = await res.json().catch(() => null);
    const ok = res.ok && j && j.data && j.data.tweet_bookmark_delete === "Done";
    if (ok) done.push(id); else failed.push({ id, why: `응답 ${res.status} ${j && j.errors ? JSON.stringify(j.errors).slice(0, 120) : ""}` });
    if (res.status === 429) break;
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500));
  }
  return { done, failed };
}

// background 의 이름 호출용 전역 등록
globalThis.xbStep = xbStep;
globalThis.xbRemove = xbRemove;
