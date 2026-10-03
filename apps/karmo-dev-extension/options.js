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

/* 유저 차단, 좋아요, 설정. 형식은 block-core.js 머리 주석 */
const KEYS = { block: "blocklist", like: "likelist" };
const LABEL = { block: "차단", like: "좋아요" };
const listsEl = document.getElementById("lists");

function renderLists(data) {
  listsEl.textContent = "";
  for (const kind of ["block", "like"]) {
    const h = document.createElement("h3");
    h.textContent = LABEL[kind];
    const ul = document.createElement("ul");
    for (const [site, users] of Object.entries(data[kind])) {
      for (const [key, v] of Object.entries(users)) {
        const li = document.createElement("li");
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "secondary";
        rm.textContent = "해제";
        rm.addEventListener("click", () => {
          delete data[kind][site][key];
          chrome.storage.local.set({ [KEYS[kind]]: data[kind] }, () => renderLists(data));
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
    listsEl.append(h, ul);
  }
}

function loadLists() {
  chrome.storage.local.get({ blocklist: {}, likelist: {}, karmoSettings: {} }, (items) => {
    renderLists({ block: items.blocklist, like: items.likelist });
    const s = { linkStyle: "lines", blockSort: "name", ...items.karmoSettings };
    for (const r of document.querySelectorAll('input[name="linkStyle"]')) r.checked = r.value === s.linkStyle;
  });
}
loadLists();

for (const r of document.querySelectorAll('input[name="linkStyle"]')) {
  r.addEventListener("change", () => {
    chrome.storage.local.get({ karmoSettings: {} }, (i) => {
      chrome.storage.local.set({ karmoSettings: { ...i.karmoSettings, linkStyle: r.value } });
    });
  });
}

document.getElementById("listExport").addEventListener("click", () => {
  chrome.storage.local.get({ blocklist: {}, likelist: {} }, (items) => {
    const text = JSON.stringify({ block: items.blocklist, like: items.likelist }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = "userlists.json";
    a.click();
  });
});

const listFile = document.getElementById("listFile");
document.getElementById("listImport").addEventListener("click", () => listFile.click());
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
  chrome.storage.local.get({ blocklist: {}, likelist: {} }, (items) => {
    const cur = { block: items.blocklist, like: items.likelist };
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
    chrome.storage.local.set({ blocklist: cur.block, likelist: cur.like }, () => {
      renderLists(cur);
      show(`가져옴. 새로 ${n}명`);
    });
  });
  listFile.value = "";
});
