/**
 * 아카라이브 유저 차단과 좋아요. 유저 키: 사이트의 data-filter 값 (닉네임, 계정은 `닉#번호`)
 * 대상: 글 목록 줄 (a.vrow), 댓글 (.comment-item), 글 머리 (.article-head)
 * 숨긴 글은 footer 앞 블록에, 목록 줄은 복제해서 사이트 목록 모양 그대로
 */
/* 한 사람을 가리키는 키만 통과. 고정닉, 매니저, `닉#번호`
 * 번호 없는 계정 (목록 줄), 아이콘 없는 유동닉은 닉이 겹쳐 제외. 실측 2026-10-03: "ㅇㅇ" 차단에 4줄 동시 숨김 */
function isUnique(el, key) {
  if (key.includes("#")) return true;
  const title = el.closest(".user-info")?.querySelector(".user-icon")?.getAttribute("title");
  return !!title && title !== "계정";
}

const squash = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

/* 숨긴 줄을 아래 블록에 올릴 정보. 목록 줄은 kind post */
function summary(row, key, name) {
  if (row.matches("a.vrow")) {
    return { kind: "post", key, name, id: squash(row.querySelector(".col-id")?.textContent, 12), label: squash(row.querySelector(".title")?.textContent, 100), href: row.href };
  }
  const id = (row.id || "").replace(/^c_/, "");
  return { kind: "comment", key, name, label: "댓글: " + squash(row.querySelector(".message .text")?.textContent, 80), href: id ? `#c_${id}` : "" };
}

KarmoBlock.start({
  site: "arca",
  footer: "footer.footer",
  listBox: ".list-table",
  scan(root, api) {
    for (const el of root.querySelectorAll(".user-info [data-filter]")) {
      const key = el.getAttribute("data-filter");
      if (!key || el.closest(".karmo-blocked-block") || !isUnique(el, key)) continue;
      const name = el.textContent.trim() || key;
      const row = el.closest("a.vrow, .comment-item");
      if (row && api.isBlocked(key)) {
        api.hide(row, summary(row, key, name));
        continue;
      }
      // 글 머리 글쓴이: 차단 상태면 글 전체 숨김, 아니면 버튼
      const head = el.closest(".article-head");
      if (head && api.isBlocked(key)) {
        const article = head.closest(".article-wrapper, .article") || head.parentElement;
        if (article) api.hide(article, { kind: "article", key, name, label: squash(document.title, 100), href: location.href });
        continue;
      }
      // 공지 줄은 이어 보이기에서 뺀다 (매니저 공지 여러 줄이 항상 묶임)
      if (row && !row.classList.contains("notice")) api.tag(row, key, el);
      api.addButtons(el.closest(".user-info"), key, name);
    }
  },
});
