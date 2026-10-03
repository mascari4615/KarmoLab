/** content.js 의 기본값과 맞출 것 */
const DEFAULT_INGEST_URL = "http://127.0.0.1:17376/ingest";

const input = document.getElementById("ingestUrl");
const btn = document.getElementById("save");
const resetBtn = document.getElementById("resetDefault");
const status = document.getElementById("status");

function show(msg, ok = true) {
  status.textContent = msg;
  status.style.color = ok ? "#0a0" : "#c00";
}

/* 탭. 주소의 #arca 로 바로 열림 */
function openTab(name) {
  for (const t of document.querySelectorAll("section.tab")) t.classList.toggle("on", t.id === `tab-${name}`);
  for (const b of document.querySelectorAll("nav.tabs button")) b.classList.toggle("on", b.dataset.tab === name);
  history.replaceState(null, "", `#${name}`);
}
for (const b of document.querySelectorAll("nav.tabs button")) b.addEventListener("click", () => openTab(b.dataset.tab));
openTab(location.hash === "#arca" ? "arca" : "general");

/* 일반 */
chrome.storage.sync.get({ ingestUrl: DEFAULT_INGEST_URL }, (items) => {
  input.value = items.ingestUrl || DEFAULT_INGEST_URL;
});

function saveUrl(v) {
  try {
    void new URL(v);
  } catch {
    show("올바른 URL 형식이 아닙니다.", false);
    return;
  }
  chrome.storage.sync.set({ ingestUrl: v }, () => {
    if (chrome.runtime.lastError) {
      show(chrome.runtime.lastError.message, false);
      return;
    }
    input.value = v;
    show("저장됨. 치지직 탭은 그대로 두면 다음 채팅부터 새 주소로 전송됩니다.");
  });
}

btn.addEventListener("click", () => {
  const v = input.value.trim();
  if (!v) {
    show("URL을 입력하세요.", false);
    return;
  }
  saveUrl(v);
});

resetBtn.addEventListener("click", () => {
  saveUrl(DEFAULT_INGEST_URL);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btn.click();
  }
});

/* 아카라이브. 저장 형식은 block-core.js 머리 주석, 기본값은 block-defaults.js */
const SITE = "arca";
const D = globalThis.KARMO_BLOCK_DEFAULTS;
const KEYS = { block: "blocklist", like: "likelist" };
const LABEL = { block: "차단", like: "좋아요" };
let state = { settings: { ...D }, lists: { block: {}, like: {} } };

function loadAll(cb) {
  chrome.storage.local.get({ karmoSettings: {}, blocklist: {}, likelist: {} }, (items) => {
    const raw = items.karmoSettings || {};
    state = {
      settings: { ...D, ...(raw[SITE] || (raw.linkStyle ? raw : {})) },
      lists: { block: items.blocklist, like: items.likelist },
    };
    cb();
  });
}

/* 설정 한 부분을 저장. 저장 뒤 화면을 다시 그림 */
function patch(change) {
  chrome.storage.local.get({ karmoSettings: {} }, (items) => {
    const raw = items.karmoSettings || {};
    const cur = { ...(raw[SITE] || (raw.linkStyle ? raw : {})) };
    chrome.storage.local.set({ karmoSettings: { ...raw, [SITE]: { ...cur, ...change } } }, () => loadAll(render));
  });
}

const el = (id) => document.getElementById(id);

function colorInput(value, onChange) {
  const c = document.createElement("input");
  c.type = "color";
  c.value = value;
  c.addEventListener("change", () => onChange(c.value));
  return c;
}

function renderPalette() {
  const box = el("palette");
  box.textContent = "";
  state.settings.palette.forEach((hex, i) => {
    const w = document.createElement("span");
    w.className = "swatch";
    w.append(colorInput(hex, (v) => patch({ palette: state.settings.palette.map((x, j) => (j === i ? v : x)) })));
    if (state.settings.palette.length > 1) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "del";
      d.textContent = "x";
      d.title = "이 색 빼기";
      d.addEventListener("click", () => patch({ palette: state.settings.palette.filter((_, j) => j !== i) }));
      w.append(d);
    }
    box.append(w);
  });
}

function nameOf(key) {
  for (const kind of ["block", "like"]) {
    const v = (state.lists[kind][SITE] || {})[key];
    if (v) return v.name;
  }
  return key;
}

function renderUserColors() {
  const ul = el("userColors");
  ul.textContent = "";
  const entries = Object.entries(state.settings.colors || {});
  for (const [key, hex] of entries) {
    const li = document.createElement("li");
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "secondary";
    rm.textContent = "자동 색으로";
    rm.addEventListener("click", () => {
      const next = { ...state.settings.colors };
      delete next[key];
      patch({ colors: next });
    });
    const label = document.createElement("span");
    label.textContent = nameOf(key);
    const code = document.createElement("code");
    code.textContent = key;
    li.append(colorInput(hex, (v) => patch({ colors: { ...state.settings.colors, [key]: v } })), label, code, rm);
    ul.append(li);
  }
  if (!entries.length) ul.textContent = "없음";
}

