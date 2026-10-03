/**
 * 유저 차단, 좋아요, 다작 유저 표시 공통 코어. 아카라이브, 이후 디시와 유튜브 공용
 * 저장 (chrome.storage.local), 모두 { site: { key: { name, at } } }
 *   blocklist: 차단. 제자리 숨김, 페이지 맨 아래 (footer 앞) 접힌 블록에 모음. 블록은 목록 폭과 왼쪽에 맞춤
 *   likelist: 좋아요. 올리지 않아도 줄 바탕을 분홍으로 강조
 *   karmoSettings: { linkStyle: pill | tint | off, panel: boolean, blockSort: name | id }
 * 한 페이지에 두 줄 이상 쓴 유저: 유저마다 색, 닉네임을 색 알약으로, 줄 왼쪽에 색 띠 (tint 는 줄 바탕도, 기본). 건수는 닉네임 툴팁과 왼쪽 패널
 * 사용: 어댑터가 KarmoBlock.start({ site, footer, listBox, scan }), 화면이 바뀔 때마다 scan(root, api)
 */
(() => {
  if (globalThis.KarmoBlock) return;

  const K = { block: "blocklist", like: "likelist", settings: "karmoSettings" };
  const DEFAULTS = { linkStyle: "tint", panel: true, blockSort: "name" };
  const STYLES = ["pill", "tint", "off"];
  const HIDDEN = "karmo-blocked";
  const BTNS = "karmo-btns";
  const HL = "karmo-hl";
  const LIKE = "karmo-like";
  const MULTI = "karmo-multi";
  const BLOCK = "karmo-blocked-block";
  const PANEL = "karmo-panel";

  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN} { display: none !important; }
    .${BTNS} { position: absolute; display: inline-flex; gap: 2px; margin-left: 3px; }
    .${BTNS} button { all: unset; cursor: pointer; padding: 0 4px; font: 12px/1.3 system-ui, sans-serif; white-space: nowrap;
      color: #888; border: 1px solid #bbb; border-radius: 2px; opacity: 0; background: #fff; }
    [data-karmo-row]:hover .${BTNS} button, .user-info:hover + .${BTNS} button { opacity: .85; }
    .${BTNS} button:hover { opacity: 1 !important; }
    .${BTNS} .x:hover { color: #c00; border-color: #c00; }
    .${BTNS} .like:hover, .${BTNS} .like.on { color: #e0457b; border-color: #e0457b; }
    .${BTNS} .like.on { opacity: 1; }
    [data-karmo-link="pill"] .${MULTI}, [data-karmo-link="tint"] .${MULTI} { box-shadow: inset 5px 0 0 var(--karmo-c); }
    [data-karmo-link="tint"] .${MULTI} { background: color-mix(in srgb, var(--karmo-c) 14%, transparent) !important; }
    [data-karmo-link="pill"] .${MULTI} [data-karmo-nick], [data-karmo-link="tint"] .${MULTI} [data-karmo-nick] {
      background: var(--karmo-c); color: #fff !important; border-radius: 9px; padding: 0 6px; text-decoration: none; }
    .${LIKE} { background: rgba(255, 92, 140, .14) !important; }
    .${HL} { background: color-mix(in srgb, var(--karmo-c, #f0a000) 26%, transparent) !important; outline: 2px solid var(--karmo-c, #f0a000); outline-offset: -2px; }
    .${PANEL} { position: fixed; left: 8px; top: 110px; width: 190px; padding: 8px 10px; z-index: 50; border: 1px solid #ccc; border-radius: 4px;
      font: 12px/1.5 system-ui, sans-serif; color: #333; background: rgba(255,255,255,.96); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
    .${PANEL} b { display: block; margin-bottom: 4px; font-size: 12px; color: #666; }
    .${PANEL} div { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
    .${PANEL} div:hover { background: rgba(128,128,128,.14); }
    .${PANEL} i { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--karmo-c); }
    .${PANEL} span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${PANEL} em { margin-left: auto; font-style: normal; color: #888; }
    @media (max-width: 1500px) { .${PANEL} { display: none; } }
    .${BLOCK} { margin: 16px 0; padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px; font: 13px/1.5 system-ui, sans-serif; color: #444; background: rgba(128,128,128,.08); box-sizing: border-box; }
    .${BLOCK} summary { cursor: pointer; font-weight: 600; }
    .${BLOCK} .tools { margin: 6px 0; font-size: 12px; }
    .${BLOCK} .tools button, .${BLOCK} li button, .${BLOCK} .un { all: unset; cursor: pointer; font-size: 12px; color: #666; border: 1px solid #bbb; border-radius: 2px; padding: 0 6px; background: #fff; }
    .${BLOCK} .tools button.on { color: #fff; background: #555; border-color: #555; }
    .${BLOCK} .un { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 2; }
    .${BLOCK} .un:hover, .${BLOCK} li button:hover { color: #080; border-color: #080; }
    .${BLOCK} .board-article, .${BLOCK} .article-list { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
    .${BLOCK} .vrow.column { position: relative; padding-right: 5.5rem; }
    .${BLOCK} h4 { margin: 10px 0 2px; font-size: 13px; }
    .${BLOCK} ul { list-style: none; margin: 0; padding: 0; }
    .${BLOCK} li { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; border-top: 1px solid rgba(128,128,128,.2); }
    .${BLOCK} li a { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${BLOCK} li .nm { flex: none; color: #888; }
    .${BLOCK} li button { margin-left: auto; flex: none; }
  `;
  document.documentElement.appendChild(style);

  /* 유저마다 고정 색. 좋아요의 분홍 (330 부근) 을 피한다 */
  const colorOf = (key) => {
    let h = 0;
    for (const c of key) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `hsl(${20 + ((h * 47) % 290)} 70% 42%)`;
  };

  function start({ site, footer, listBox, scan }) {
    let blockMap = {};
    let likeMap = {};
    let settings = { ...DEFAULTS };
    let queued = false;
    let hidden = [];
    let blockSig = "";
    let panelSig = "";
    let hlKey = null;
    const turn = new Map();

    function edit(storeKey, fn) {
      chrome.storage.local.get({ [storeKey]: {} }, (items) => {
        const all = items[storeKey] || {};
        all[site] = all[site] || {};
        fn(all[site]);
        chrome.storage.local.set({ [storeKey]: all });
      });
    }
    const setBlock = (key, name) => edit(K.block, (s) => { s[key] = { name, at: new Date().toISOString() }; });
    const unblock = (key) => edit(K.block, (s) => { delete s[key]; });
    const toggleLike = (key, name) => edit(K.like, (s) => { if (s[key]) delete s[key]; else s[key] = { name, at: new Date().toISOString() }; });
    const setSetting = (patch) => chrome.storage.local.get({ [K.settings]: {} }, (i) => chrome.storage.local.set({ [K.settings]: { ...(i[K.settings] || {}), ...patch } }));

    const rowsOf = (key) => [...document.querySelectorAll("[data-karmo-row]")].filter((r) => r.dataset.karmoRow === key && !r.classList.contains(HIDDEN));

    const api = {
      isBlocked: (key) => Object.prototype.hasOwnProperty.call(blockMap, key),
      /** 제자리에서 숨기고 아래 블록에 info { key, name, kind, el, label, href } 를 올린다 */
      hide(el, info) {
        el.classList.add(HIDDEN);
        if (info) hidden.push({ ...info, el });
      },
      /** row: 강조와 색 표시의 대상 줄 (글, 댓글), nick: 닉네임 요소 */
      tag(row, key, nick) {
        if (row) row.dataset.karmoRow = key;
        if (nick) nick.dataset.karmoNick = key;
      },
      /** anchor 바로 뒤에 좋아요와 차단 버튼을 한 번만 단다. 좋아요 상태는 매번 맞춘다 */
      addButtons(anchor, key, name) {
        let w = anchor.nextElementSibling;
        if (!(w && w.classList.contains(BTNS))) {
          w = document.createElement("span");
          w.className = BTNS;
          const mk = (cls, text, title, fn) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = cls;
            b.textContent = text;
            b.title = title;
            b.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              fn();
            });
            return b;
          };
          w.append(mk("like", "♥", `${name} 좋아요`, () => toggleLike(key, name)), mk("x", "×", `${name} 차단`, () => setBlock(key, name)));
          anchor.after(w);
        }
        w.querySelector(".like").classList.toggle("on", !!likeMap[key]);
      },
    };

    /* 같은 유저의 줄을 모두 강조 (줄에 마우스, 또는 패널 항목에 마우스) */
    function highlightKey(key, from) {
      if (hlKey === key) return;
      hlKey = key;
      document.querySelectorAll(`.${HL}`).forEach((el) => el.classList.remove(HL));
      if (key == null) return;
      const rows = rowsOf(key);
      if (rows.length < 2) return;
      rows.forEach((r) => r.classList.add(HL));
      const x = from?.querySelector?.(`.${BTNS} .x`);
      if (x) x.title = `${x.title.replace(/ \(.*\)$/, "")} (이 페이지 ${rows.length}건)`;
    }
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest?.(`.${PANEL}`)) return;
      const row = e.target.closest?.("[data-karmo-row]");
      highlightKey(row ? row.dataset.karmoRow : null, row);
    });

    /* 줄마다 좋아요 바탕, 두 줄 이상 쓴 유저에 색과 건수. 패널은 다작 순 */
    function decorate() {
      const by = new Map();
      for (const r of document.querySelectorAll("[data-karmo-row]")) {
        if (r.classList.contains(HIDDEN)) continue;
        const k = r.dataset.karmoRow;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(r);
      }
      const multis = [];
      for (const [key, rs] of by) {
        const multi = rs.length >= 2;
        const c = colorOf(key);
        for (const r of rs) {
          r.classList.toggle(MULTI, multi);
          r.classList.toggle(LIKE, !!likeMap[key]);
          if (multi) r.style.setProperty("--karmo-c", c);
          else r.style.removeProperty("--karmo-c");
          const nick = r.querySelector("[data-karmo-nick]");
          if (nick) nick.title = `이 페이지 ${rs.length}건`;
        }
        if (multi) multis.push({ key, n: rs.length, c, name: rs[0].querySelector("[data-karmo-nick]")?.textContent.trim() || key, rows: rs });
      }
      renderPanel(multis.sort((p, q) => q.n - p.n || p.name.localeCompare(q.name, "ko")));
    }

    function renderPanel(multis) {
      let box = document.querySelector(`.${PANEL}`);
      const show = settings.panel && settings.linkStyle !== "off" && multis.length > 0;
      if (!show) {
        box?.remove();
        panelSig = "";
        return;
      }
      const sig = multis.map((m) => `${m.key}|${m.n}|${!!likeMap[m.key]}`).join("\n");
      if (sig === panelSig && box) return;
      panelSig = sig;
      if (!box) {
        box = document.createElement("aside");
        box.className = PANEL;
        document.body.append(box);
      }
      box.textContent = "";
      const t = document.createElement("b");
      t.textContent = "이 페이지 여러 글 쓴 유저";
      box.append(t);
      for (const m of multis) {
        const row = document.createElement("div");
        row.style.setProperty("--karmo-c", m.c);
        const dot = document.createElement("i");
        const nm = document.createElement("span");
        nm.textContent = (likeMap[m.key] ? "♥ " : "") + m.name;
        const n = document.createElement("em");
        n.textContent = `${m.n}건`;
        row.append(dot, nm, n);
        row.addEventListener("mouseenter", () => highlightKey(m.key));
        row.addEventListener("mouseleave", () => highlightKey(null));
        row.addEventListener("click", () => {
          const rows = rowsOf(m.key);
          const i = ((turn.get(m.key) ?? -1) + 1) % rows.length;
          turn.set(m.key, i);
          rows[i]?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        box.append(row);
      }
    }

    /* 하단 블록을 목록의 왼쪽과 폭에 맞춘다 (화면 중앙이 아니라) */
    function alignBlock(box) {
      const lb = listBox && document.querySelector(listBox);
      const host = box.parentElement;
      if (!lb || !host) return;
      const r = lb.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      box.style.marginLeft = `${Math.max(0, Math.round(r.left - h.left))}px`;
      box.style.width = `${Math.round(r.width)}px`;
    }

    /* 숨긴 줄 모음. 글은 사이트의 글 목록 모양 그대로 (줄을 복제), 이름순이 기본. 내용이 같으면 DOM 을 건드리지 않음 */
    function renderBlock() {
      const sig = settings.blockSort + "\n" + hidden.map((h) => `${h.kind}|${h.key}|${h.href}|${h.label}`).join("\n");
      let box = document.querySelector(`.${BLOCK}`);
      if (sig === blockSig) {
        if (box) alignBlock(box);
        return;
      }
      blockSig = sig;
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
      const byName = settings.blockSort === "name";
      const idOf = (h) => Number(h.id) || 0;
      const sorter = (p, q) => (byName ? p.name.localeCompare(q.name, "ko") || idOf(q) - idOf(p) : idOf(q) - idOf(p));
      const posts = hidden.filter((h) => h.kind === "post").sort(sorter);
      const others = hidden.filter((h) => h.kind !== "post").sort(sorter);

      const sum = document.createElement("summary");
      sum.textContent = `차단한 유저의 글 ${hidden.length}개`;
      const tools = document.createElement("div");
      tools.className = "tools";
      tools.append("정렬 ");
      for (const [v, t] of [["name", "이름순"], ["id", "번호순"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t;
        b.className = settings.blockSort === v ? "on" : "";
        b.addEventListener("click", () => setSetting({ blockSort: v }));
        tools.append(b, " ");
      }
      box.append(sum, tools);

      if (posts.length) {
        /* 사이트 CSS 는 .body .board-article .article-list .list-table 아래에만 걸린다. 조상 클래스를 맞춤 */
        const wrap = document.createElement("div");
        wrap.className = "board-article";
        const inner = document.createElement("div");
        inner.className = "article-list";
        wrap.append(inner);
        const table = document.createElement("div");
        table.className = "list-table table";
        const head = document.querySelector(".list-table .vrow.head");
        if (head) table.append(head.cloneNode(true));
        for (const h of posts) {
          const c = h.el.cloneNode(true);
          c.classList.remove(HIDDEN, HL, LIKE, MULTI);
          c.removeAttribute("data-karmo-row");
          c.style.removeProperty("--karmo-c");
          c.querySelectorAll(`.${BTNS}`).forEach((n) => n.remove());
          const un = document.createElement("button");
          un.type = "button";
          un.className = "un";
          un.textContent = "차단 해제";
          un.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); unblock(h.key); });
          c.append(un);
          table.append(c);
        }
        inner.append(table);
        box.append(wrap);
      }
      if (others.length) {
        const h4 = document.createElement("h4");
        h4.textContent = "댓글과 그 밖";
        const ul = document.createElement("ul");
        for (const h of others) {
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
        box.append(h4, ul);
      }
      if (open) box.open = true;
      alignBlock(box);
    }

    function run() {
      queued = false;
      hidden = [];
      scan(document, api);
      decorate();
      renderBlock();
    }
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }

    function load(items) {
      blockMap = (items[K.block] || {})[site] || {};
      likeMap = (items[K.like] || {})[site] || {};
      settings = { ...DEFAULTS, ...(items[K.settings] || {}) };
      if (!STYLES.includes(settings.linkStyle)) settings.linkStyle = DEFAULTS.linkStyle; // 옛 값 (lines, stripe)
      document.documentElement.dataset.karmoLink = settings.linkStyle;
      // 해제 반영: 숨김을 모두 지우고 다시 검사
      document.querySelectorAll(`.${HIDDEN}`).forEach((el) => el.classList.remove(HIDDEN));
      blockSig = "\0";
      panelSig = "";
      schedule();
    }
    const read = () => chrome.storage.local.get({ [K.block]: {}, [K.like]: {}, [K.settings]: {} }, load);
    read();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && (ch[K.block] || ch[K.like] || ch[K.settings])) read();
    });
    const ours = (n) => n.nodeType === 1 && (n.classList.contains(PANEL) || n.classList.contains(BLOCK) || n.classList.contains(BTNS));
    new MutationObserver((muts) => {
      const own = (m) => m.target.closest?.(`.${BLOCK}, .${PANEL}`) || (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(ours));
      if (muts.every(own)) return;
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
  }

  globalThis.KarmoBlock = { start };
})();
