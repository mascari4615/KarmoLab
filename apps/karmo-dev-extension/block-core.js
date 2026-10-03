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

  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN} { display: none !important; }
    .${BTN} { all: unset; cursor: pointer; margin-left: 4px; padding: 0 3px; font: 11px/1.4 system-ui, sans-serif;
      color: #999; border: 1px solid #bbb; border-radius: 2px; opacity: .55; }
    .${BTN}:hover { opacity: 1; color: #c00; border-color: #c00; }
  `;
  document.documentElement.appendChild(style);

  function start({ site, scan }) {
    let list = {};
    let queued = false;

    const api = {
      isBlocked: (key) => Object.prototype.hasOwnProperty.call(list, key),
      hide: (el) => el.classList.add(HIDDEN),
      /** anchor 바로 뒤에 차단 버튼을 한 번만 단다 */
      addButton(anchor, key, name) {
        if (anchor.dataset.karmoBlockBtn) return;
        anchor.dataset.karmoBlockBtn = "1";
        const b = document.createElement("button");
        b.type = "button";
        b.className = BTN;
        b.textContent = "차단";
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
