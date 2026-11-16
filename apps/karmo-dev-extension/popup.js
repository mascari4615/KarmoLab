document.getElementById("open").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("bookmarks").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("bookmarks.html") });
});

document.getElementById("arcaLiked").addEventListener("click", async () => {
  const handoff = (await chrome.storage.local.get('arcaHandoff')).arcaHandoff;
  if (handoff?.status === 'committed') {
    document.getElementById('arcaLiked').textContent = 'KarmoLab 팝업에서 팔로우 글 모아보기를 여세요';
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("arca-liked.html") });
});
