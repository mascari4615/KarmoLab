/**
 * 아카라이브 유저 차단과 좋아요. 유저 키: 사이트의 data-filter 값 (고정닉은 닉네임, 계정은 `닉#번호`)
 * 대상: 글 목록 줄 (a.vrow), 댓글 (.comment-item), 글 머리 (.article-head)
 * 숨긴 글은 footer 앞 블록에, 목록 줄은 복제해서 사이트 목록 모양 그대로
 * 목록 줄의 계정 유저: 번호가 없어 글을 열어 번호 확인 (resolveAccount)
 */

const squash = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

/* 계정 번호 확인. 목록 줄의 계정 닉은 겹침 (실측 2026-10-03: "ㅇㅇ" 차단에 4줄 동시 숨김)
 * 글 페이지의 글쓴이는 `닉#번호`. 그 글을 받아 읽고 글 번호 -> 키로 저장, 재요청 없음 */
const ID_CACHE = "karmoIdCache";
const CHANNEL_CACHE = "karmoChannelCache";
const VIRTUAL_CHANNELS = new Set(["breaking", "best", "all", "search", "headlines"]);
const channelCache = new Map();
const ID_CACHE_MAX = 6000;
const ID_RETRY_MS = 60000;
const idCache = new Map(); // "채널/글번호" -> 키
const idFailed = new Map(); // 같은 곳 -> 실패 시각
const idPending = new Set();
const idQueue = [];
let idRunning = 0;
let idLoaded = false;
let idSaveTimer = null;
let apiRef = null;

chrome.storage.local.get({ [ID_CACHE]: {}, [CHANNEL_CACHE]: {} }, (items) => {
  for (const [k, v] of Object.entries(items[ID_CACHE] || {})) idCache.set(k, v);
  for (const [k, v] of Object.entries(items[CHANNEL_CACHE] || {})) if (!VIRTUAL_CHANNELS.has(v)) channelCache.set(k, v);
  idLoaded = true;
  apiRef?.refresh();
});

function saveIdCache() {
  clearTimeout(idSaveTimer);
  idSaveTimer = setTimeout(() => {
    while (idCache.size > ID_CACHE_MAX) idCache.delete(idCache.keys().next().value);
    while (channelCache.size > ID_CACHE_MAX) channelCache.delete(channelCache.keys().next().value);
    chrome.storage.local.set({ [ID_CACHE]: Object.fromEntries(idCache), [CHANNEL_CACHE]: Object.fromEntries(channelCache) })
      .catch(() => apiRef?.setAutoStatus("원문 채널 캐시 저장 실패, 현재 탭의 확인 결과 유지"));
  }, 1500);
}

/* 글 페이지 HTML 에서 글쓴이 키 */
function postOf(href) {
  if (!href) return null;
  try {
    const url = new URL(href, location.href);
    if (!["arca.live", "namu.la"].includes(url.hostname)) return null;
    const match = /^\/b\/([^/]+)\/(\d+)\/?$/.exec(url.pathname);
    return match ? { channel: match[1], id: match[2], href: url.href } : null;
  } catch { return null; }
}

