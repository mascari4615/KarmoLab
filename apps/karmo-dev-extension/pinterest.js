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
async function pinScrape(opt) {
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
