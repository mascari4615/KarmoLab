import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../karmolab/package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const root = new URL("../", import.meta.url);
const source = (file) => fs.readFileSync(new URL(file, root), "utf8");
const row = (channel, id, title = "제목") => `<div class="user-recent"><div class="col-title"><a href="/b/${channel}"><span class="category-badge">${channel} 채널</span></a><a href="/b/${channel}/${id}">${title}<small>[3]</small></a></div><time datetime="2026-10-14T01:00:00Z"></time></div>`;
const profile = `<div class="user-body"><h5>최근 작성글</h5>${row("one", 10)}${row("two", 11)}<h5>최근 작성 댓글</h5>${row("one", 12)}</div>`;
function dom(html = profile) {
  const d = new JSDOM(html, { runScripts: "outside-only", url: "https://arca.live/u/@test" });
  d.window.eval(source("arca-profile.js"));
  return d;
}

test("작성자 프로필: 여러 채널 병합, 댓글 제외", () => {
  const d = dom();
  const rows = d.window.KarmoProfile.parse(d.window.document, "test#123");
  assert.deepEqual(Array.from(rows, (r) => [r.channel, r.id, r.title, r.key]), [["one", 10, "제목", "test#123"], ["two", 11, "제목", "test#123"]]);
  d.window.close();
});

test("작성자 번호와 URL 인코딩 보존, 중복 닉 별도 주소", () => {
  const d = dom();
  const api = d.window.KarmoProfile;
  assert.equal(api.profileUrl("ㅇㅇ#42"), "https://arca.live/u/@%E3%85%87%E3%85%87/42");
  assert.notEqual(api.profileUrl("ㅇㅇ#42"), api.profileUrl("ㅇㅇ#43"));
  assert.equal(api.profileUrl("a/b"), "https://arca.live/u/@a%2Fb");
  d.window.close();
});

test("접근 실패와 공개 글 없음 구분, 외부 링크 제외", () => {
  const missing = dom("<h1>접근 제한</h1>");
  assert.throws(() => missing.window.KarmoProfile.parse(missing.window.document, "a"), /읽을 수 없습니다/);
  const empty = dom('<div class="user-body"><h5>최근 작성글</h5><p>없음</p><h5>최근 작성 댓글</h5></div>');
  assert.equal(empty.window.KarmoProfile.parse(empty.window.document, "a").length, 0);
  const external = dom(profile.replace('/b/one/10', 'https://evil.test/b/one/10'));
  assert.equal(external.window.KarmoProfile.parse(external.window.document, "a").length, 1);
  for (const d of [missing, empty, external]) d.window.close();
});

test("합친 목록: 최신순, 중복 제거, 좋아요 해제 즉시 제외", () => {
  const d = dom();
  const rows = d.window.KarmoProfile.parse(d.window.document, "a");
  const profiles = { a: { rows }, b: { rows: [{ ...rows[0], href: "https://arca.live/b/three/100", id: 100, time: "2026-10-15T01:00:00Z" }] } };
  const likes = { a: {}, b: {} };
  const merged = d.window.KarmoProfile.merge(profiles, likes);
  assert.equal(merged[0].channel, "one");
  assert.equal(merged[0].id, 100);
  delete likes.b;
  assert.equal(d.window.KarmoProfile.merge(profiles, likes).length, 2);
  profiles.a.rows.push(rows[0]);
  assert.equal(d.window.KarmoProfile.merge(profiles, likes).length, 2);
  d.window.close();
});

async function ui({ cache = {}, fail = false, saveFail = false, likes = { a: { name: "작성자" } } } = {}) {
  const d = dom(source("arca-liked.html"));
  let listener;
  d.window.chrome = {
    runtime: { sendMessage: async () => fail ? { ok: false, error: "HTTP 403" } : { ok: true, at: Date.now(), rows: [{ key: "a", id: 10, title: "실제 <script> 문자열", channel: "one", channelName: "채널", href: "https://arca.live/b/one/10", time: "2026-10-14T01:00:00Z" }] } },
    storage: {
      local: { get: async () => ({ likelist: { arca: likes }, karmoLikedProfiles: cache }), set: async () => { if (saveFail) throw new Error("disk full"); } },
      onChanged: { addListener: (fn) => { listener = fn; } },
    },
  };
  d.window.eval(source("arca-liked.js"));
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  return { d, change: listener };
}

