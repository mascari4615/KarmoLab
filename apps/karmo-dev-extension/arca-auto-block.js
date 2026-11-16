/* 지정 채널의 현재 글과 공개 프로필 최근 작성글을 확인. 닉네임 유추 없이 확정된 작성자 키만 사용 */
(() => {
  const CACHE = "karmoAutoHistory";
  const TTL = 10 * 60 * 1000;
  const RETRY = 60000;
  const candidates = new Map();
  const pending = new Set();
  const queue = [];
  let cache = Object.create(null);
  let api = null;
  let loaded = false;
  let active = 0;
  let cacheError = false;
  const applying = new Set();
  const saveErrors = new Set();
  const rules = () => api.settings.autoBlockChannels || [];
  const allowed = (key) => (api.settings.autoAllowKeys || []).includes(key);
  function status() {
    const failures = [...candidates.keys()].filter((key) => cache[key]?.error && !api.blocked[key]?.hideAll && !allowed(key)).length;
    api.setAutoStatus(!rules().length ? "" : `자동 차단: 확인 중 ${pending.size}명${failures ? `, 작성 이력 확인 실패 ${failures}명` : ""}${saveErrors.size ? `, 저장 실패 ${saveErrors.size}명` : ""}${cacheError ? ", 이력 캐시 저장 실패" : ""}`);
  }
  async function apply(key, channel) {
    if (applying.has(key) || allowed(key) || api.blocked[key]?.hideAll || !rules().includes(channel)) return;
    applying.add(key);
    try { await api.autoBlock(key, candidates.get(key).name, channel); saveErrors.delete(key); }
    catch { saveErrors.add(key); }
    finally { applying.delete(key); status(); }
  }
  function consider(key) {
    if (!loaded || !rules().length || allowed(key) || api.blocked[key]?.hideAll) return;
    const candidate = candidates.get(key);
    if (api.settings.autoBlockSeen !== false) {
      const hit = [...candidate.channels].find((channel) => rules().includes(channel));
      if (hit) { void apply(key, hit); return; }
    }
    if (api.settings.autoBlockHistory === false) return;
    const saved = cache[key];
    if (saved && Date.now() - saved.at < (saved.error ? RETRY : TTL)) {
      const hit = !saved.error && saved.channels.find((channel) => rules().includes(channel));
      if (hit) void apply(key, hit);
      return;
    }
    if (!pending.has(key)) { pending.add(key); queue.push(key); pump(); }
  }
  async function check(key) {
    try {
      if (!rules().length || api.settings.autoBlockHistory === false || allowed(key)) return;
      const url = globalThis.KarmoProfile.profileUrl(key);
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const resultUrl = new URL(response.url || url);
      if (!["arca.live", "namu.la"].includes(resultUrl.hostname) || decodeURIComponent(resultUrl.pathname) !== decodeURIComponent(new URL(url).pathname)) throw new Error("작성자 프로필 주소 불일치");
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const rows = globalThis.KarmoProfile.parse(doc, key);
      cache[key] = { at: Date.now(), channels: [...new Set(rows.map((row) => row.channel))] };
      const hit = cache[key].channels.find((channel) => rules().includes(channel));
      if (hit && api.settings.autoBlockHistory !== false) await apply(key, hit);
    } catch { cache[key] = { at: Date.now(), channels: [], error: true }; }
    finally {
      const keep = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, 1000);
      cache = Object.fromEntries(keep);
      Object.setPrototypeOf(cache, null);
      try { await chrome.storage.local.set({ [CACHE]: cache }); cacheError = false; }
      catch { cacheError = true; }
    }
  }
  function pump() {
    while (active < 2 && queue.length) {
      const key = queue.shift();
      active++;
      check(key).finally(() => {
        pending.delete(key);
        active--;
        status();
        setTimeout(pump, 250);
      });
    }
    status();
  }
  function start(next) {
    if (api) return;
    api = next;
    api.subscribe(() => { for (const key of candidates.keys()) consider(key); status(); });
    chrome.storage.local.get({ [CACHE]: {} }, (got) => {
      cache = Object.assign(Object.create(null), got[CACHE] || {});
      loaded = true;
      for (const key of candidates.keys()) consider(key);
      status();
    });
  }
  function inspect({ key, name, channel }) {
    if (!api || !rules().length) return;
    if (!candidates.has(key)) candidates.set(key, { name, channels: new Set() });
    if (channel) candidates.get(key).channels.add(channel);
    consider(key);
  }
  function retry() {
    for (const key of candidates.keys()) if (cache[key]?.error) delete cache[key];
    for (const key of candidates.keys()) consider(key);
    status();
  }
  globalThis.KarmoAutoBlock = { start, inspect, retry };
})();
