/* 화면 폭과 인사이트 설정에 무관한 모아보기 입구 */
(() => {
  const host = document.querySelector(".board-article");
  if (!host || document.getElementById("karmo-liked-open")) return;
  const button = document.createElement("button");
  button.id = "karmo-liked-open";
  button.type = "button";
  button.className = "btn btn-secondary";
  button.textContent = "팔로우 글 모아보기";
  button.style.cssText = "margin:12px 0;min-height:44px";
  button.addEventListener("click", async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: "arca.liked.open" });
      if (!result?.ok) throw new Error(result?.error || "페이지 열기 실패");
    } catch {
      button.textContent = "아카라이브를 새로고침한 뒤 다시 열기";
    }
  });
  host.prepend(button);
})();