function renderLists() {
  const box = el("lists");
  box.textContent = "";
  for (const kind of ["block", "like"]) {
    const h = document.createElement("h3");
    h.textContent = LABEL[kind];
    const ul = document.createElement("ul");
    for (const [site, users] of Object.entries(state.lists[kind])) {
      for (const [key, v] of Object.entries(users)) {
        const li = document.createElement("li");
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "secondary";
        rm.textContent = "해제";
        rm.addEventListener("click", () => {
          delete state.lists[kind][site][key];
          chrome.storage.local.set({ [KEYS[kind]]: state.lists[kind] }, () => loadAll(render));
        });
        const label = document.createElement("span");
        label.textContent = `${site} / ${v.name} `;
        const code = document.createElement("code");
        code.textContent = key;
        li.append(rm, label, code);
        ul.append(li);
      }
    }
    if (!ul.children.length) ul.textContent = "없음";
    box.append(h, ul);
  }
}

function render() {
  const s = state.settings;
  for (const r of document.querySelectorAll('input[name="linkStyle"]')) r.checked = r.value === s.linkStyle;
  el("panel").checked = !!s.panel;
  el("hoverHl").checked = !!s.hoverHl;
  el("exBest").checked = !!s.exBest;
  el("minRec").value = String(s.minRec);
  el("blockSort").value = s.blockSort;
  el("likeColor").value = s.likeColor;
  renderPalette();
  renderUserColors();
  renderLists();
}

for (const r of document.querySelectorAll('input[name="linkStyle"]')) r.addEventListener("change", () => patch({ linkStyle: r.value }));
el("panel").addEventListener("change", (e) => patch({ panel: e.target.checked }));
el("hoverHl").addEventListener("change", (e) => patch({ hoverHl: e.target.checked }));
el("exBest").addEventListener("change", (e) => patch({ exBest: e.target.checked }));
el("minRec").addEventListener("change", (e) => patch({ minRec: Math.max(0, parseInt(e.target.value, 10) || 0) }));
el("blockSort").addEventListener("change", (e) => patch({ blockSort: e.target.value }));
el("likeColor").addEventListener("change", (e) => patch({ likeColor: e.target.value }));
el("paletteAdd").addEventListener("click", () => patch({ palette: [...state.settings.palette, "#888888"] }));
el("paletteReset").addEventListener("click", () => patch({ palette: [...D.palette] }));

/* 파일 저장 상태. 내보내기 본체는 userlists.js */
function renderSaveState() {
  chrome.storage.local.get({ [UL_STATE]: null }, (items) => {
    const s = items[UL_STATE];
    el("saveState").textContent = !s ? "아직 저장 안 함" : s.error ? `실패: ${s.error}` : `${new Date(s.at).toLocaleString()} 저장, 차단 ${s.block}명, 좋아요 ${s.like}명`;
  });
}
el("listSave").addEventListener("click", async () => {
  const s = await exportUserlists();
  show(s.error ? `저장 실패: ${s.error}` : `다운로드/${s.file} 에 저장`, !s.error);
});
renderSaveState();

const listFile = el("listFile");
el("listImport").addEventListener("click", () => listFile.click());
listFile.addEventListener("change", async () => {
  const f = listFile.files[0];
  if (!f) return;
  let incoming;
  try {
    incoming = JSON.parse(await f.text());
  } catch {
    show("JSON 이 아닙니다.", false);
    return;
  }
  /* { block, like } 형태. 옛 형태 (사이트 맵 하나) 는 차단으로 본다 */
  if (!incoming.block && !incoming.like) incoming = { block: incoming };
  const cur = { block: state.lists.block, like: state.lists.like };
  let n = 0;
  for (const kind of ["block", "like"]) {
    for (const [site, users] of Object.entries(incoming[kind] || {})) {
      cur[kind][site] = cur[kind][site] || {};
      for (const [key, v] of Object.entries(users || {})) {
        if (!cur[kind][site][key]) n += 1;
        cur[kind][site][key] = cur[kind][site][key] || v;
      }
    }
  }
  /* 파일에 설정이 있으면 지금 저장된 값이 우선, 빈 자리만 채움 */
  chrome.storage.local.get({ karmoSettings: {} }, (items) => {
    const merged = { ...items.karmoSettings };
    for (const [site, s] of Object.entries(incoming.settings || {})) {
      if (s && typeof s === "object") merged[site] = { ...s, ...(merged[site] || {}) };
    }
    chrome.storage.local.set({ blocklist: cur.block, likelist: cur.like, karmoSettings: merged }, () => {
      loadAll(render);
      show(`가져옴. 새로 ${n}명`);
    });
  });
  listFile.value = "";
});

loadAll(render);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.karmoSettings || ch.blocklist || ch.likelist)) loadAll(render);
  if (area === "local" && ch[UL_STATE]) renderSaveState();
});
