/**
 * 아카라이브 인사이트: 왼쪽 패널에 세 구역을 더함
 *   좋아요 유저 최근 글: 새 글 (읽음 구분선 이후) 에 "새" 표시
 *   최근 작성량: 최근 몇 쪽에서 글을 자주 쓴 유저, 바로 좋아요 또는 차단
 *   취향 제안: 많이 보였는데 열어 본 적 없는 유저는 차단 후보, 자주 여는 유저는 좋아요 후보
 * 자료: 현재 쪽 + 같은 보기의 앞쪽들을 가져와 읽음 (TTL 10분, 확장이 글 목록 페이지를 직접 받음)
 * 저장: karmoScan (가져온 글 줄), karmoStats (유저별 본 글 수와 연 글 수, 본 글 번호와 연 글 번호)
 * 유저 키는 block-core 와 같은 data-filter 값, 목록 줄의 계정은 arca-block.js 가 글을 열어 확인한 번호
 */
(() => {
  const SCAN = "karmoScan";
  const STATS = "karmoStats";
  const TTL_MS = 10 * 60 * 1000;
  const MAX_VIEWS = 20;
  const MAX_IDS = 6000;
  const MAX_USERS = 3000;
  const MAX_FRESH_RESOLVE = 40;
  const MIN_OPENED_TOTAL = 15;

  let api = null;
  let started = false;
  let rows = [];
  let liveRows = [];
  let stats = { users: {}, seen: [], opened: [] };
  let seenSet = new Set();
  let openedSet = new Set();
  let saveTimer = null;
  let pagesRead = 0;

  const squash = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function saveStats() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      stats.seen = stats.seen.slice(-MAX_IDS);
      stats.opened = stats.opened.slice(-MAX_IDS);
      const names = Object.keys(stats.users);
      if (names.length > MAX_USERS) {
        names.sort((a, b) => stats.users[a].seen - stats.users[b].seen);
        for (const k of names.slice(0, names.length - MAX_USERS)) delete stats.users[k];
      }
      chrome.storage.local.set({ [STATS]: stats });
    }, 3000);
  }

  /* 글 줄 한 개에서 필요한 값. kind: fixed (고정닉, 매니저), account (계정), other (유동 등) */
  function parseRow(row) {
    const id = parseInt(row.querySelector(".col-id")?.textContent, 10);
    const el = row.querySelector(".user-info [data-filter]");
    if (!Number.isFinite(id) || !el) return null;
    const filter = el.getAttribute("data-filter") || "";
    const icon = el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title") || "";
    let kind = "other";
    if (filter.includes("#")) kind = "hash";
    else if (icon === "계정") kind = "account";
    else if (icon) kind = "fixed";
    return {
      id,
      href: row.getAttribute("href") || "",
      title: squash(row.querySelector(".title")?.textContent, 80),
      nick: squash(el.textContent, 30) || filter,
      filter,
      kind,
      time: row.querySelector(".col-time time")?.getAttribute("datetime") || "",
    };
  }

  const parseDoc = (root) => [...root.querySelectorAll(".list-table a.vrow:not(.notice):not(.head)")].map(parseRow).filter(Boolean);

  /* 유저 키. 계정은 글을 열어 확인한 값, 아직 모르면 null */
  function keyOf(r, ask) {
    if (r.kind === "hash" || r.kind === "fixed") return r.filter;
    if (r.kind === "account") return globalThis.KarmoArca.resolveHref(r.href, api.settings, ask);
    return null;
  }

  const viewOf = () => {
    const m = /^\/b\/([^/]+)\/?$/.exec(location.pathname);
    if (!m) return null;
    const params = new URLSearchParams(location.search);
    const page = Number(params.get("p") || 1);
    params.delete("p");
    return { slug: m[1], page, query: params.toString(), view: `${m[1]}?${params}` };
  };

  async function fetchPages(v, pages) {
    const out = [];
    for (let i = 1; i <= pages; i += 1) {
      if (i === v.page) continue;
      const q = new URLSearchParams(v.query);
      q.set("p", String(i));
      try {
        const res = await fetch(`${location.origin}/b/${v.slug}?${q}`, { credentials: "include" });
        if (!res.ok) break;
        out.push(...parseDoc(new DOMParser().parseFromString(await res.text(), "text/html")));
        pagesRead += 1;
      } catch {
        break;
      }
      await sleep(300);
    }
    return out;
  }

  /* 본 글 수 갱신. 사용자 화면에 실제로 뜬 글 (현재 쪽) 만, 키를 아는 글만, 글 번호로 중복 제거.
   * 가져온 앞쪽 글은 볼 기회가 없었으므로 세지 않음 (세면 첫 스캔 직후 모두 차단 후보로 뜸) */
  function countSeen(slug) {
    let changed = false;
    for (const r of liveRows) {
      const key = keyOf(r, false);
      const tag = `${slug}:${r.id}`;
      if (!key || seenSet.has(tag)) continue;
      seenSet.add(tag);
      stats.seen.push(tag);
      const u = (stats.users[key] ||= { name: r.nick, seen: 0, opened: 0 });
      u.seen += 1;
      u.name = r.nick;
      changed = true;
    }
    if (changed) saveStats();
  }

  const abs = (href) => new URL(href, location.href).href;

  function compute() {
    if (!api || !api.settings.insight) return api?.setSections([]);
    const likes = api.likes;
    const blocked = api.blocked;
    const keyed = rows.map((r) => ({ ...r, key: keyOf(r, false) })).filter((r) => r.key);
    const base = globalThis.KarmoSeen?.base ?? null;
    const sections = [];

    const liked = keyed.filter((r) => likes[r.key]).sort((a, b) => b.id - a.id).slice(0, 10);
    sections.push({
      id: "liked",
      title: `좋아요 유저 최근 글 (${liked.length})`,
      items: liked.map((r) => ({
        label: `${r.nick}: ${r.title}`,
        href: abs(r.href),
        tag: base != null && r.id > base ? "새" : "",
      })),
    });

    const byKey = new Map();
    for (const r of keyed) byKey.set(r.key, { n: (byKey.get(r.key)?.n || 0) + 1, name: r.nick });
    const top = [...byKey].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    sections.push({
      id: "top",
      title: `최근 ${Math.max(pagesRead + 1, 1)}쪽 작성량`,
      items: top.map(([key, v]) => ({
        label: (likes[key] ? "♥ " : "") + v.name,
        tag: `${v.n}건`,
        actions: [
          ...(likes[key] ? [] : [{ text: "♥", title: "좋아요", fn: () => api.like(key, v.name) }]),
          ...(blocked[key] ? [] : [{ text: "×", title: "차단", fn: () => api.block(key, v.name) }]),
        ],
      })),
    });

    const minSeen = api.settings.candSeen;
    const cand = Object.entries(stats.users).filter(([k]) => !likes[k] && !blocked[k]);
    // 열람 기록이 적으면 차단 후보를 내지 않음 (안 연 것이 취향인지 아직 못 가림)
    const totalOpened = Object.values(stats.users).reduce((n, u) => n + u.opened, 0);
    const bad = (totalOpened < MIN_OPENED_TOTAL ? [] : cand)
      .filter(([, u]) => u.seen >= minSeen && u.opened / u.seen <= 0.1)
      .sort((a, b) => b[1].seen - a[1].seen)
      .slice(0, 5);
    const good = cand
      .filter(([, u]) => u.opened >= 3 && u.opened / u.seen >= 0.4)
      .sort((a, b) => b[1].opened - a[1].opened)
      .slice(0, 5);
    sections.push({
      id: "bad",
      title: "차단 후보 (많이 봤는데 안 연 유저)",
      items: bad.map(([key, u]) => ({
        label: u.name,
        tag: `${u.seen}건 중 ${u.opened}`,
        tagClass: "bad",
        actions: [{ text: "×", title: "차단", fn: () => api.block(key, u.name) }],
      })),
    });
    sections.push({
      id: "good",
      title: "좋아요 후보 (자주 여는 유저)",
      items: good.map(([key, u]) => ({
        label: u.name,
        tag: `${u.seen}건 중 ${u.opened}`,
        tagClass: "good",
        actions: [{ text: "♥", title: "좋아요", fn: () => api.like(key, u.name) }],
      })),
    });
    api.setSections(sections);
  }

  async function runList(v) {
    const scanKey = SCAN;
    const got = await chrome.storage.local.get({ [scanKey]: {} });
    const all = got[scanKey] || {};
    const cached = all[v.view];
    const live = parseDoc(document);
    liveRows = live;
    const pages = Math.max(1, api.settings.scanPages);
    let older = [];
    if (cached && Date.now() - cached.at < TTL_MS) {
      older = cached.rows;
      pagesRead = cached.pages || 0;
    } else if (pages > 1) {
      older = await fetchPages(v, pages);
      const keep = Object.entries({ ...all, [v.view]: { at: Date.now(), pages: pagesRead, rows: older } }).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_VIEWS);
      chrome.storage.local.set({ [scanKey]: Object.fromEntries(keep) });
    }
    const byId = new Map();
    for (const r of [...older, ...live]) byId.set(r.id, r);
    rows = [...byId.values()].sort((a, b) => b.id - a.id);
    // 키를 모르는 계정 글은 한 번에 일부만 확인 요청 (나머지는 다음 방문)
    let asked = 0;
    for (const r of rows) {
      if (r.kind !== "account" || asked >= MAX_FRESH_RESOLVE || globalThis.KarmoArca.pendingCount() >= MAX_FRESH_RESOLVE) continue;
      if (!keyOf(r, true)) asked += 1;
    }
    countSeen(v.slug);
    compute();
  }

  /* 글 페이지: 연 글 기록. 글쓴이 키가 확실한 경우만 */
  function runArticle() {
    const m = /^\/b\/([^/]+)\/(\d+)/.exec(location.pathname);
    const el = document.querySelector(".article-head .user-info [data-filter]");
    if (!m || !el) return;
    const filter = el.getAttribute("data-filter") || "";
    const icon = el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title") || "";
    if (!filter.includes("#") && (!icon || icon === "계정")) return;
    const tag = `${m[1]}:${m[2]}`;
    if (openedSet.has(tag)) return;
    openedSet.add(tag);
    stats.opened.push(tag);
    const u = (stats.users[filter] ||= { name: squash(el.textContent, 30) || filter, seen: 0, opened: 0 });
    u.opened += 1;
    if (!seenSet.has(tag)) {
      seenSet.add(tag);
      stats.seen.push(tag);
      u.seen += 1;
    }
    saveStats();
  }

  async function start(a) {
    if (started) return;
    started = true;
    api = a;
    const got = await chrome.storage.local.get({ [STATS]: stats });
    stats = { users: {}, seen: [], opened: [], ...(got[STATS] || {}) };
    seenSet = new Set(stats.seen);
    openedSet = new Set(stats.opened);
    api.subscribe(compute);
    globalThis.KarmoArca.onResolved(() => {
      countSeen(viewOf()?.slug || "");
      compute();
    });
    document.addEventListener("karmo-seen", compute);
    if (!api.settings.insight) return;
    const v = viewOf();
    if (v && document.querySelector(".list-table a.vrow")) await runList(v);
    else runArticle();
  }

  globalThis.KarmoInsight = { start };
})();
