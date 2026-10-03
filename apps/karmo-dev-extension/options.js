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

/* 유저 차단 목록. 형식은 block-core.js 의 blocklist = { site: { key: { name, at } } } */
const blocksEl = document.getElementById("blocks");

function renderBlocks(all) {
  blocksEl.textContent = "";
  for (const [site, users] of Object.entries(all)) {
    for (const [key, v] of Object.entries(users)) {
      const li = document.createElement("li");
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "secondary";
      rm.textContent = "해제";
      rm.addEventListener("click", () => {
        delete all[site][key];
        chrome.storage.local.set({ blocklist: all }, () => renderBlocks(all));
      });
      const label = document.createElement("span");
      label.textContent = `${site} · ${v.name} `;
      const code = document.createElement("code");
      code.textContent = key;
      li.append(rm, label, code);
      blocksEl.append(li);
    }
  }
  if (!blocksEl.children.length) blocksEl.textContent = "차단한 유저 없음";
}

chrome.storage.local.get({ blocklist: {} }, (items) => renderBlocks(items.blocklist || {}));

document.getElementById("blockExport").addEventListener("click", () => {
  chrome.storage.local.get({ blocklist: {} }, (items) => {
    const blob = new Blob([JSON.stringify(items.blocklist || {}, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "blocklist.json";
    a.click();
  });
});

const blockFile = document.getElementById("blockFile");
document.getElementById("blockImport").addEventListener("click", () => blockFile.click());
blockFile.addEventListener("change", async () => {
  const f = blockFile.files[0];
  if (!f) return;
  let incoming;
  try {
    incoming = JSON.parse(await f.text());
  } catch {
    show("JSON 이 아닙니다.", false);
    return;
  }
  chrome.storage.local.get({ blocklist: {} }, (items) => {
    const all = items.blocklist || {};
    let n = 0;
    for (const [site, users] of Object.entries(incoming)) {
      all[site] = all[site] || {};
      for (const [key, v] of Object.entries(users || {})) {
        if (!all[site][key]) n += 1;
        all[site][key] = all[site][key] || v;
      }
    }
    chrome.storage.local.set({ blocklist: all }, () => {
      renderBlocks(all);
      show(`가져옴. 새로 ${n}명`);
    });
  });
  blockFile.value = "";
});
