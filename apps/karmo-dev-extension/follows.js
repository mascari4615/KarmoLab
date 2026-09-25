/**
 * 팔로우, 즐겨찾기 목록 수집기. background 가 탭에 주입
 *
 * 확장인 이유: 자동화 브라우저는 X 와 구글 로그인이 탐지 차단
 * 사용자가 직접 설치한 확장이라 그 벽과 무관
 * 정본: memo/systems/karmo-dev-extension.md
 */

/** 화면이 쓰는 API 를 같은 자격으로. 새로 뚫는 것 없음 */
async function collectChzzkFollows() {
  const rows = [];
  let total = null;
  for (let p = 0; p < 30; p += 1) {
    const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/followings?page=${p}&size=50`, { credentials: "include" });
    if (!r.ok) throw new Error(`followings ${r.status}`);
    const j = await r.json();
    const list = j && j.content && j.content.followingList;
    if (!Array.isArray(list)) throw new Error("followingList 없음");
    total = (j.content && j.content.totalCount) != null ? j.content.totalCount : total;
    for (const x of list) {
      const ch = x.channel || {};
      const pd = (ch.personalData && ch.personalData.following) || {};
      rows.push({
        name: ch.channelName || "",
        id: x.channelId || "",
        followers: ch.followerCount != null ? ch.followerCount : "",
        notify: pd.notification ? "on" : "off",
        followedAt: String(pd.followDate || "").slice(0, 10),
      });
    }
    if (list.length < 50) break;
  }
  return { rows, total };
}

/** 즐겨찾기 슬라이드는 30에서 멈춘다. 스트리머 관리 목록에 전부 */
async function collectSoopFavorites() {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "스트리머 관리");
  if (btn) {
    btn.click();
    await new Promise((r) => setTimeout(r, 2500));
  }
  const uls = [...document.querySelectorAll(".strm_list")].filter((u) => u.querySelector("li"));
  const ul = uls[uls.length - 1];
  if (!ul) throw new Error("strm_list 없음");
  return [...ul.children].map((li) => {
    const t = li.textContent.trim().replace(/\s+/g, " ");
    const m = t.match(/^(.+?)\s*최근 방송\s*:\s*([\d-]+\s[\d:]+)/);
    const head = m ? m[1] : t.slice(0, 30);
    return {
      name: head.replace(/구독|F$/g, "").trim(),
      fanclub: /F$/.test(head) ? "F" : "",
      subscribe: head.includes("구독") ? "구독" : "",
      lastBroadcast: m ? m[2] : "",
    };
  });
}

// background 의 이름 호출용 전역 등록
globalThis.collectChzzkFollows = collectChzzkFollows;
globalThis.collectSoopFavorites = collectSoopFavorites;
