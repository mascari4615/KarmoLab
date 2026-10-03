/**
 * 유저 차단 공통 코어. 아카라이브, 이후 디시와 유튜브 공용
 * 저장: chrome.storage.local 의 blocklist, 형태 { site: { key: { name, at } } }
 * 사용: 어댑터가 KarmoBlock.start({ site, footer, scan }), 화면이 바뀔 때마다 scan(root, api)
 * 차단된 줄: 제자리 숨김, 페이지 맨 아래 (footer 앞) 접힌 블록에 한 줄씩 모음
 */
(() => {
  if (globalThis.KarmoBlock) return;

  const STORE_KEY = "blocklist";
  const HIDDEN = "karmo-blocked";
  const BTN = "karmo-block-btn";
  const HL = "karmo-hl";
  const BLOCK = "karmo-blocked-block";

  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN} { display: none !important; }
    .${BTN} { all: unset; position: absolute; cursor: pointer; margin-left: 3px; padding: 0 4px; font: 12px/1.3 system-ui, sans-serif; white-space: nowrap;
      color: #888; border: 1px solid #bbb; border-radius: 2px; opacity: 0; background: #fff; }
    [data-karmo-row]:hover .${BTN}, .user-info:hover + .${BTN}, .${BTN}:hover { opacity: .85; }
    .${BTN}:hover { opacity: 1 !important; color: #c00; border-color: #c00; }
    .${HL} { background: rgba(255, 196, 0, .32) !important; outline: 2px solid rgba(255, 160, 0, .9); outline-offset: -2px; }
    .${BLOCK} { margin: 16px auto; max-width: 1100px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px; font: 13px/1.5 system-ui, sans-serif; color: #444; background: rgba(128,128,128,.08); }
    .${BLOCK} summary { cursor: pointer; font-weight: 600; }
    .${BLOCK} ul { list-style: none; margin: 8px 0 0; padding: 0; }
    .${BLOCK} li { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; border-top: 1px solid rgba(128,128,128,.2); }
    .${BLOCK} li a { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${BLOCK} li .nm { flex: none; color: #888; }
    .${BLOCK} li button { all: unset; flex: none; cursor: pointer; margin-left: auto; font-size: 12px; color: #888; border: 1px solid #bbb; border-radius: 2px; padding: 0 5px; }
    .${BLOCK} li button:hover { color: #080; border-color: #080; }
  `;
  document.documentElement.appendChild(style);

  function start({ site, footer, scan }) {
    let list = {};
    let queued = false;
    let hidden = [];
    let blockSig = "";
    let hlKey = null;

    const rowsOf = (key) => [...document.querySelectorAll("[data-karmo-row]")].filter((r) => r.dataset.karmoRow === key);

    function storeEdit(fn) {
      chrome.storage.local.get({ [STORE_KEY]: {} }, (items) => {
        const all = items[STORE_KEY] || {};
        all[site] = all[site] || {};
        fn(all[site]);
        chrome.storage.local.set({ [STORE_KEY]: all });
      });
    }
    const block = (key, name) => storeEdit((s) => { s[key] = { name, at: new Date().toISOString() }; });
    const unblock = (key) => storeEdit((s) => { delete s[key]; });

    const api = {
      isBlocked: (key) => Object.prototype.hasOwnProperty.call(list, key),
      /** 제자리에서 숨기고 아래 블록에 info { key, name, label, href } 를 올린다 */
      hide(el, info) {
        el.classList.add(HIDDEN);
        if (info) hidden.push(info);
      },
      /** row: 호버로 강조될 줄 (글, 댓글) */
      tag(row, key) {
        if (row) row.dataset.karmoRow = key;
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

    /* 줄 위에 마우스: 이 페이지의 같은 유저 줄을 모두 강조, 버튼 툴팁에 건수 */
    function highlight(row) {
      const key = row ? row.dataset.karmoRow : null;
      if (hlKey === key) return;
      hlKey = key;
      document.querySelectorAll(`.${HL}`).forEach((el) => el.classList.remove(HL));
      if (key == null) return;
      const rows = rowsOf(key);
      rows.forEach((r) => r.classList.add(HL));
      const b = row.querySelector(`.${BTN}`);
      if (b) b.title = `${b.title.replace(/ \(.*\)$/, "")} (이 페이지 ${rows.length}건)`;
    }
    document.addEventListener("mouseover", (e) => highlight(e.target.closest?.("[data-karmo-row]") || null));

    /* 숨긴 줄 모음. 내용이 같으면 DOM 을 건드리지 않는다 (감시자가 다시 부르는 루프 방지) */
    function renderBlock() {
      const sig = hidden.map((h) => `${h.key}|${h.href}|${h.label}`).join("\n");
      if (sig === blockSig) return;
      blockSig = sig;
      let box = document.querySelector(`.${BLOCK}`);
      if (!hidden.length) {
        box?.remove();
        return;
      }
      const open = box?.open;
      if (!box) {
        box = document.createElement("details");
        box.className = BLOCK;
        const at = footer && document.querySelector(footer);
        if (at) at.before(box);
        else document.body.append(box);
      }
      box.textContent = "";
      const sum = document.createElement("summary");
      sum.textContent = `차단한 유저의 글 ${hidden.length}개`;
      const ul = document.createElement("ul");
      for (const h of hidden) {
        const li = document.createElement("li");
        const nm = document.createElement("span");
        nm.className = "nm";
        nm.textContent = h.name;
        const a = document.createElement("a");
        a.textContent = h.label || "(제목 없음)";
        if (h.href) a.href = h.href;
        const un = document.createElement("button");
        un.type = "button";
        un.textContent = "차단 해제";
        un.addEventListener("click", () => unblock(h.key));
        li.append(nm, a, un);
        ul.append(li);
      }
      box.append(sum, ul);
      if (open) box.open = true;
    }

    function run() {
      queued = false;
      hidden = [];
      scan(document, api);
      renderBlock();
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
      blockSig = "\0";
      schedule();
    }

    chrome.storage.local.get({ [STORE_KEY]: {} }, load);
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch[STORE_KEY]) load({ [STORE_KEY]: ch[STORE_KEY].newValue });
    });
    new MutationObserver((muts) => {
      if (muts.every((m) => m.target.closest?.(`.${BLOCK}`))) return;
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  globalThis.KarmoBlock = { start };
})();
