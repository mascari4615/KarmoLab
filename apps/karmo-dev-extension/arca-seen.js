/**
 * 아카라이브 글 목록 읽음 구분선: 지난 방문에서 본 마지막 글 아래에 줄을 긋고 새 글 개수를 적음
 * 대상: /b/<채널> 의 첫 페이지, 정렬, 개념글, 말머리 같은 보기마다 따로 기억
 * 저장: chrome.storage.local 의 karmoSeen, 형태 { 보기: { base, max, at } }
 *   max: 본 가장 큰 글 번호, base: 구분선 기준 (지난 방문의 max)
 *   마지막 방문에서 10분이 지나야 base 가 max 로 올라감, 새로고침해도 구분선 유지
 */
(() => {
  const STORE = "karmoSeen";
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_VIEWS = 200;

  const m = /^\/b\/([^/]+)\/?$/.exec(location.pathname);
  if (!m) return;
  const params = new URLSearchParams(location.search);
  if (Number(params.get("p") || 1) !== 1) return;
  params.delete("p");
  const view = `${m[1]}?${params}`;

  const rows = [...document.querySelectorAll(".list-table a.vrow:not(.notice):not(.head)")]
    .map((row) => ({ row, id: parseInt(row.querySelector(".col-id")?.textContent, 10) }))
    .filter((r) => Number.isFinite(r.id));
  if (!rows.length) return;
  const curMax = Math.max(...rows.map((r) => r.id));

  const style = document.createElement("style");
  style.textContent = `
    .karmo-seen { margin: 0; padding: 2px 8px; border-top: 2px dashed #e8590c; border-bottom: 1px solid rgba(232,89,12,.35);
      font: 12px/1.6 system-ui, sans-serif; text-align: center; color: #c2410c; background: rgba(232,89,12,.08); }
  `;
  document.documentElement.appendChild(style);

  chrome.storage.local.get({ [STORE]: {} }, (items) => {
    const all = items[STORE] || {};
    const prev = all[view];
    const now = Date.now();
    let base = null;
    if (prev) base = now - prev.at > WINDOW_MS ? prev.max : prev.base ?? null;

    all[view] = { base, max: Math.max(curMax, prev?.max || 0), at: now };
    const keys = Object.keys(all);
    if (keys.length > MAX_VIEWS) {
      keys.sort((a, b) => all[a].at - all[b].at);
      for (const k of keys.slice(0, keys.length - MAX_VIEWS)) delete all[k];
    }
    chrome.storage.local.set({ [STORE]: all });

    globalThis.KarmoSeen = { view, base };
    document.dispatchEvent(new CustomEvent("karmo-seen"));
    if (base == null) return;
    const fresh = rows.filter((r) => r.id > base).length;
    if (!fresh) return;
    const line = document.createElement("div");
    line.className = "karmo-seen";
    line.textContent = `여기까지 읽음 (지난 방문 이후 새 글 ${fresh}개)`;
    const firstOld = rows.find((r) => r.id <= base);
    if (firstOld) firstOld.row.before(line);
    else rows.at(-1).row.after(line);
  });
})();
