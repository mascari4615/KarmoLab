/*
 * Google Cloud Console 의 OAuth 클라이언트 화면을 사람 대신 누른다 (v0.13.0, 2026-09-23).
 *
 * 왜: OAuth 웹 클라이언트의 "승인된 자바스크립트 원본" 은 공개 API, gcloud 둘 다 불가.
 * 사람이 로그인한 Edge 의 Console 화면이 유일한 길 (사용자 2026-09-23 "확장으로 누르는 걸로 해줘")
 *
 * background 가 새 탭 (보이는 탭. 숨은 탭은 화면을 안 그림) 에 이 함수를 주입.
 * dryRun 이면 읽기만: 원본 칸의 지금 값, 버튼 글자, 제목. 아니면 없는 원본만 더하고 저장
 */
async function gcpClientStep(args) {
  const want = Array.isArray(args && args.origins) ? args.origins : [];
  const dryRun = !!(args && args.dryRun);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const LABELS = ["승인된 JavaScript 원본", "승인된 자바스크립트 원본", "Authorized JavaScript origins"];
  const ADD = ["URI 추가", "ADD URI", "Add URI"];
  const SAVE = ["저장", "SAVE", "Save"];

  /* 원본 칸 머리글. 화면이 늦게 그려지므로 20초까지 기다린다 */
  /* 글자 노드만 훑는다. 요소마다 textContent 를 읽으면 Console 처럼 큰 화면에서 60초를 넘긴다 (2026-09-23 실측) */
  function findHead() {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const tx = norm(n.nodeValue);
      if (tx && LABELS.some((l) => tx === l || tx.startsWith(l))) return n.parentElement;
    }
    return null;
  }
  let head = null;
  for (let i = 0; i < 40 && !head; i++) {
    head = findHead();
    if (!head) await sleep(500);
  }
  if (!head) {
    return {
      ok: false,
      step: "head",
      url: location.href,
      title: document.title,
      text: norm(document.body && document.body.innerText).slice(0, 1500),
    };
  }

  /* 머리글에서 위로 올라가며 입력칸과 URI 추가 버튼을 같이 가진 가장 작은 조상 */
  function isAddBtn(b) {
    const tx = norm(b.textContent);
    return ADD.some((a) => tx.includes(a));
  }
  let box = head;
  for (let i = 0; i < 12 && box; i++) {
    const hasAdd = Array.from(box.querySelectorAll("button")).some(isAddBtn);
    if (hasAdd) break;
    box = box.parentElement;
  }
  if (!box) return { ok: false, step: "box", url: location.href };

  const inputs = () => Array.from(box.querySelectorAll("input")).filter((i) => i.type !== "hidden");
  const existing = inputs().map((i) => i.value).filter(Boolean);
  const buttons = Array.from(document.querySelectorAll("button"))
    .map((b) => norm(b.textContent))
    .filter(Boolean)
    .slice(0, 60);
  const missing = want.filter((o) => !existing.includes(o));
  if (dryRun || !missing.length) {
    return { ok: true, dryRun, url: location.href, title: document.title, existing, missing, buttons };
  }

  /* 값 넣기. 프레임워크가 듣게 원본 setter 로 넣고 input, change, blur 를 쏜다 */
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  function fill(el, v) {
    el.focus();
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  const added = [];
  for (const o of missing) {
    const addBtn = Array.from(box.querySelectorAll("button")).find(isAddBtn);
    if (!addBtn) return { ok: false, step: "add", url: location.href, existing, added };
    const before = inputs().length;
    addBtn.click();
    let blank = null;
    for (let i = 0; i < 20 && !blank; i++) {
      await sleep(250);
      const now = inputs();
      if (now.length > before) blank = now.find((x) => !x.value) || now[now.length - 1];
    }
    if (!blank) return { ok: false, step: "blank", url: location.href, existing, added };
    fill(blank, o);
    added.push(o);
    await sleep(300);
  }

  /* 저장. 화면 아래의 버튼. 누른 뒤 원본 칸 값을 다시 읽어 결과로 */
  const save = Array.from(document.querySelectorAll("button")).find(
    (b) => SAVE.includes(norm(b.textContent)) && !b.disabled
  );
  if (!save) return { ok: false, step: "save", url: location.href, existing, added, buttons };
  save.click();
  await sleep(4000);
  return {
    ok: true,
    saved: true,
    url: location.href,
    added,
    after: inputs().map((i) => i.value).filter(Boolean),
    text: norm(document.body && document.body.innerText).slice(0, 400),
  };
}

