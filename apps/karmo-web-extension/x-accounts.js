/**
 * X 계정 목록 수집기. background 가 탭에 주입
 *
 * 확장인 이유: 자동화 프로필의 X 로그인은 탐지 차단. 사용자 세션 안이라 무관
 * 2026-09-20 관측: 가상 목록. 스크롤 한 번에 한 묶음
 * 정본: memo/systems/karmo-web-extension.md
 */

/** 화면에 붙어 있는 사람 칸을 긁는다. 스크롤로 묶음을 계속 부른다 */
async function collectXUserCells() {
  const seen = new Map();
  const SKIP = new Set(["팔로우", "팔로잉", "차단됨", "Follow", "Following"]);

  const grab = () => {
    for (const c of document.querySelectorAll('[data-testid="UserCell"]')) {
      const a = c.querySelector('a[role="link"][href^="/"]');
      const href = a ? a.getAttribute("href") : "";
      const handle = href.replace(/^\//, "");
      if (!handle || handle.includes("/") || seen.has(handle)) continue;
      const lines = c.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
      const name = lines[0] || "";
      const bio = lines.slice(2).filter((l) => !SKIP.has(l)).join(" ");
      seen.set(handle, { handle, name, bio });
    }
  };

  grab();
  let stall = 0;
  for (let i = 0; i < 400; i += 1) {
    const before = seen.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 1200));
    grab();
    if (seen.size === before) {
      stall += 1;
      if (stall >= 12) break;
    } else {
      stall = 0;
    }
  }
  return [...seen.values()];
}

/**
 * 내가 만든 리스트만. 남의 리스트는 취향 자료 아님
 * (사용자 2026-09-20 "그건 내 게 아니잖아")
 */
async function collectXOwnedLists() {
  const me = location.pathname.split("/")[1].toLowerCase();
  const out = new Map();
  const grab = () => {
    for (const a of document.querySelectorAll('a[href*="/i/lists/"]')) {
      const m = a.getAttribute("href").match(/\/i\/lists\/(\d+)/);
      if (!m || out.has(m[1])) continue;
      const lines = a.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
      const owner = (lines.find((l) => l.startsWith("@")) || "").slice(1).toLowerCase();
      if (owner && owner !== me) continue;
      out.set(m[1], { id: m[1], name: lines[0] || "", owner: owner || me });
    }
  };
  grab();
  for (let i = 0; i < 20; i += 1) {
    const before = out.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 900));
    grab();
    if (out.size === before) break;
  }
  return [...out.values()];
}

// background 의 이름 호출용 전역 등록
globalThis.collectXUserCells = collectXUserCells;
globalThis.collectXOwnedLists = collectXOwnedLists;
