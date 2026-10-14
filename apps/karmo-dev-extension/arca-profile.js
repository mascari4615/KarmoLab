/* 작성자 프로필의 최근 글 수집. 최근 댓글과 로그인 메뉴 제외 */
(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  function profileUrl(key) {
    const match = /^(.+)#(\d+)$/.exec(key);
    return `https://arca.live/u/@${encodeURIComponent(match ? match[1] : key)}${match ? `/${match[2]}` : ""}`;
  }

  function parse(root, key) {
    const heading = [...root.querySelectorAll(".user-body h5")].find((h) => clean(h.textContent) === "최근 작성글");
    if (!heading) throw new Error("최근 작성글을 읽을 수 없습니다. 프로필 접근 또는 사이트 화면을 확인하세요.");
    const rows = [];
    for (let row = heading.nextElementSibling; row && !/^H[1-6]$/.test(row.tagName); row = row.nextElementSibling) {
      if (!row.matches(".user-recent")) continue;
      const links = [...row.querySelectorAll(".col-title a[href]")];
      const post = links.find((a) => /^\/b\/[^/?#]+\/\d+$/.test(new URL(a.getAttribute("href"), "https://arca.live").pathname));
      if (!post) continue;
      const url = new URL(post.getAttribute("href"), "https://arca.live");
      if (url.origin !== "https://arca.live" || url.hash) continue;
      const [, channel, id] = /^\/b\/([^/]+)\/(\d+)$/.exec(url.pathname);
      const title = post.cloneNode(true);
      title.querySelectorAll("small").forEach((s) => s.remove());
      rows.push({
        id: Number(id), key, channel,
        channelName: clean(links.find((a) => a.querySelector(".category-badge"))?.textContent) || channel,
        title: clean(title.textContent), href: url.origin + url.pathname,
        time: row.querySelector("time")?.getAttribute("datetime") || "",
      });
    }
    return rows;
  }

  function merge(profiles, likes) {
    const posts = new Map();
    for (const [key, profile] of Object.entries(profiles)) {
      if (!Object.hasOwn(likes, key)) continue;
      for (const row of profile.rows || []) posts.set(row.href, { ...row, key });
    }
    return [...posts.values()].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0) || b.id - a.id);
  }

  globalThis.KarmoProfile = { profileUrl, parse, merge };
})();
