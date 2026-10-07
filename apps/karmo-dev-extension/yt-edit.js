/**
 * 유튜브 나중에 볼 동영상 (WL) 빼기, 좋아요 (LL) 취소. background 가 MAIN world 에 주입
 *
 * 왜 innertube: Data API 는 WL 을 2016 이후 빈 목록으로 줌. 화면과 같은 요청이 유일한 길
 * 헤더는 yt-hook.js 가 잡은 화면 요청에서 빌림 (youtube-history.js 의 ytTemplate). SAPISIDHASH 없으면 로그아웃 취급
 * 정리 끝난 것만 지우는 판단은 부르는 쪽 (memo scripts/youtube). 이 파일은 받은 목록만 처리
 * 정본: memo/systems/karmo-dev-extension.md
 */

/**
 * 잡아 둔 헤더의 SAPISIDHASH 는 시각이 박혀 있어 오래되면 401 (2026-10-07 좋아요 취소 1/2 실패)
 * 매 요청 새로 계산. 형식: SAPISIDHASH <초>_<sha1(초 + " " + SAPISID + " " + origin)>
 */
async function ytAuth() {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID)=([^;]+)/);
  if (!m) return null;
  const ts = Math.floor(Date.now() / 1000);
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${ts} ${m[1]} ${location.origin}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `SAPISIDHASH ${ts}_${hex}`;
}

async function ytPost(path, body) {
  const tpl = globalThis.ytTemplate && globalThis.ytTemplate();
  const cfg = globalThis.ytcfg && globalThis.ytcfg.data_;
  if (!tpl || !cfg) throw new Error("요청 본뜨기 실패");
  const headers = { ...tpl.headers };
  const auth = await ytAuth();
  if (auth) {
    for (const k of Object.keys(headers)) if (k.toLowerCase() === "authorization") delete headers[k];
    headers.Authorization = auth;
    headers["X-Origin"] = location.origin;
  }
  const res = await fetch(`/youtubei/v1/${path}?key=${cfg.INNERTUBE_API_KEY}&prettyPrint=false`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ context: cfg.INNERTUBE_CONTEXT, ...body }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * @param {"WL"|"LL"} list
 * @param {Array<{id:string,setId?:string}>} items
 * @returns {Promise<{done:string[],failed:Array<{id:string,why:string}>}>}
 */
async function ytRemove(list, items) {
  const done = [];
  const failed = [];
  if (list === "WL") {
    // 한 요청에 여러 줄. setVideoId 가 재생목록 안 줄 표식
    const withSet = items.filter((x) => x.setId);
    for (const x of items) if (!x.setId) failed.push({ id: x.id, why: "setId 없음" });
    for (let i = 0; i < withSet.length; i += 25) {
      const part = withSet.slice(i, i + 25);
      const r = await ytPost("browse/edit_playlist", {
        playlistId: "WL",
        actions: part.map((x) => ({ action: "ACTION_REMOVE_VIDEO", setVideoId: x.setId })),
      });
      const ok = r.status === 200 && r.json && r.json.status === "STATUS_SUCCEEDED";
      for (const x of part) (ok ? done.push(x.id) : failed.push({ id: x.id, why: `응답 ${r.status} ${r.json && r.json.status}` }));
    }
  } else if (list === "LL") {
    for (const x of items) {
      const r = await ytPost("like/removelike", { target: { videoId: x.id } });
      // 200 이어도 반영 안 된 경우 있음 (2026-10-07). 응답 키를 같이 남겨 부르는 쪽이 다시 읽어 확인
      const keys = r.json ? Object.keys(r.json).join(",") : "";
      if (r.status === 200) done.push(x.id);
      else failed.push({ id: x.id, why: `응답 ${r.status} ${keys}` });
      if (!globalThis.__karmoYtLast) globalThis.__karmoYtLast = [];
      globalThis.__karmoYtLast.push({ id: x.id, status: r.status, keys });
      await new Promise((ok) => setTimeout(ok, 250));
    }
  } else {
    throw new Error("목록은 WL, LL 만");
  }
  return { done, failed, trace: (globalThis.__karmoYtLast || []).slice(-50) };
}

// background 의 이름 호출용 전역 등록
globalThis.ytRemove = ytRemove;
