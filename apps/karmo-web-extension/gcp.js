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
  const LABELS = ["승인된 자바스크립트 원본", "Authorized JavaScript origins"];
  const ADD = ["URI 추가", "ADD URI", "Add URI"];
  const SAVE = ["저장", "SAVE", "Save"];

  /* 원본 칸 머리글. 화면이 늦게 그려지므로 20초까지 기다린다 */
  function findHead() {
    const all = document.querySelectorAll("h1,h2,h3,h4,div,span,label,legend,p");
    for (const el of all) {
      if (el.children.length > 3) continue;
      const tx = norm(el.textContent);
      if (LABELS.some((l) => tx === l || tx.startsWith(l))) return el;
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

globalThis.gcpClientStep = gcpClientStep;