test("화면: 실제 글 제목 안전 출력, 검색, 좋아요 해제, 갱신 날짜", async () => {
  const { d, change } = await ui();
  const doc = d.window.document;
  assert.equal(doc.querySelectorAll("#posts li").length, 1);
  assert.match(doc.querySelector(".post-title").textContent, /<script>/);
  assert.doesNotMatch(doc.getElementById("count").textContent, /날짜 정보 없음/);
  doc.querySelector(".post-title").focus();
  change({ likelist: { newValue: { arca: { a: { name: "작성자" } } } } }, "local");
  assert.equal(doc.activeElement.className, "post-title");
  assert.equal(doc.activeElement.getAttribute("href"), "https://arca.live/b/one/10");
  doc.getElementById("search").value = "없는제목";
  doc.getElementById("search").dispatchEvent(new d.window.Event("input"));
  assert.equal(doc.querySelectorAll("#posts li").length, 0);
  assert.match(doc.getElementById("emptyTitle").textContent, /조건/);
  change({ likelist: { newValue: { arca: {} } } }, "local");
  assert.match(doc.getElementById("emptyTitle").textContent, /아직 팔로우/);
  d.window.close();
});

test("화면: 수집 실패에 이전 글 유지, 저장 실패 은폐 없음", async () => {
  const old = { a: { at: 1, rows: [{ key: "a", title: "이전 글", id: 1, href: "https://arca.live/b/one/1", channelName: "채널", time: "2020-01-01" }] } };
  const failed = await ui({ cache: old, fail: true });
  assert.match(failed.d.window.document.getElementById("failures").textContent, /HTTP 403.*이전 글 유지/);
  assert.equal(failed.d.window.document.querySelectorAll("#posts li").length, 1);
  const saving = await ui({ saveFail: true });
  assert.match(saving.d.window.document.getElementById("status").textContent, /저장 실패.*disk full/);
  assert.equal(saving.d.window.document.getElementById("refresh").disabled, false);
  failed.d.window.close();
  saving.d.window.close();
});

test("실제 background 분기: 좋아요 키 검증, 성공과 실패 모두 탭 정리", async () => {
  const code = source("background.js");
  let removed = 0;
  let created = 0;
  let reject = false;
  const ctx = {
    URL, Date, setTimeout,
    chrome: {
      storage: { local: { get: async () => ({ likelist: { arca: { "a#42": {} } } }) } },
      scripting: { executeScript: async (o) => { if (o.files) return []; if (reject) throw new Error("アクセス失敗"); return [{ result: [] }]; } },
    },
    openWorkTab: async (url) => { created++; assert.equal(url, "https://arca.live/u/@a/42"); return { id: 1 }; },
    closeWorkTab: async () => { removed++; },
    waitReady: async () => {},
    within: async (_, __, promise) => promise,
  };
  vm.createContext(ctx);
  vm.runInContext(code.slice(code.indexOf("function dispatchExt(")), ctx);
  const call = (key) => new Promise((resolve) => ctx.dispatchExt({ type: "arca.liked.read", key }, {}, resolve));
  assert.equal((await call("other")).ok, false);
  assert.equal(created, 0);
  assert.equal((await call("a#42")).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(removed, 1);
  reject = true;
  assert.equal((await call("a#42")).ok, false);
  assert.equal(removed, 2);
});

test("동시 수집 탭: 등록과 해제 직렬화, 저장 실패 시 탭 회수", async () => {
  let ids = [];
  let seq = 0;
  let failSave = false;
  const removed = [];
  const ctx = { chrome: {
    tabs: { create: async () => ({ id: ++seq }), remove: async (id) => removed.push(id) },
    storage: { local: {
      get: async () => { const snapshot = [...ids]; await new Promise((resolve) => setTimeout(resolve, 5)); return { "karmo.openTabs": snapshot }; },
      set: async (data) => { if (failSave) throw new Error("quota"); ids = [...data["karmo.openTabs"]]; },
    } },
  } };
  vm.createContext(ctx);
  const code = source("background.js");
  vm.runInContext(code.slice(code.indexOf('const OPEN_TABS_KEY'), code.indexOf('/** 워커가 다시 뜰')), ctx);
  await Promise.all([ctx.openWorkTab("a"), ctx.openWorkTab("b")]);
  assert.deepEqual(ids, [1, 2]);
  await Promise.all([ctx.closeWorkTab(1), ctx.openWorkTab("c")]);
  assert.deepEqual(ids, [2, 3]);
  await ctx.closeWorkTab(2);
  await ctx.closeWorkTab(3);
  assert.deepEqual(ids, []);
  failSave = true;
  await assert.rejects(ctx.openWorkTab("d"), /quota/);
  assert.deepEqual(removed, [1, 2, 3, 4]);
});