async function resolveOne(job) {
  try {
    const res = await fetch(job.href, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const key = doc.querySelector(".article-head .user-info [data-filter]")?.getAttribute("data-filter") || "";
    const canonical = postOf(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || doc.querySelector('meta[property="og:url"]')?.content || "");
    const requested = postOf(job.href);
    if (canonical && requested && canonical.id === requested.id && !VIRTUAL_CHANNELS.has(canonical.channel)) channelCache.set(canonical.id, canonical.channel);
    if (key.includes("#")) {
      idCache.set(job.id, key);
    }
    if (!key.includes("#") || !channelCache.has(requested?.id)) idFailed.set(job.id, Date.now());
    saveIdCache();
  } catch {
    idFailed.set(job.id, Date.now());
  }
  idPending.delete(job.id);
  apiRef?.refresh();
  for (const fn of resolvedListeners) fn();
}

function pumpIds() {
  while (idRunning < 2 && idQueue.length) {
    const job = idQueue.shift();
    idRunning += 1;
    resolveOne(job).finally(() => {
      idRunning -= 1;
      setTimeout(pumpIds, 150);
    });
  }
}

const idOfHref = (href) => {
  const m = /\/b\/([^/?#]+)\/(\d+)/.exec(href || "");
  return m ? `${m[1]}/${m[2]}` : null;
};

/** 글 주소로 본 글쓴이의 `닉#번호`. 아직 모르면 null 을 주고 (fetchIfMissing 이면) 글을 받으러 감 */
function resolveHref(href, settings, fetchIfMissing = true) {
  if (!settings.resolveAccounts || !idLoaded) return null;
  const id = idOfHref(href);
  if (!id) return null;
  const hit = idCache.get(id);
  if (hit) return hit;
  if (fetchIfMissing) queueArticle(href);
  return null;
}

function queueArticle(href, retry = false) {
  const id = idOfHref(href);
  if (!id || !idLoaded || idPending.has(id)) return;
  const failed = idFailed.get(id);
  if (!retry && failed && Date.now() - failed < ID_RETRY_MS) return;
  if (retry) idFailed.delete(id);
  idPending.add(id);
  idQueue.push({ id, href: new URL(href, location.href).href });
  pumpIds();
}

function sourceChannel(href, needsCanonical = false, ask = true) {
  const post = postOf(href);
  if (!post) return "";
  const cached = channelCache.get(post.id);
  if (cached) return cached;
  if (!needsCanonical && !VIRTUAL_CHANNELS.has(post.channel)) return post.channel;
  if (ask) queueArticle(href);
  return "";
}

/* 인사이트 모듈이 쓰는 입구. 대기 중인 확인 건수는 한 번에 몰리지 않게 조절하는 데 씀 */
globalThis.KarmoArca = {
  resolveHref,
  sourceChannel,
  pendingCount: () => idPending.size,
  onResolved: (fn) => resolvedListeners.push(fn),
};
const resolvedListeners = [];

/* 한 사람을 가리키는 키만 통과. 고정닉, 매니저, `닉#번호` (아이콘 없는 유동닉은 닉이 겹쳐 제외) */
function isUnique(el, key) {
  if (key.includes("#")) return true;
  const title = el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title");
  return !!title && title !== "계정";
}

const isAccount = (el) => el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title") === "계정";

/* 숨긴 줄을 아래 블록에 올릴 정보. 목록 줄은 kind post */
function summary(row, key, name) {
  if (row.matches("a.vrow")) {
    return { kind: "post", key, name, id: squash(row.querySelector(".col-id")?.textContent, 12), label: squash(row.querySelector(".title")?.textContent, 100), href: row.href };
  }
  const id = (row.id || "").replace(/^c_/, "");
  return { kind: "comment", key, name, label: "댓글: " + squash(row.querySelector(".message .text")?.textContent, 80), href: id ? `#c_${id}` : "" };
}

/* 제목의 키워드 판정. 걸린 키워드를 돌려줌, 없으면 빈 문자열 */
function keywordHit(row, list) {
  if (!list?.length) return "";
  const title = squash(row.querySelector(".title")?.textContent, 300).toLowerCase();
  for (const k of list) {
    try {
      if (k.startsWith("re:") ? new RegExp(k.slice(3), "i").test(title) : title.includes(k.toLowerCase())) return k;
    } catch {
      /* 깨진 정규식은 건너뜀 */
    }
  }
  return "";
}

/* 차단 유저의 목록 글을 보여줄 사유. 개념글 (제목 앞 별), 추천이 설정값 이상 */
function exemptReason(row, s) {
  if (s.exBest && row.querySelector(".title .bi-star-fill")) return "개념글";
  const rec = parseInt(row.querySelector(".col-rate")?.textContent, 10);
  if (s.minRec > 0 && rec >= s.minRec) return `추천 ${rec}`;
  return "";
}

function channelOf(row) {
  return sourceChannel(row.getAttribute("href"), !!row.querySelector(".badges .badge.text-bg-success"));
}

KarmoBlock.start({
  site: "arca",
  footer: "footer.footer",
  listBox: ".list-table",
  scan(root, api) {
    apiRef = api;
    if (api.ready) globalThis.KarmoInsight?.start(api);
    if (api.ready) globalThis.KarmoAutoBlock?.start(api);
    const channels = new Set(api.settings.blockedChannels || []);
    for (const row of root.querySelectorAll("a.vrow")) {
      if (row.closest(".karmo-blocked-block")) continue;
      const channel = channelOf(row);
      if (channel && channels.has(channel)) {
        api.hide(row, { ...summary(row, `channel:${channel}`, channel), channel, reason: "채널" });
      } else if (postOf(row.getAttribute("href"))) {
        const href = row.getAttribute("href");
        api.addChannelButton(row.querySelector(".user-info") || row.querySelector(".title") || row, channel, {
          pending: !idLoaded || idPending.has(idOfHref(href)),
          retry: () => { queueArticle(href, true); api.refresh(); },
        });
      }
    }
    for (const el of root.querySelectorAll(".user-info [data-filter]")) {
      let key = el.getAttribute("data-filter");
      if (!key || el.closest(".karmo-blocked-block")) continue;
      const row = el.closest("a.vrow, .comment-item");
      const channelHidden = row?.matches("a.vrow") && channels.has(channelOf(row));
      if (channelHidden && !api.settings.autoBlockChannels?.length) continue;
      // 키워드 숨김은 글쓴이 확인보다 먼저 (번호 확인 전에도 적용)
      const kw = !channelHidden && row?.matches("a.vrow") && !row.classList.contains("notice") ? keywordHit(row, api.settings.keywords) : "";
      if (kw) {
        api.hide(row, { ...summary(row, `kw:${kw}`, `키워드 ${kw}`), keyword: kw, reason: "키워드" });
      }
      // 목록 줄의 계정 유저: 글을 열어 확인한 `닉#번호` 로 바꿔 쓴다 (공지 줄은 대상 아님)
      if (row?.matches("a.vrow") && !row.classList.contains("notice") && !key.includes("#") && isAccount(el)) {
        key = resolveHref(row.getAttribute("href"), { ...api.settings, resolveAccounts: api.settings.resolveAccounts || !!api.settings.autoBlockChannels?.length });
        if (!key) continue;
      }
      if (!isUnique(el, key)) continue;
      const name = el.textContent.trim() || key;
      if (row?.matches("a.vrow")) globalThis.KarmoAutoBlock?.inspect({ key, name, channel: channelOf(row) });
      if (channelHidden || kw) continue;
      const blocked = api.isBlocked(key);
      if (row && blocked) {
        // 일반 차단의 목록 글만 예외 판정. 2단계는 개념글과 추천수 예외도 숨김
        const why = row.matches("a.vrow") && !api.blocked[key]?.hideAll ? exemptReason(row, api.settings) : "";
        if (!why) {
          api.hide(row, summary(row, key, name));
          continue;
        }
        api.exempt(row, row.querySelector(".badges") || el, why);
      }
      // 글 머리 글쓴이: 열어 본 글이므로 숨기지 않고 차단됨 표시만
      if (el.closest(".article-head") && blocked) api.exempt(el.closest(".article-head"), el, "열어 본 글");
      // 공지 줄은 이어 보이기에서 뺀다 (매니저 공지 여러 줄이 항상 묶임)
      if (row && !row.classList.contains("notice")) api.tag(row, key, el);
      api.addButtons(el.closest(".user-info"), key, name);
    }
  },
});
