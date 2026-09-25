/**
 * 핀터레스트 그림 줍기. background 가 탭에 주입
 *
 * 확장인 이유: 로그인 안 한 핀터레스트는 핀 잠김 (`gated-pin-rep`), 핀 쪽 링크 없음.
 * 전용 자동화 프로필은 로그인이 없고, 사용자 Edge 는 로그인돼 있다 (2026-09-25 레퍼런스 모으기)
 * 정본: memo/systems/karmo-dev-extension.md, karmo-design 스킬 reference/sources.md
 *
 * opt.key 가 있으면: 그 해시의 그림을 찾아 핀 쪽 주소만 돌려줌 (검색 결과 쪽에서)
 * 없으면: 쪽을 내리며 그림 opt.want 장 (핀 쪽이면 아래 "비슷한 핀")
 */
/**
 * 화면 대신 핀터레스트가 쓰는 내부 주소로 (같은 출처, 로그인 쿠키 그대로).
 * 뒤쪽 탭은 화면을 안 그려 "비슷한 핀" 목록이 안 생김 (2026-09-26 실측: 핀 쪽 넷에서 모두 같은 2장)
 * mode search: 검색 결과에서 해시가 같은 그림의 핀 id. mode related: 그 핀의 비슷한 핀
 */
async function pinApi(opt) {
  const get = async (resource, options, sourceUrl) => {
    const u = `/resource/${resource}/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;
    const r = await fetch(u, { credentials: "include", headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest", "x-pinterest-pws-handler": "www/pin/[id].js" } });
    if (!r.ok) throw new Error(resource + " " + r.status);
    const j = await r.json();
    return j && j.resource_response;
  };
  const rowOf = (p) => {
    const img = p && p.images && (p.images.orig || p.images["736x"] || p.images["474x"]);
    const m = img && String(img.url || "").match(/\/([0-9a-f]{32})\.(jpg|png|webp|gif)/);
    return m ? { hash: m[1], ext: m[2], alt: String(p.grid_title || p.title || p.description || "").slice(0, 200), pin: "https://www.pinterest.com/pin/" + p.id + "/", id: String(p.id) } : null;
  };
  if (opt.mode === "search") {
    let bookmark = null;
    for (let page = 0; page < 6; page += 1) {
      const options = { query: opt.query, scope: "pins", page_size: 50, redux_normalize_feed: true };
      if (bookmark) options.bookmarks = [bookmark];
      const res = await get("BaseSearchResource", options, "/search/pins/?q=" + encodeURIComponent(opt.query));
      const list = (res && res.data && (res.data.results || res.data)) || [];
      for (const p of list) {
        const row = rowOf(p);
        if (row && row.hash === opt.key) return { href: row.pin, pinId: row.id, rows: [] };
      }
      bookmark = res && res.bookmark;
      if (!bookmark || bookmark === "-end-") break;
    }
    return { href: "", rows: [], note: "검색 결과에 없음" };
  }
  if (opt.mode === "related") {
    const want = Math.max(1, Math.min(80, Number(opt.want) || 25));
    const rows = [];
    let bookmark = null;
    for (let page = 0; page < 4 && rows.length < want; page += 1) {
      const options = { pin_id: String(opt.pinId), context_pin_ids: [], search_query: "", source: "deep_linking", top_level_source: "deep_linking", top_level_source_depth: 1, is_pdp: false };
      if (bookmark) options.bookmarks = [bookmark];
      const res = await get("RelatedModulesResource", options, "/pin/" + opt.pinId + "/");
      for (const p of (res && res.data) || []) {
        const row = rowOf(p);
        if (row && !rows.some((x) => x.hash === row.hash)) rows.push(row);
      }
      bookmark = res && res.bookmark;
      if (!bookmark || bookmark === "-end-") break;
    }
    return { href: "", rows: rows.slice(0, want) };
  }
  throw new Error("모르는 mode " + opt.mode);
}

async function pinScrape(opt) {
  if (opt && opt.mode) return pinApi(opt);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const linkOf = (img) => {
    let a = img.closest('a[href*="/pin/"]');
    let el = img;
    for (let up = 0; !a && el && up < 6; up += 1, el = el.parentElement) a = el.querySelector && el.querySelector('a[href*="/pin/"]');
    return a ? a.href : "";
  };
  const rows = [];
  const seen = new Set();
  let href = "";
  const want = Math.max(1, Math.min(80, Number(opt.want) || 25));
  for (let k = 0; k < 20; k += 1) {
    for (const img of document.querySelectorAll("img")) {
      const s = img.currentSrc || img.src;
      const m = s.match(/i\.pinimg\.com\/[^/]+\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/([0-9a-f]{32})\.(jpg|png|webp|gif)/);
      if (!m) continue;
      if (opt.key && m[1] === opt.key && !href) href = linkOf(img);
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      rows.push({ hash: m[1], ext: m[2], alt: (img.alt || "").slice(0, 200), pin: linkOf(img) });
    }
    if (opt.key ? href : rows.length >= want) break;
    window.scrollBy(0, 2400);
    await wait(1300);
  }
  return { href, rows: opt.key ? [] : rows.slice(0, want) };
}

// background 의 이름 호출용 전역 등록
globalThis.pinScrape = pinScrape;
