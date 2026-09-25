/**
 * 유튜브 시청 기록 수집기. background 가 MAIN world 에 주입
 *
 * 확장인 이유: 자동화 브라우저의 구글 신규 로그인은 탐지 차단
 * 스크롤이 아닌 이유: 수집 탭은 visibilityState 가 hidden. 더 불러오기 정지
 *   (2026-09-21 실측, 스크롤 한 번에 1편, 탭 먼저 소멸)
 * 요청 본뜨기는 yt-hook.js 가 document_start 에서
 * 한 걸음씩인 이유: MV3 워커 30초 무활동 종료
 * 정본: memo/systems/karmo-dev-extension.md
 */

/** 걸음 사이 기억. 탭이 살아 있는 동안 남는다 */
function ytState() {
  if (!globalThis.__karmoYt) {
    globalThis.__karmoYt = { seen: new Map(), token: null, phase: "init", rounds: 0, note: "" };
  }
  return globalThis.__karmoYt;
}

/**
 * 헤더만 빌리고 몸체는 ytcfg 로 직접
 * 첫 로드에 browse 가 안 잡히는 이유: 기록이 HTML 에 박혀 옴
 * guide 든 player 든 인증 헤더는 같음 (2026-09-21 실측, 새 항목 56편)
 */
function ytTemplate() {
  const cap = globalThis.__karmoYtCap;
  const cfg = globalThis.ytcfg && globalThis.ytcfg.data_;
  if (!cap || !cfg || !cfg.INNERTUBE_API_KEY) return null;
  for (const path of ["browse", "guide", "player", "next"]) {
    if (cap.byPath[path]) return cap.byPath[path];
  }
  const any = Object.keys(cap.byPath)[0];
  return any ? cap.byPath[any] : null;
}

function ytText(n) {
  if (!n) return "";
  if (typeof n === "string") return n;
  if (n.content) return n.content;
  if (n.simpleText) return n.simpleText;
  if (n.runs) return n.runs.map((r) => r.text).join("");
  return "";
}

/**
 * 담긴 것만 재귀로. 날짜 머리는 같은 절 안에서만
 * 2026-09 화면 구조는 lockupViewModel. 예전 videoRenderer 도 허용
 */
function ytHarvest(node, seen, day, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) ytHarvest(x, seen, day, out);
    return;
  }
  if (node.itemSectionRenderer) {
    const sec = node.itemSectionRenderer;
    const head = sec.header && sec.header.itemSectionHeaderRenderer;
    ytHarvest(sec.contents, seen, head ? ytText(head.title) : day, out);
    return;
  }
  if (node.lockupViewModel) {
    const lv = node.lockupViewModel;
    const m = lv.metadata && lv.metadata.lockupMetadataViewModel;
    const rows = m && m.metadata && m.metadata.contentMetadataViewModel && m.metadata.contentMetadataViewModel.metadataRows;
    const first = rows && rows[0] && rows[0].metadataParts && rows[0].metadataParts[0];
    if (lv.contentId && !seen.has(lv.contentId)) {
      seen.set(lv.contentId, {
        id: lv.contentId,
        day: day || "",
        duration: "",
        channel: first ? ytText(first.text) : "",
        title: m ? ytText(m.title) : "",
      });
    }
  }
  // 재생목록 화면은 playlistVideoRenderer (2026-09-21 실측, 0곡)
  const v2 = node.videoRenderer || node.playlistVideoRenderer;
  if (v2 && v2.videoId && !seen.has(v2.videoId)) {
    seen.set(v2.videoId, {
      id: v2.videoId,
      day: day || "",
      duration: ytText(v2.lengthText),
      channel: ytText(v2.shortBylineText) || ytText(v2.ownerText),
      title: ytText(v2.title),
    });
  }
  if (node.continuationCommand && node.continuationCommand.token) out.token = node.continuationCommand.token;
  for (const k of Object.keys(node)) ytHarvest(node[k], seen, day, out);
}

function ytSnap(S) {
  return { count: S.seen.size, rounds: S.rounds, note: S.note, done: S.phase !== "page", rows: [...S.seen.values()] };
}

/**
 * 한 걸음. 워커가 done 까지 되부름
 * @returns {Promise<{count:number,rounds:number,note:string,done:boolean,rows:Array<object>}>}
 */
async function ytStep() {
  const S = ytState();

  if (S.phase === "init") {
    const out = { token: null };
    ytHarvest(globalThis.ytInitialData, S.seen, "", out);
    S.token = out.token;
    const tpl = ytTemplate();
    S.phase = S.token && tpl ? "page" : "stop";
    S.note = S.phase === "page" ? "ok" : (tpl ? "이어받을 표식 없음" : "요청 본뜨기 실패. 첫 묶음만");
    return ytSnap(S);
  }
  if (S.phase !== "page") return ytSnap(S);

  const tpl = ytTemplate();
  const cfg = globalThis.ytcfg && globalThis.ytcfg.data_;
  const res = await fetch(`/youtubei/v1/browse?key=${cfg.INNERTUBE_API_KEY}&prettyPrint=false`, {
    method: "POST",
    credentials: "include",
    headers: tpl.headers,
    body: JSON.stringify({ context: cfg.INNERTUBE_CONTEXT, continuation: S.token }),
  });
  S.rounds += 1;
  if (!res.ok) {
    S.phase = "stop";
    S.note = `응답 ${res.status}`;
    return ytSnap(S);
  }
  const out = { token: null };
  const before = S.seen.size;
  ytHarvest(await res.json(), S.seen, "", out);
  if (!out.token || S.seen.size === before || S.rounds >= 40) {
    S.phase = "stop";
    return ytSnap(S);
  }
  S.token = out.token;
  return ytSnap(S);
}

// background 의 이름 호출용 전역 등록
globalThis.ytStep = ytStep;
