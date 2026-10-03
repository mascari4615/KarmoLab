/**
 * 유저 차단, 좋아요 공통 코어. 아카라이브, 이후 디시와 유튜브 공용
 * 저장 (chrome.storage.local), 모두 { site: { key: { name, at } } }
 *   blocklist: 차단. 제자리 숨김, 페이지 맨 아래 (footer 앞) 접힌 블록에 모음
 *   likelist: 좋아요. 올리지 않아도 줄 바탕을 분홍으로 강조
 *   karmoSettings: { linkStyle: lines | stripe | off, blockSort: name | id }
 * 한 페이지에 두 줄 이상 쓴 유저는 유저마다 색을 주어 이어 보인다 (linkStyle)
 * 사용: 어댑터가 KarmoBlock.start({ site, footer, listBox, scan }), 화면이 바뀔 때마다 scan(root, api)
 */
(() => {
  if (globalThis.KarmoBlock) return;

  const K = { block: "blocklist", like: "likelist", settings: "karmoSettings" };
  const DEFAULTS = { linkStyle: "lines", blockSort: "name" };
  const HIDDEN = "karmo-blocked";
  const BTNS = "karmo-btns";
  const HL = "karmo-hl";
  const LIKE = "karmo-like";
  const MULTI = "karmo-multi";
  const BLOCK = "karmo-blocked-block";
  const LINES = "karmo-lines";

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
    .${LIKE} { background: rgba(255, 92, 140, .14) !important; }
    [data-karmo-link="stripe"] .${MULTI} { box-shadow: inset 5px 0 0 var(--karmo-c); }
    [data-karmo-link="lines"] .${MULTI} .user-info [data-filter], [data-karmo-link="stripe"] .${MULTI} .user-info [data-filter] { text-decoration: underline 3px var(--karmo-c); text-underline-offset: 3px; }
    .${HL} { background: color-mix(in srgb, var(--karmo-c, #f0a000) 24%, transparent) !important; outline: 2px solid var(--karmo-c, #f0a000); outline-offset: -2px; }
    .${LINES} { position: absolute; top: 0; pointer-events: none; z-index: 5; overflow: visible; }
    .${BLOCK} { margin: 16px auto; max-width: 1100px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px; font: 13px/1.5 system-ui, sans-serif; color: #444; background: rgba(128,128,128,.08); }
    .${BLOCK} summary { cursor: pointer; font-weight: 600; }
    .${BLOCK} .tools { margin: 6px 0; font-size: 12px; }
    .${BLOCK} .tools button, .${BLOCK} li button, .${BLOCK} .un { all: unset; cursor: pointer; font-size: 12px; color: #666; border: 1px solid #bbb; border-radius: 2px; padding: 0 6px; background: #fff; }
    .${BLOCK} .tools button.on { color: #fff; background: #555; border-color: #555; }
    .${BLOCK} .un { position: absolute; right: 4px; top: 4px; z-index: 2; }
    .${BLOCK} .un:hover, .${BLOCK} li button:hover { color: #080; border-color: #080; }
    .${BLOCK} .board-article, .${BLOCK} .article-list { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
    .${BLOCK} .vrow.column { position: relative; padding-right: 5.5rem; }
    .${BLOCK} .un { right: 8px; top: 50%; transform: translateY(-50%); }
    .${BLOCK} h4 { margin: 10px 0 2px; font-size: 13px; }
    .${BLOCK} ul { list-style: none; margin: 0; padding: 0; }
    .${BLOCK} li { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; border-top: 1px solid rgba(128,128,128,.2); }
    .${BLOCK} li a { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${BLOCK} li .nm { flex: none; color: #888; }
    .${BLOCK} li button { margin-left: auto; flex: none; }
  `;
  document.documentElement.appendChild(style);

  const colorOf = (key) => {
    let h = 0;
    for (const c of key) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `hsl(${(h * 47) % 360} 72% 42%)`;
  };

  function start({ site, footer, listBox, scan }) {
    let blockMap = {};
    let likeMap = {};
    let settings = { ...DEFAULTS };
    let queued = false;
    let hidden = [];
    let blockSig = "";
    let linesSig = "";
    let hlKey = null;
    let ro = null;

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
      /** row: 강조와 이어 보이기의 대상 줄 (글, 댓글) */
      tag(row, key) {
        if (row) row.dataset.karmoRow = key;
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

    /* 줄에 마우스: 같은 유저의 줄을 모두 강조, 버튼 툴팁에 건수 */
    function highlight(row) {
      const key = row ? row.dataset.karmoRow : null;
      if (hlKey === key) return;
      hlKey = key;
      document.querySelectorAll(`.${HL}`).forEach((el) => el.classList.remove(HL));
      if (key == null) return;
      const rows = rowsOf(key);
      if (rows.length < 2) return;
      rows.forEach((r) => r.classList.add(HL));
      const x = row.querySelector(`.${BTNS} .x`);
      if (x) x.title = `${x.title.replace(/ \(.*\)$/, "")} (이 페이지 ${rows.length}건)`;
    }
    document.addEventListener("mouseover", (e) => highlight(e.target.closest?.("[data-karmo-row]") || null));

    /* 줄마다 좋아요 바탕, 두 줄 이상 쓴 유저에 색 */
    function decorate() {
      const by = new Map();
      for (const r of document.querySelectorAll("[data-karmo-row]")) {
        if (r.classList.contains(HIDDEN)) continue;
        const k = r.dataset.karmoRow;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(r);
      }
      for (const [key, rs] of by) {
        const multi = rs.length >= 2;
        const c = colorOf(key);
        for (const r of rs) {
          r.classList.toggle(MULTI, multi);
          r.classList.toggle(LIKE, !!likeMap[key]);
          if (multi) r.style.setProperty("--karmo-c", c);
          else r.style.removeProperty("--karmo-c");
        }
      }
    }

    /* 왼쪽 여백에 유저별 세로선. 같은 유저의 줄마다 점, 첫 줄과 끝 줄 사이를 선으로 */
    function drawLines() {
      const box = listBox && document.querySelector(listBox);
      const old = document.querySelector(`.${LINES}`);
      if (!box || settings.linkStyle !== "lines") {
        old?.remove();
        linesSig = "";
        return;
      }
      const br = box.getBoundingClientRect();
      const groups = new Map();
      for (const r of box.querySelectorAll(`[data-karmo-row].${MULTI}`)) {
        const rr = r.getBoundingClientRect();
        const k = r.dataset.karmoRow;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(Math.round(rr.top - br.top + rr.height / 2));
      }
      const gs = [...groups].map(([k, ys]) => ({ k, ys, a: Math.min(...ys), b: Math.max(...ys) })).sort((p, q) => p.a - q.a);
      const lastEnd = [];
      for (const g of gs) {
        let c = lastEnd.findIndex((e) => e < g.a - 2);
        if (c < 0) c = lastEnd.length;
        lastEnd[c] = g.b;
        g.col = c;
      }
      const cols = lastEnd.length;
      /* 사이트 컨테이너가 바깥을 잘라내므로 목록 왼쪽 안쪽 패딩 (약 14px) 안에만 그린다. 실측 2026-10-03 */
      const room = 14;
      const gap = Math.max(3, Math.min(7, (room - 3) / Math.max(cols, 1)));
      const width = room + 2;
      const sig = JSON.stringify([gs.map((g) => [g.k, g.ys, g.col]), gap, Math.round(br.left)]);
      if (sig === linesSig && old) return;
      linesSig = sig;
      old?.remove();
      if (!gs.length) return;
      if (getComputedStyle(box).position === "static") box.style.position = "relative";
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", LINES);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(Math.round(br.height)));
      svg.style.left = `${-room - 1}px`;
      for (const g of gs) {
        const x = 3 + g.col * gap;
        const col = colorOf(g.k);
        const ln = document.createElementNS(NS, "line");
        ln.setAttribute("x1", String(x)); ln.setAttribute("x2", String(x));
        ln.setAttribute("y1", String(g.a)); ln.setAttribute("y2", String(g.b));
        ln.setAttribute("stroke", col); ln.setAttribute("stroke-width", "3"); ln.setAttribute("stroke-opacity", ".7");
        svg.append(ln);
        for (const y of g.ys) {
          const d = document.createElementNS(NS, "circle");
          d.setAttribute("cx", String(x)); d.setAttribute("cy", String(y)); d.setAttribute("r", "4.2"); d.setAttribute("fill", col);
          svg.append(d);
        }
      }
      box.append(svg);
      if (!ro && globalThis.ResizeObserver) {
        ro = new ResizeObserver(() => { linesSig = ""; schedule(); });
        ro.observe(box);
      }
    }

    /* 숨긴 줄 모음. 글은 사이트의 글 목록 모양 그대로 (줄을 복제), 이름순이 기본. 내용이 같으면 DOM 을 안 건드림 */
    function renderBlock() {
      const sig = settings.blockSort + "\n" + hidden.map((h) => `${h.kind}|${h.key}|${h.href}|${h.label}`).join("\n");
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
    }

    function run() {
      queued = false;
      hidden = [];
      scan(document, api);
      decorate();
      renderBlock();
      drawLines();
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
      document.documentElement.dataset.karmoLink = settings.linkStyle;
      // 해제 반영: 숨김을 모두 지우고 다시 검사
      document.querySelectorAll(`.${HIDDEN}`).forEach((el) => el.classList.remove(HIDDEN));
      blockSig = "\0";
      linesSig = "";
      schedule();
    }
    const read = () => chrome.storage.local.get({ [K.block]: {}, [K.like]: {}, [K.settings]: {} }, load);
    read();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && (ch[K.block] || ch[K.like] || ch[K.settings])) read();
    });
    const ours = (n) => n.nodeType === 1 && (n.classList.contains(LINES) || n.classList.contains(BLOCK) || n.classList.contains(BTNS));
    new MutationObserver((muts) => {
      const own = (m) => m.target.closest?.(`.${BLOCK}`) || (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(ours));
      if (muts.every(own)) return;
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", () => { linesSig = ""; schedule(); });
  }

  globalThis.KarmoBlock = { start };
})();
