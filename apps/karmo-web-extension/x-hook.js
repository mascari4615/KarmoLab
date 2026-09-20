/**
 * X 화면이 보내는 GraphQL 요청을 본뜬다. MAIN world, document_start
 *
 * 왜 document_start: 화면은 첫 묶음을 로드 때 한 번만 호출
 *   뒤에 끼어들면 잡을 것 없음 (2026-09-21 실측, 후크 0건)
 * 왜 스크롤이 아닌가: 수집 탭은 visibilityState 가 hidden
 *   X 무한 스크롤 로더(IntersectionObserver) 정지
 * 정본: memo/systems/karmo-web-extension.md
 */

(() => {
  if (globalThis.__karmoHooked) return;
  globalThis.__karmoHooked = 1;
  globalThis.__karmoCap = { last: null, byOp: {} };

  const grab = (url, headers) => {
    const op = url.split("?")[0].split("/").pop();
    const rec = { url, headers, op };
    globalThis.__karmoCap.last = rec;
    globalThis.__karmoCap.byOp[op] = rec;
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    try {
      const req = typeof input === "object" && input && input.url ? input : null;
      const url = req ? req.url : String(input);
      if (url.includes("/i/api/graphql/")) {
        const headers = {};
        const h = req ? req.headers : init && init.headers;
        if (h && typeof h.forEach === "function") h.forEach((v, k) => { headers[k] = v; });
        else if (h) Object.assign(headers, h);
        grab(url, headers);
      }
    } catch { /* 원본 호출은 막지 않는다 */ }
    return origFetch.apply(this, arguments);
  };

  // 화면이 XHR 을 쓸 경우 대비. 헤더는 setRequestHeader 에서
  const OpenOrig = XMLHttpRequest.prototype.open;
  const SetOrig = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__karmoUrl = String(url || "");
    this.__karmoHeaders = {};
    return OpenOrig.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try {
      if (this.__karmoHeaders) this.__karmoHeaders[k] = v;
      if (this.__karmoUrl && this.__karmoUrl.includes("/i/api/graphql/")) grab(this.__karmoUrl, this.__karmoHeaders);
    } catch { /* 원본 호출은 막지 않는다 */ }
    return SetOrig.apply(this, arguments);
  };
})();
