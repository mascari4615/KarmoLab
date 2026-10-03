/**
 * 차단 직후 하단 왼쪽에 뜨는 토스트: 사유 칩, 기간, 메모, 되돌리기
 * 화면 부품만 담당. 저장은 block-core.js 가 넘기는 콜백이 함
 */
(() => {
  if (globalThis.KarmoToast) return;

  const CLS = "karmo-toast";
  const style = document.createElement("style");
  style.textContent = `
    .${CLS} { position: fixed; left: 14px; bottom: 14px; z-index: 2147483000; width: 330px; padding: 10px 12px; border-radius: 6px;
      font: 13px/1.5 system-ui, sans-serif; color: #eee; background: rgba(35,35,40,.96); box-shadow: 0 2px 10px rgba(0,0,0,.35); }
    .${CLS} .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 6px; }
    .${CLS} .row:first-child { margin-top: 0; }
    .${CLS} strong { font-weight: 600; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
    .${CLS} .lab { color: #aaa; font-size: 12px; margin-right: 2px; }
    .${CLS} button { all: unset; cursor: pointer; padding: 1px 8px; font-size: 12px; border: 1px solid #777; border-radius: 10px; color: #ddd; }
    .${CLS} button:hover { border-color: #fff; color: #fff; }
    .${CLS} button.on { background: #e8590c; border-color: #e8590c; color: #fff; }
    .${CLS} button.undo { border-radius: 3px; border-color: #aaa; }
    .${CLS} input { flex: 1; min-width: 0; padding: 2px 6px; font-size: 12px; border: 1px solid #666; border-radius: 3px; color: #eee; background: #222; }
  `;
  document.documentElement.appendChild(style);

  /**
   * 인자 days: 영구는 0
   * @param {{ title: string, tags: string[], reason?: string, days?: number, note?: string,
   *   onReason: (tag: string|null) => void, onDays: (days: number) => void, onNote: (text: string) => void,
   *   onUndo: () => void, ms?: number }} o
   */
  function show(o) {
    document.querySelector(`.${CLS}`)?.remove();
    const box = document.createElement("div");
    box.className = CLS;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => box.remove(), o.ms ?? 12000);
    };
    const btn = (text, cls = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      if (cls) b.className = cls;
      return b;
    };
    const row = () => {
      const r = document.createElement("div");
      r.className = "row";
      box.append(r);
      return r;
    };

    const head = row();
    const t = document.createElement("strong");
    t.textContent = `${o.title} 차단됨`;
    const undo = btn("되돌리기", "undo");
    undo.addEventListener("click", () => {
      o.onUndo();
      box.remove();
    });
    head.append(t, undo);

    const tagRow = row();
    const lab = document.createElement("span");
    lab.className = "lab";
    lab.textContent = "사유";
    tagRow.append(lab);
    let reason = o.reason || null;
    const chips = o.tags.map((tag) => {
      const b = btn(tag, tag === reason ? "on" : "");
      b.addEventListener("click", () => {
        reason = reason === tag ? null : tag;
        for (const c of chips) c.classList.toggle("on", c.textContent === reason);
        o.onReason(reason);
        arm();
      });
      return b;
    });
    tagRow.append(...chips);

    const dayRow = row();
    const lab2 = document.createElement("span");
    lab2.className = "lab";
    lab2.textContent = "기간";
    dayRow.append(lab2);
    const dayBtns = [[0, "영구"], [7, "7일"], [30, "30일"]].map(([d, text]) => {
      const b = btn(text, d === (o.days || 0) ? "on" : "");
      b.addEventListener("click", () => {
        for (const x of dayBtns) x.classList.toggle("on", x === b);
        o.onDays(d);
        arm();
      });
      return b;
    });
    dayRow.append(...dayBtns);

    const noteRow = row();
    const note = document.createElement("input");
    note.type = "text";
    note.placeholder = "메모 (엔터로 저장)";
    note.value = o.note || "";
    note.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        o.onNote(note.value.trim());
        note.blur();
        arm();
      }
    });
    note.addEventListener("input", () => clearTimeout(timer));
    noteRow.append(note);

    box.addEventListener("mouseenter", () => clearTimeout(timer));
    box.addEventListener("mouseleave", arm);
    document.body.append(box);
    arm();
    return box;
  }

  globalThis.KarmoToast = { show, CLS };
})();