/*
 * MAIN world 에 주입. 페이지의 fetch, XHR 응답에서 새 비밀값 (GOCSPX-) 을 찾아 html 의 data 속성에 보관.
 * 새 비밀값은 화면 글자에 안 나오고 (2026-09-23 두 번 실측) Console 내부 API 응답에만 한 번 등장
 */
function gcpHookSecret() {
  if (window.__karmoSecretHook) return true;
  window.__karmoSecretHook = true;
  const RE = /GOCSPX-[A-Za-z0-9_-]{10,}/g;
  const seen = new Set((document.body.innerText.match(RE) || []));
  const put = (text) => {
    const all = String(text || "").match(RE) || [];
    const fresh = all.filter((v) => !seen.has(v));
    if (fresh.length) document.documentElement.setAttribute("data-karmo-s", fresh[fresh.length - 1]);
  };
  const of = window.fetch;
  window.fetch = async function (...a) {
    const res = await of.apply(this, a);
    try { res.clone().text().then(put).catch(() => {}); } catch { /* 무시 */ }
    return res;
  };
  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...a) {
    this.addEventListener("load", () => {
      try {
        const r = this.response;
        if (r instanceof ArrayBuffer) put(new TextDecoder("latin1").decode(r));
        else if (typeof r === "string") put(r);
        else put(JSON.stringify(r));
      } catch { /* 못 읽는 응답 */ }
    });
    return oo.apply(this, a);
  };
  return true;
}

/*
 * 같은 클라이언트 화면에서 비밀값 하나 더 만들기 ("Add secret"). 새 값은 만든 직후 한 번만 노출.
 * 옛 값은 유지 (다운타임 없는 순환). 새 값을 돌려주고 창은 닫음
 */
async function gcpAddSecretStep() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const RE = /GOCSPX-[A-Za-z0-9_-]{10,}/;
  /* 비밀값 구역. "Add secret" 버튼을 품은, ****xxxx 줄이 든 가장 작은 조상 */
  function secretZone() {
    const add = Array.from(document.querySelectorAll("button")).find((b) => /^(Add secret|보안 비밀번호 추가)$/.test(norm(b.textContent)));
    let z = add;
    for (let i = 0; i < 10 && z; i++) {
      if (/\*{4}[A-Za-z0-9]{4}/.test(z.innerText || "")) return z;
      z = z.parentElement;
    }
    return null;
  }
  let btn = null;
  for (let i = 0; i < 40 && !btn; i++) {
    btn = Array.from(document.querySelectorAll("button")).find((b) => /^(Add secret|보안 비밀번호 추가)$/.test(norm(b.textContent)));
    if (!btn) await sleep(500);
  }
  if (!btn) return { ok: false, step: "button", url: location.href };
  const before = new Set((document.body.innerText.match(new RegExp(RE.source, "g")) || []));
  btn.click();
  let secret = "";
  for (let i = 0; i < 40 && !secret; i++) {
    await sleep(500);
    /* 입력칸 값이나 글자에 새로 나타난 GOCSPX- 값 */
    const vals = Array.from(document.querySelectorAll("input,textarea")).map((x) => x.value);
    /* 목록에 바로 추가되는 방식 (2026-09-23 실측, 창 없음). 비밀값 구역과 겹친 창의 글자와 속성을 훑는다 */
    const zones = [secretZone(), document.querySelector(".cdk-overlay-container"), document.querySelector("[role=dialog]")].filter(Boolean);
    const attrs = [];
    let zoneText = "";
    for (const z of zones) {
      zoneText += " " + (z.innerText || "");
      for (const el of z.querySelectorAll("*")) for (const a of el.attributes) if (a.value.includes("GOCSPX-")) attrs.push(a.value);
    }
    const hooked = document.documentElement.getAttribute("data-karmo-s") || "";
    const pool = [hooked].concat(vals, attrs, zoneText.match(new RegExp(RE.source, "g")) || []);
    secret = pool.map((v) => (String(v).match(RE) || [""])[0]).find((v) => v && !before.has(v)) || "";
  }
  if (!secret) {
    /* 값을 못 찾음. 비밀값 구역 (없으면 뜬 창) 의 구조를 돌려준다 (값은 가림). 다음 시도에서 자리를 고치려고 */
    const dlg = secretZone() || document.querySelector('[role="dialog"], mat-dialog-container, .cdk-overlay-pane');
    const dump = (el) => el ? {
      text: norm(el.innerText).replace(/GOCSPX-[A-Za-z0-9_-]+/g, "GOCSPX-***").slice(0, 600),
      inputs: Array.from(el.querySelectorAll("input,textarea")).map((x) => ({ type: x.type, len: String(x.value || "").length, aria: x.getAttribute("aria-label") || "" })),
      buttons: Array.from(el.querySelectorAll("button")).map((b) => norm(b.textContent) || b.getAttribute("aria-label") || "").filter(Boolean),
      attrs: Array.from(el.querySelectorAll("[value],[data-value],[cdkcopytoclipboard],[ng-reflect-text]")).map((x) => x.tagName + ":" + Array.from(x.attributes).map((a) => a.name).join(",")).slice(0, 20),
    } : null;
    return { ok: false, step: "secret", url: location.href, dialog: dump(dlg) };
  }
  /* 창 닫기. 확인이나 닫기 버튼 */
  const close = Array.from(document.querySelectorAll("button")).find((b) => /^(확인|닫기|OK|Close|완료|Done)$/.test(norm(b.textContent)));
  if (close) close.click();
  document.documentElement.removeAttribute("data-karmo-s");
  return { ok: true, secret };
}

