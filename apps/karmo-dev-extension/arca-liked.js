/* 좋아요 정본은 likelist.arca, 프로필 결과만 별도 캐시 */
(() => {
  const CACHE = "karmoLikedProfiles";
  const el = (id) => document.getElementById(id);
  const api = globalThis.KarmoProfile;
  let likes = {};
  let profiles = {};
  let busy = false;
  let completed = 0;
  let total = 0;
  let storageError = "";
  const date = (value) => Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString("ko-KR") : "날짜 정보 없음";

  function renderAuthors() {
    const current = el("author").value;
    el("author").replaceChildren(new Option("전체 작성자", ""));
    for (const [key, user] of Object.entries(likes).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0], "ko"))) {
      el("author").append(new Option(`${user.name || key}${key.includes("#") ? ` #${key.split("#").at(-1)}` : ""}`, key));
    }
    if (Object.hasOwn(likes, current)) el("author").value = current;
  }

  function render() {
    const active = document.activeElement;
    const focusedHref = active.closest?.("#posts li")?.dataset.href;
    const focusedClass = active.classList.contains("writer") ? "writer" : "post-title";
    let restoreFocus = null;
    const keys = Object.keys(likes);
    const rows = api.merge(profiles, likes);
    const selected = el("author").value;
    const query = el("search").value.trim().toLocaleLowerCase();
    const visible = rows.filter((r) => (!selected || r.key === selected) && (!query || r.title.toLocaleLowerCase().includes(query)));
    const fragment = document.createDocumentFragment();
    for (const r of visible) {
      const item = document.createElement("li");
      item.dataset.href = r.href;
      const title = document.createElement("a");
      title.className = "post-title";
      title.textContent = r.title || "제목 없음";
      title.href = r.href;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      const meta = document.createElement("div");
      meta.className = "meta";
      const writer = document.createElement("a");
      writer.className = "writer";
      writer.textContent = likes[r.key].name || r.key;
      writer.href = api.profileUrl(r.key);
      writer.title = r.key;
      writer.target = "_blank";
      writer.rel = "noopener noreferrer";
      const channel = document.createElement("span");
      channel.textContent = r.channelName;
      const time = document.createElement("time");
      time.textContent = date(r.time);
      if (Number.isFinite(Date.parse(r.time))) time.dateTime = r.time;
      meta.append(writer, channel, time);
      item.append(title, meta);
      if (focusedHref === r.href) restoreFocus = focusedClass === "writer" ? writer : title;
      fragment.append(item);
    }
    el("posts").replaceChildren(fragment);
    restoreFocus?.focus({ preventScroll: true });
    el("posts").setAttribute("aria-busy", String(busy));
    const fetched = keys.filter((key) => profiles[key]?.at).length;
    el("status").textContent = storageError || (busy ? `작성자 ${completed}/${total}명 확인 중, 현재 ${rows.length}개 글` : `좋아요 ${keys.length}명, 확인 ${fetched}명, 최근 글 ${rows.length}개`);
    const timestamps = keys.map((key) => profiles[key]?.at || 0).filter(Boolean);
    el("count").textContent = `${visible.length}개 표시${timestamps.length ? `, 마지막 수집 ${date(Math.max(...timestamps))}` : ""}`;
    const errors = keys.filter((key) => profiles[key]?.error);
    el("failures").hidden = !errors.length;
    el("failures").replaceChildren();
    if (errors.length) {
      const heading = document.createElement("strong");
      heading.textContent = `${errors.length}명 불러오기 실패, 다시 불러오면 재시도합니다.`;
      el("failures").append(heading);
      for (const key of errors) {
        const p = document.createElement("p");
        p.textContent = `${likes[key].name || key}: ${profiles[key].error}${profiles[key].at ? ` (이전 글 유지, ${date(profiles[key].at)})` : ""}`;
        el("failures").append(p);
      }
    }
    el("empty").hidden = visible.length > 0 || busy;
    if (!keys.length) {
      el("emptyTitle").textContent = "아직 좋아요한 작성자가 없습니다";
      el("emptyText").textContent = "아카라이브 글의 작성자 옆 좋아요 버튼으로 추가한 뒤 이 페이지로 돌아오세요.";
    } else if (!rows.length) {
      el("emptyTitle").textContent = "아직 표시할 글이 없습니다";
      el("emptyText").textContent = errors.length ? "불러오지 못한 작성자를 확인하고 다시 시도하세요." : "최신 글 불러오기를 누르세요. 공개된 최근 작성글이 없는 유저는 글이 표시되지 않습니다.";
    } else {
      el("emptyTitle").textContent = "조건에 맞는 글이 없습니다";
      el("emptyText").textContent = "검색어를 지우거나 전체 작성자를 선택하세요.";
    }
    el("refresh").disabled = busy || !keys.length;
    el("refresh").textContent = busy ? "글 불러오는 중" : "최신 글 불러오기";
  }

  async function refresh() {
    if (busy) return;
    const keys = Object.keys(likes);
    if (!keys.length) return;
    busy = true;
    storageError = "";
    completed = 0;
    total = keys.length;
    render();
    let next = 0;
    const worker = async () => {
      while (next < keys.length) {
        const key = keys[next++];
        try {
          const result = await chrome.runtime.sendMessage({ type: "arca.liked.read", key });
          if (!result?.ok) throw new Error(result?.error || "확장 응답을 받지 못했습니다.");
          profiles[key] = { rows: result.rows, at: result.at };
        } catch (error) {
          profiles[key] = { ...profiles[key], error: error.message };
        }
        completed += 1;
        render();
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      profiles = Object.fromEntries(Object.entries(profiles).filter(([key]) => Object.hasOwn(likes, key)));
      await chrome.storage.local.set({ [CACHE]: profiles });
    } catch (error) {
      storageError = `저장 실패: ${error.message}. 다시 불러오세요.`;
    } finally {
      busy = false;
      render();
    }
  }

  el("refresh").addEventListener("click", refresh);
  el("search").addEventListener("input", render);
  el("author").addEventListener("change", render);
  chrome.storage.onChanged.addListener((change, area) => {
    if (area === "local" && change.likelist) {
      likes = change.likelist.newValue?.arca || {};
      renderAuthors();
      render();
    }
  });
  chrome.storage.local.get({ likelist: {}, [CACHE]: {} }).then((got) => {
    likes = got.likelist.arca || {};
    profiles = got[CACHE] || {};
    renderAuthors();
    render();
    if (Object.keys(likes).some((key) => !profiles[key]?.at || Date.now() - profiles[key].at > 10 * 60 * 1000)) void refresh();
  }).catch((error) => { el("status").textContent = `좋아요 목록 읽기 실패: ${error.message}. 페이지를 새로고침하세요.`; });
})();
