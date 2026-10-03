/**
 * 유저 차단 공통 코어. 아카라이브, 이후 디시와 유튜브 공용
 * 저장: chrome.storage.local 의 blocklist, 형태 { site: { key: { name, at } } }
 * 사용: 어댑터가 KarmoBlock.start({ site, scan }), 화면이 바뀔 때마다 scan(root, api)
 */
(() => {
  if (globalThis.KarmoBlock) return;

  const STORE_KEY = "blocklist";
  const HIDDEN = "karmo-blocked";
  const BTN = "karmo-block-btn";
  const HL = "karmo-hl";

  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN} { display: none !important; }
    .${BTN} { all: unset; position: absolute; cursor: pointer; margin-left: 3px; padding: 0 4px; font: 12px/1.3 system-ui, sans-serif; white-space: nowrap;
      color: #888; border: 1px solid #bbb; border-radius: 2px; opacity: 0; }
    [data-karmo-row]:hover .${BTN}, .user-info:hover + .${BTN}, .${BTN}:hover { opacity: .75; }
    .${BTN}:hover { opacity: 1 !important; color: #c00; border-color: #c00; }
    .${HL} { background: rgba(255, 196, 0, .32) !important; outline: 2px solid rgba(255, 160, 0, .9); outline-offset: -2px; }
  `;
  document.documentElement.appendChild(style);

  /* 닉네임 위에 마우스: 이 페이지에서 같은 키의 줄을 모두 강조, 건수를 툴팁으로 */
  let hlKey = null;
  function highlight(key) {
    if (hlKey === key) return;
    hlKey = key;
    document.querySelectorAll(`.${HL}`).forEach((el) => el.classList.remove(HL));
    if (key == null) return;
    for (const row of document.querySelectorAll("[data-karmo-row]")) {
      if (row.dataset.karmoRow === key) row.classList.add(HL);
    }
  }
  document.addEventListener("mouseover", (e) => {
    const name = e.target.closest?.("[data-karmo-name]");
    if (name) {
      const key = name.dataset.karmoName;
      highlight(key);
      const n = [...document.querySelectorAll("[data-karmo-row]")].filter((r) => r.dataset.karmoRow === key).length;
      name.title = `이 페이지 ${n}건`;
    } else highlight(null);
  });

  function start({ site, scan }) {
    let list = {};
    let queued = false;

    const api = {
      isBlocked: (key) => Object.prototype.hasOwnProperty.call(list, key),
      hide: (el) => el.classList.add(HIDDEN),
      /** row 는 강조될 줄, nameEl 은 마우스를 올릴 닉네임 */
      tag(row, nameEl, key) {
        if (row) row.dataset.karmoRow = key;
        nameEl.dataset.karmoName = key;
      },
      /** anchor 바로 뒤에 차단 버튼을 한 번만 단다 */
      addButton(anchor, key, name) {
        if (anchor.dataset.karmoBlockBtn) return;
        anchor.dataset.karmoBlockBtn = "1";
        const b = document.createElement("button");
        b.type = "button";
        b.className = BTN;
        b.textContent = "×";
        b.title = `${name} 차단`;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          block(key, name);
        });
        anchor.after(b);
      },
    };

    function block(key, name) {
      chrome.storage.local.get({ [STORE_KEY]: {} }, (items) => {
        const all = items[STORE_KEY] || {};
        all[site] = { ...(all[site] || {}), [key]: { name, at: new Date().toISOString() } };
        chrome.storage.local.set({ [STORE_KEY]: all });
      });
    }

    function run() {
      queued = false;
      scan(document, api);
    }
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }

    function load(items) {
      const all = (items && items[STORE_KEY]) || {};
      list = all[site] || {};
      // 해제 반영: 숨김을 모두 지우고 다시 검사
      document.querySelectorAll(`.${HIDDEN}`).forEach((el) => el.classList.remove(HIDDEN));
      schedule();
    }

    chrome.storage.local.get({ [STORE_KEY]: {} }, load);
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch[STORE_KEY]) load({ [STORE_KEY]: ch[STORE_KEY].newValue });
    });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  globalThis.KarmoBlock = { start };
})();