/*
 * 대상 (Audience) 화면. 게시 상태를 읽고, publish 면 "앱 게시" 를 누르고 확인까지.
 * 테스트 상태면 갱신 토큰 수명 7일
 */
async function gcpAudienceStep(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const find = (re) => Array.from(document.querySelectorAll("button")).find((b) => re.test(norm(b.textContent)) && !b.disabled);
  const text = () => norm(document.body && document.body.innerText);
  for (let i = 0; i < 40 && !/게시 상태|Publishing status/.test(text()); i++) await sleep(500);
  const before = text().match(/(게시 상태|Publishing status).{0,40}/);
  if (!(args && args.publish)) return { ok: true, status: before ? before[0] : "", buttons: Array.from(document.querySelectorAll("button")).map((b) => norm(b.textContent)).filter(Boolean).slice(0, 40) };
  const pub = find(/^(앱 게시|Publish app)$/);
  if (!pub) return { ok: false, step: "publish-button", status: before ? before[0] : "" };
  pub.click();
  await sleep(2000);
  /* 확인 창. 버튼 이름이 판마다 달라 창 안에서 넓게 찾는다. 창 글자는 결과로 */
  const dlg = document.querySelector('[role="dialog"], mat-dialog-container, .cdk-overlay-pane');
  const dlgText = dlg ? norm(dlg.innerText).slice(0, 500) : "";
  const dlgBtns = dlg ? Array.from(dlg.querySelectorAll("button")).map((b) => norm(b.textContent)).filter(Boolean) : [];
  const confirm = dlg && Array.from(dlg.querySelectorAll("button")).find((b) => /^(확인|Confirm|게시|Publish|프로덕션으로 푸시|Push to production)$/.test(norm(b.textContent)) && !b.disabled);
  if (confirm) confirm.click();
  await sleep(5000);
  const after = text().match(/(게시 상태|Publishing status).{0,40}/);
  return { ok: true, clicked: confirm ? norm(confirm.textContent) : "", dialog: dlgText, dialogButtons: dlgBtns, before: before ? before[0] : "", after: after ? after[0] : "" };
}

/*
 * 비밀값 줄 하나를 끝자리 (****O9IB 의 O9IB) 로 골라 사용 중지 또는 삭제.
 * 그 줄 조상 중 다른 비밀값 끝자리가 안 섞인 가장 큰 칸 안의 버튼만 누른다. 옆 줄 오조작 방지
 */
