/**
 * 유튜브 시청 기록 수집기. background 가 탭에 주입
 *
 * 확장인 이유: 자동화 브라우저의 구글 신규 로그인은 탐지 차단
 * 사용자가 직접 설치한 확장이라 그 벽과 무관
 * 정본: memo/systems/karmo-web-extension.md
 *
 * 화면 태그 2026-09 변경. ytd-video-renderer -> yt-lockup-view-model
 * 결과 0 이면 여기부터 확인
 */

/**
 * @param {number} maxRounds 스크롤 시도 상한
 * @returns {Promise<Array<{id:string,day:string,duration:string,channel:string,title:string}>>}
 */
async function collectYoutubeHistory(maxRounds) {
  const BULLET = String.fromCharCode(0x2022);
  const seen = new Map();

  const grab = () => {
    for (const v of document.querySelectorAll("yt-lockup-view-model")) {
      const a = v.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
      const href = a ? a.getAttribute("href") : "";
      const m = href.match(/v=([\w-]+)/) || href.match(/shorts\/([\w-]+)/);
      const id = m && m[1];
      if (!id || seen.has(id)) continue;
      const parts = v.innerText.split("\n").map((x) => x.trim()).filter(Boolean);
      const duration = /^\d+:\d+/.test(parts[0]) ? parts.shift() : "";
      const title = parts.shift() || "";
      const channel = (parts[0] && parts[0] !== BULLET && !parts[0].startsWith("조회수")) ? parts[0] : "";
      const sec = v.closest("ytd-item-section-renderer");
      const head = sec && sec.querySelector("#title");
      seen.set(id, { id, day: head ? head.textContent.trim() : "", duration, channel, title });
    }
  };

  grab();
  let stall = 0;
  const rounds = Number(maxRounds) > 0 ? Number(maxRounds) : 200;
  for (let i = 0; i < rounds; i += 1) {
    const before = seen.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 900));
    grab();
    if (seen.size === before) {
      stall += 1;
      if (stall >= 20) break;
    } else {
      stall = 0;
    }
  }
  return [...seen.values()];
}
