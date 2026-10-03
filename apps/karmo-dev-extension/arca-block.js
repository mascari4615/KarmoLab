/**
 * 아카라이브 유저 차단. 유저 키: 사이트의 data-filter 값 (닉네임, 계정은 `닉#번호`)
 * 숨김 대상: 글 목록 줄 (a.vrow), 댓글 (.comment-item), 글 머리 (.article-head)
 */
/* 한 사람을 가리키는 키만 통과. 고정닉, 매니저, `닉#번호`
 * 번호 없는 계정 (목록 줄), 아이콘 없는 유동닉은 닉이 겹쳐 제외. 실측 2026-10-03: "ㅇㅇ" 차단에 4줄 동시 숨김 */
function isUnique(el, key) {
  if (key.includes("#")) return true;
  const title = el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title");
  return !!title && title !== "계정";
}

KarmoBlock.start({
  site: "arca",
  scan(root, api) {
    for (const el of root.querySelectorAll(".user-info [data-filter]")) {
      const key = el.getAttribute("data-filter");
      if (!key || !isUnique(el, key)) continue;
      const name = el.textContent.trim() || key;
      const row = el.closest("a.vrow, .comment-item");
      if (row && api.isBlocked(key)) {
        api.hide(row);
        continue;
      }
      // 글 머리 글쓴이: 차단 상태면 글 전체 숨김, 아니면 버튼
      const head = el.closest(".article-head");
      if (head && api.isBlocked(key)) {
        const article = head.closest(".article-wrapper, .article") || head.parentElement;
        if (article) api.hide(article);
        continue;
      }
      api.addButton(el.closest(".user-info"), key, name);
    }
  },
});
