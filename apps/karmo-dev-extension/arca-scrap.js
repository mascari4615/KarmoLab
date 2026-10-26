/* 스크랩함의 글 번호로 게시판 표시. 제목과 본문 저장 제외, 사이트 스크랩 변경 호출 제외 */
(() => {
  const STORE = "karmoScraps";
  const CHANGED = "karmoScrapChanged";
  const TTL = 5 * 60 * 1000;
  const MAX_PAGES = 200;
  const accountOf = (root) => {
    if (!root.querySelector(".user-menu-link.loggedin")) return null;
    return root.querySelector(".user-menu-parent .user-info .username a[href]")?.getAttribute("href")
      || root.querySelector(".user-menu-link.loggedin .username")?.textContent.trim() || null;
  };
  const account = accountOf(document);
  const invalidate = () => chrome.storage.local.set({ [CHANGED]: { account, at: Date.now() } });
  const result = document.querySelector("#scrapForm .result");
  if (account && result) {
    new MutationObserver(invalidate).observe(result, { childList: true, characterData: true, subtree: true });
  }
  if (location.pathname === "/u/scrap_list") {
    if (account) invalidate();
    return;
  }
  const table = document.querySelector(".list-table");
  if (!table || !/^\/b\/[^/]+\/?$/.test(location.pathname)) return;
  const tagOf = (href) => {
    const url = new URL(href, location.origin);
    const match = /^\/b\/([^/]+)\/(\d+)\/?$/.exec(url.pathname);
    return url.origin === location.origin && match ? `${match[1]}:${match[2]}` : null;
  };
  const rows = [...table.querySelectorAll("a.vrow:not(.head)")]
    .map((row) => ({ row, tag: tagOf(row.getAttribute("href")) }))
    .filter((item) => item.tag && item.row.querySelector(".title"));
  if (!rows.length) return;
  const style = document.createElement("style");
  style.textContent = `
    .karmo-scrap-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; font: 12px/1.5 system-ui, sans-serif; }
    .karmo-scrap-tools button { cursor: pointer; font: inherit; color: inherit; background: transparent; border: 1px solid #888; border-radius: 3px; padding: 2px 7px; }
    .karmo-scrap-label { display: inline-block; flex: none; margin-right: 5px; padding: 0 4px; border: 1px solid #888; border-radius: 3px; font: 11px/1.5 system-ui, sans-serif; color: #777; vertical-align: middle; }
    .karmo-scrap-label.is-saved { color: #146c43; border-color: #198754; background: #e8f5ed; }
  `;
  document.documentElement.append(style);
  const tools = document.createElement("div");
  tools.className = "karmo-scrap-tools";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "스크랩 다시 확인";
  tools.append(status, retry);
  table.before(tools);
  if (!account) {
    status.textContent = "스크랩 표시: 로그인 필요";
    retry.hidden = true;
    return;
  }
  function paint(cache) {
    status.removeAttribute("title");
    const ids = new Set(cache.ids);
    let savedCount = 0;
    for (const { row, tag } of rows) {
      const title = row.querySelector(".title");
      let label = title.querySelector(".karmo-scrap-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "karmo-scrap-label";
        title.prepend(label);
      }
      const saved = ids.has(tag);
      label.classList.toggle("is-saved", saved);
      label.textContent = saved ? "스크랩" : "미스크랩";
      label.title = `스크랩함 확인: ${new Date(cache.at).toLocaleString()}`;
      if (saved) savedCount++;
    }
    status.textContent = `이 페이지 스크랩 ${savedCount}개`;
  }
  async function fetchAll() {
    const startedAt = Date.now();
    const ids = new Set();
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page++) {
      status.textContent = `스크랩 확인 중 (${page}쪽)`;
      const url = new URL("/u/scrap_list", location.origin);
      url.searchParams.set("p", String(page));
      const response = await fetch(url.href, { credentials: "include", signal: AbortSignal.timeout(15000) });
      if (!response.ok || new URL(response.url || url).pathname !== "/u/scrap_list") throw new Error("스크랩함 응답 확인 실패");
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      if (accountOf(doc) !== account) throw new Error("로그인 계정 확인 필요");
      const list = doc.querySelector(".scrap-list .list-table");
      if (!list) throw new Error("스크랩 목록 구조 확인 실패");
      const links = [...list.querySelectorAll("a.vrow[href]")].map((el) => tagOf(el.getAttribute("href"))).filter(Boolean);
      const before = ids.size;
      for (const tag of links) ids.add(tag);
      if (page > 1 && links.length && ids.size === before) throw new Error("스크랩 페이지가 반복됨");
      for (const link of doc.querySelectorAll(".pagination a[href]")) {
        const next = new URL(link.getAttribute("href"), url);
        const number = Number(next.searchParams.get("p"));
        if (next.origin === location.origin && next.pathname === url.pathname && Number.isInteger(number) && number > lastPage) lastPage = number;
      }
      if (lastPage > MAX_PAGES) throw new Error("스크랩 목록이 확인 범위를 넘음");
      if (page < lastPage) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { account, at: startedAt, ids: [...ids] };
  }
  async function refresh(force = false) {
    retry.disabled = true;
    status.textContent = "스크랩 확인 중";
    try {
      await navigator.locks.request("karmo-arca-scraps", async () => {
        const stored = await chrome.storage.local.get({ [STORE]: null, [CHANGED]: null });
        const cache = stored[STORE];
        const changedAt = stored[CHANGED]?.account === account ? stored[CHANGED].at : 0;
        if (!force && cache?.account === account && Array.isArray(cache.ids) && Date.now() - cache.at < TTL && cache.at >= changedAt) {
          paint(cache);
          return;
        }
        const next = await fetchAll();
        await chrome.storage.local.set({ [STORE]: next });
        paint(next);
      });
    } catch (error) {
      for (const { row } of rows) row.querySelector(".karmo-scrap-label")?.remove();
      status.textContent = "스크랩 확인 실패, 다시 확인 필요";
      status.title = error.message;
    } finally {
      retry.disabled = false;
    }
  }
  retry.addEventListener("click", () => refresh(true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CHANGED]?.newValue?.account === account) refresh();
    const next = changes[STORE]?.newValue;
    if (next?.account === account) paint(next);
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });
  refresh();
})();
