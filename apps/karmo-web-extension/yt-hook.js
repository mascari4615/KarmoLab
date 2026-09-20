/**
 * 유튜브 화면이 보내는 innertube 요청을 본뜬다. MAIN world, document_start
 *
 * 왜 후크: 직접 만든 요청은 로그아웃 취급
 *   화면 문구 "로그아웃하면 시청 기록을 볼 수 없습니다". SAPISIDHASH 헤더 필수
 * 왜 스크롤이 아닌가: 수집 탭은 visibilityState 가 hidden. 더 불러오기 정지
 * 정본: memo/systems/karmo-web-extension.md
 */

(() => {
  if (globalThis.__karmoYtHooked) return;
  globalThis.__karmoYtHooked = 1;
  globalThis.__karmoYtCap = { byPath: {} };

  const grab = (url, headers, body) => {
    const path = url.split("?")[0].split("/v1/")[1];
    if (!path) return;
    globalThis.__karmoYtCap.byPath[path] = { url, headers, body };
  };

  const orig = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    try {
      const req = typeof input === "object" && input && input.url ? input : null;
      const url = req ? req.url : String(input);
      if (url.includes("/youtubei/v1/")) {
        const headers = {};
        const h = req ? req.headers : init && init.headers;
        if (h && typeof h.forEach === "function") h.forEach((v, k) => { headers[k] = v; });
        else if (h) Object.assign(headers, h);
        const body = init && typeof init.body === "string" ? init.body : null;
        grab(url, headers, body);
      }
    } catch { /* 원본 호출은 막지 않는다 */ }
    return orig.apply(this, arguments);
  };
})();