async function gcpSecretRowStep(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const suffix = String((args && args.suffix) || "");
  const action = args && args.action === "delete" ? "delete" : "disable";
  if (!/^[A-Za-z0-9]{4}$/.test(suffix)) return { ok: false, step: "suffix" };
  const mark = "****" + suffix;
  let node = null;
  for (let i = 0; i < 40 && !node; i++) {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes(mark)) { node = n.parentElement; break; }
    if (!node) await sleep(500);
  }
  if (!node) return { ok: false, step: "row", mark };
  /* 조상으로 오르며, 다른 ****xxxx 가 섞이기 직전까지 */
  let row = node;
  while (row.parentElement) {
    const t = row.parentElement.innerText || "";
    const others = (t.match(/\*{4}[A-Za-z0-9]{4}/g) || []).filter((m) => m !== mark);
    if (others.length) break;
    row = row.parentElement;
  }
  const want = action === "delete" ? /^(삭제|Delete)$/ : /^(사용 중지|Disable)$/;
  const label = (b) => norm(b.textContent) || b.getAttribute("aria-label") || b.getAttribute("mattooltip") || b.getAttribute("title") || b.getAttribute("data-tooltip") || "";
  const rowBtns = Array.from(row.querySelectorAll("button"));
  let btn = rowBtns.find((b) => want.test(label(b)));
  /* 삭제는 글자 없는 휴지통 아이콘. 이 줄에 이름 없는 버튼이 딱 하나일 때만 그것 */
  if (!btn && action === "delete") {
    const bare = rowBtns.filter((b) => !label(b));
    if (bare.length === 1) btn = bare[0];
  }
  if (!btn) return { ok: false, step: "button", mark, row: norm(row.innerText).slice(0, 300), buttons: Array.from(row.querySelectorAll("button")).map((b) => norm(b.textContent) || b.getAttribute("aria-label") || "") };
  btn.click();
  await sleep(1500);
  /* 확인 창. 같은 동사 버튼이 창 안에 한 번 더 */
  const dlg = document.querySelector('[role="dialog"], mat-dialog-container');
  if (dlg) {
    const c = Array.from(dlg.querySelectorAll("button")).find((b) => want.test(norm(b.textContent)) || /^(확인|Confirm)$/.test(norm(b.textContent)));
    if (c) c.click();
    await sleep(3000);
  }
  const still = document.body.innerText.includes(mark);
  let state = "";
  if (still) {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes(mark)) { state = norm(n.parentElement.closest("div") ? n.parentElement.closest("div").innerText : "").slice(0, 200); break; }
  }
  return { ok: true, action, mark, stillThere: still, state, dialog: dlg ? norm(dlg.innerText).slice(0, 300) : "" };
}

/*
 * 브랜딩 화면의 홈페이지, 개인정보처리방침 링크 두 칸을 채우고 저장. 앱 게시의 조건 (2026-09-23)
 */
async function gcpBrandingStep(args) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const want = { "애플리케이션 홈페이지": args && args.homepage, "애플리케이션 개인정보처리방침 링크": args && args.privacy };
  let inputs = [];
  for (let i = 0; i < 40; i++) {
    inputs = Array.from(document.querySelectorAll("input")).filter((x) => want[norm(x.getAttribute("aria-label") || (x.labels && x.labels[0] && x.labels[0].textContent) || "")] !== undefined);
    if (inputs.length >= 2) break;
    await sleep(500);
  }
  if (inputs.length < 2) return { ok: false, step: "fields", found: inputs.length };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const done = [];
  for (const x of inputs) {
    const label = norm(x.getAttribute("aria-label") || (x.labels && x.labels[0] && x.labels[0].textContent) || "");
    const v = want[label];
    if (!v || x.value === v) continue;
    x.focus();
    setter.call(x, v);
    x.dispatchEvent(new Event("input", { bubbles: true }));
    x.dispatchEvent(new Event("change", { bubbles: true }));
    x.dispatchEvent(new Event("blur", { bubbles: true }));
    done.push(label);
    await sleep(300);
  }
  if (!done.length) return { ok: true, changed: [] };
  const save = Array.from(document.querySelectorAll("button")).find((b) => /^(저장|Save|SAVE)$/.test(norm(b.textContent)) && !b.disabled);
  if (!save) return { ok: false, step: "save", changed: done };
  save.click();
  await sleep(5000);
  const err = norm(document.body.innerText).match(/(오류|유효하지|error)[^.]{0,120}/i);
  return { ok: true, changed: done, error: err ? err[0] : "" };
}

/* 화면 읽기만. 글자, 입력칸 (이름표와 값), 버튼. 무엇이 비었는지 보려고 */
async function gcpReadStep() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  await sleep(3000);
  const fields = Array.from(document.querySelectorAll("input,textarea,select")).filter((x) => x.type !== "hidden").map((x) => ({
    label: norm(x.getAttribute("aria-label") || (x.labels && x.labels[0] && x.labels[0].textContent) || x.name || ""),
    value: x.type === "password" ? "(가림)" : String(x.value || "").slice(0, 120),
    required: !!x.required,
  }));
  return {
    ok: true,
    url: location.href,
    text: norm(document.body && document.body.innerText).slice(0, 2500),
    fields,
    buttons: Array.from(document.querySelectorAll("button")).map((b) => norm(b.textContent)).filter(Boolean).slice(0, 40),
  };
}

globalThis.gcpHookSecret = gcpHookSecret;
globalThis.gcpBrandingStep = gcpBrandingStep;
globalThis.gcpReadStep = gcpReadStep;
globalThis.gcpSecretRowStep = gcpSecretRowStep;
globalThis.gcpClientStep = gcpClientStep;
globalThis.gcpAddSecretStep = gcpAddSecretStep;
globalThis.gcpAudienceStep = gcpAudienceStep;
