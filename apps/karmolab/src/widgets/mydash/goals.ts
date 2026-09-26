/**
 * 패널: 목표 (옛 커리어 방 자리). 게임 로비 + 임무 창.
 *
 * 시안 L4 (memo `notes/mydash/design/skill-bench/lobby2-build.mjs`, 사용자 2026-09-26 "L4?", "일단 구현해보자").
 * 로비는 담당 캐릭터 (알리사) 가 화면을 채우고 UI 는 가장자리에만. 사용자 "카드가 캐릭터를 많이 가려서" (L5 기각 이유)
 *
 * ## 읽는 것
 *
 * - `data/goals/goals.json` (schema `goals/1`). 가지, 주마다 할 일, 한 것. 정본은 memo `life/goals.md`, 이 파일은 사람이 고침
 * - 이벤트 브랜치 `goals/events/<YYYY-MM>/<epoch>-<device6>-<nonce4>.json`. 북마크와 같은 추가 전용
 *
 * ## 이벤트 (v 1)
 *
 * | type | target | value | 뜻 |
 * | --- | --- | --- | --- |
 * | `todo.add` | 새 할 일 id | `{ branch, text }` | `week` 주에 할 일 하나 |
 * | `todo.check` | 할 일 id | boolean | 끝남 또는 되돌림. 마지막 것이 이김 |
 * | `want.add` | 새 id | 글 한 줄 | 하고 싶은 것 |
 * | `rest` | 주 (월요일 날짜) | boolean | 그 주 쉬기. 벌 없음 |
 * | `step` | 가지 id | 글 한 줄 | 다음 단계 고침 |
 *
 * ## 안 하는 것
 *
 * - 레벨 규칙은 미정 (사용자 결정 전). 화면은 "Lv -"
 * - 캐릭터 대사 없음. 누르면 살짝 움직일 뿐 (욘 표정은 성적과 안 묶음, 2026-09-25 결정과 같은 결)
 * - 지어낸 문구 없음. 빈 것은 빈 채로
 */
import { dashRegistry, esc } from "./kit";
import type { DashPanelCtx, DashRepoWrite } from "./kit";
import { t, loadNamespace } from "../../lib/i18n";

(function (): void {
  "use strict";

  type Branch = {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    step?: string;
    due?: string | null;
  };
  type Todo = { id: string; branch: string; text: string };
  type DoneRow = { date: string; branch: string; text: string };
  type Goals = {
    schema?: string;
    branches?: Branch[];
    weeks?: Record<string, { todos?: Todo[] }>;
    done?: DoneRow[];
  };
  type Ev = {
    v: 1;
    type: string;
    target: string;
    value: unknown;
    week?: string;
    at: number;
    dev?: string;
  };

  const DATA_PATH = "data/goals/goals.json";
  const EVENTS_DIR = "goals/events";
  const IMG = "/apps/karmolab/img/widgets/mydash/goals/";
  const BANNER_IMG = "/apps/karmolab/img/widgets/mydash/yawn-stand.webp";
  const KST_MS = 9 * 3600000;
  const DAY_MS = 86400000;
  const READ_LIMIT = 6;
  const COLORS = ["o", "b", "p", "g", "r"];

  /* ── 날짜. 전부 KST ── */
  function kstDate(ms: number): Date {
    return new Date(ms + KST_MS);
  }
  function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  /** 이번 주 월요일 (KST) */
  function weekOf(ms: number): string {
    const d = kstDate(ms);
    const back = (d.getUTCDay() + 6) % 7;
    return ymd(new Date(d.getTime() - back * DAY_MS));
  }
  function addDays(day: string, n: number): string {
    return ymd(new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS));
  }
  function md(day: string): string {
    return Number(day.slice(5, 7)) + "/" + Number(day.slice(8, 10));
  }
  /** "9월 넷째 주". 그 주 월요일이 속한 달, 달의 몇 번째 월요일 */
  function weekName(monday: string): string {
    const nth = Math.floor((Number(monday.slice(8, 10)) - 1) / 7);
    const words = ["첫째", "둘째", "셋째", "넷째", "다섯째"];
    return t(
      "mydash.gl.weekName",
      { m: Number(monday.slice(5, 7)), n: words[nth] },
      "{m}월 {n} 주",
    );
  }
  function dday(due: string | null | undefined, now: number): string {
    if (!due) return "";
    const left = Math.round(
      (Date.parse(due + "T00:00:00Z") -
        Date.parse(ymd(kstDate(now)) + "T00:00:00Z")) /
        DAY_MS,
    );
    return left >= 0 ? "D-" + left : "D+" + -left;
  }

  function color(c: string | undefined): string {
    return COLORS.indexOf(c || "") >= 0 ? (c as string) : "o";
  }
  function icon(name: string | undefined, cls = ""): string {
    const n = (name || "branch").replace(/[^a-z]/g, "");
    return (
      '<i class="gl-ic' +
      (cls ? " " + cls : "") +
      '" style="--gl-m:url(' +
      IMG +
      n +
      '.png)"></i>'
    );
  }

  /* ── 이벤트 ── */
  function isEv(raw: unknown): raw is Ev {
    const e = raw as Ev;
    return (
      !!e &&
      e.v === 1 &&
      typeof e.type === "string" &&
      typeof e.target === "string" &&
      typeof e.at === "number"
    );
  }

  async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (x: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    async function worker(): Promise<void> {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return out;
  }

  async function loadEvents(repo: DashRepoWrite): Promise<Ev[]> {
    const ref = repo.eventsBranch;
    const entries = await repo.tree(ref).catch(() => []);
    const want = entries.filter(
      (e) =>
        e.type === "file" &&
        e.path.indexOf(EVENTS_DIR + "/") === 0 &&
        /\.json$/i.test(e.name),
    );
    const read = await mapLimit(want, READ_LIMIT, (f) =>
      repo.readJson<unknown>(f.path, { ref }).catch(() => null),
    );
    return read.filter(isEv).sort((a, b) => a.at - b.at);
  }

  const STYLE_ID = "mydash-goals-style";
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    /* 색과 글자 크기는 dash.css 의 --gl-* 와 --font-size-* 토큰. 여기는 자리와 크기만 */
    el.textContent = [
      ".gl{--gl-o:var(--gl-c-o);--gl-b:var(--gl-c-b);--gl-p:var(--gl-c-p);--gl-g:var(--gl-c-g);--gl-r:var(--gl-c-r);color:var(--text-primary)}",
      ".gl-ic{display:inline-block;width:var(--gl-s,28px);height:var(--gl-s,28px);flex:none;background:var(--gl-icc,var(--gl-ink));",
      "-webkit-mask:var(--gl-m) center/contain no-repeat;mask:var(--gl-m) center/contain no-repeat}",
      ".gl [data-c=o]{--c:var(--gl-o)}.gl [data-c=b]{--c:var(--gl-b)}.gl [data-c=p]{--c:var(--gl-p)}.gl [data-c=g]{--c:var(--gl-g)}.gl [data-c=r]{--c:var(--gl-r)}",
      ".gl button{font:inherit;color:inherit;cursor:pointer}.gl .gl-qb,.gl .gl-nv{white-space:nowrap}",
      ".gl-bar{height:6px;background:var(--gl-cell);overflow:hidden}.gl-bar i{display:block;height:100%;background:var(--accent);transition:width .2s}",
      ".gl-badge{position:absolute;right:6px;top:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:var(--radius-gl-badge);background:var(--gl-bad);color:var(--gl-on);",
      "font-size:var(--font-size-2xs);font-weight:700;display:grid;place-items:center}.gl-badge[hidden]{display:none}",
      /* 로비. PC 는 화면 전체 층 위에 가장자리 UI */
      ".gl-ch{display:none}",
      "@media(min-width:900px){",
      ".gl{position:fixed;inset:0;z-index:1;pointer-events:none}",
      ".gl>*{pointer-events:auto}",
      ".gl-ch{display:block;position:absolute;left:30%;top:50px;height:145vh;pointer-events:auto;cursor:pointer;transition:transform .25s;filter:drop-shadow(0 10px 30px var(--gl-shade))}",
      ".gl-ch.bump{transform:translateY(-10px)}",
      ".gl-plate{position:absolute;left:170px;top:10px;height:52px;display:flex;align-items:center;background:linear-gradient(100deg,var(--gl-navy),var(--gl-blue));color:var(--gl-on);",
      "clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%);padding:0 34px 0 0}",
      ".gl-plate .wn{height:100%;padding:0 14px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:var(--gl-on-veil);font-size:var(--font-size-3xs);line-height:1}",
      ".gl-plate .wn b{font-size:var(--font-size-display-sm);line-height:1}",
      ".gl-plate .nm{padding-left:12px;display:flex;flex-direction:column;gap:4px}.gl-plate .nm b{font-size:var(--font-size-sm)}",
      ".gl-plate small{font-size:var(--font-size-2xs);display:flex;align-items:center;gap:8px}",
      ".gl-plate .gl-bar{width:120px;height:5px;background:var(--gl-on-veil2)}.gl-plate .gl-bar i{background:var(--gl-on)}",
      ".gl-res{position:absolute;right:24px;top:16px;display:flex;gap:10px}",
      ".gl-r{display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 10px;min-width:150px;background:var(--dash-glass-strong);border:1px solid var(--border);font-weight:700;font-size:var(--font-size-sm)}",
      ".gl-r .gl-ic{--gl-s:22px}.gl-r span{flex:1;text-align:left}.gl-r small{font-weight:400;color:var(--text-secondary);font-size:var(--font-size-2xs)}",
      ".gl-r em{width:24px;height:24px;display:grid;place-items:center;background:var(--gl-blue);color:var(--gl-on);font-style:normal}",
      ".gl-quick{position:absolute;left:24px;top:100px;display:grid;grid-template-columns:repeat(2,96px);gap:14px 6px}",
      ".gl-qb{position:relative;white-space:nowrap;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;font-size:var(--font-size-2xs);font-weight:700;",
      "text-shadow:0 0 6px var(--dash-glass-strong)}.gl-qb .gl-ic{--gl-s:46px}",
      ".gl-rest{position:absolute;right:24px;top:96px;width:92px;height:92px;border-radius:50%;border:3px solid var(--dash-edge);background:var(--dash-glass-strong);",
      "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-weight:900;font-size:var(--font-size-2xs);box-shadow:0 6px 18px var(--gl-shade)}",
      ".gl-rest .gl-ic{--gl-s:40px}.gl-rest.on{background:var(--accent);color:var(--gl-on)}.gl-rest.on .gl-ic{--gl-icc:var(--gl-on)}",
      ".gl-banner{position:absolute;left:24px;bottom:112px;width:360px;height:150px;overflow:hidden;border:2px solid var(--dash-edge);box-shadow:0 8px 24px var(--gl-shade);",
      "background:linear-gradient(110deg,var(--gl-navy),var(--gl-blue));color:var(--gl-on)}",
      ".gl-bn{position:absolute;inset:0;opacity:0;transition:opacity .5s;display:flex;align-items:flex-end;border:0;background:none;padding:0;width:100%;text-align:left}.gl-bn.on{opacity:1}",
      ".gl-bn img{position:absolute;right:-10px;top:-20px;height:240px}",
      ".gl-bn>.gl-ic{position:absolute;right:30px;top:24px;--gl-s:96px;--gl-icc:var(--gl-on-veil3)}",
      ".gl-bt{position:relative;padding:12px 16px;display:flex;flex-direction:column;gap:2px;background:linear-gradient(90deg,var(--gl-shade),transparent)}",
      ".gl-bt small{font-size:var(--font-size-2xs)}.gl-bt b{font-size:var(--font-size-title);font-weight:900}.gl-bt span{font-size:var(--font-size-xs)}",
      ".gl-bn em{position:absolute;left:12px;top:10px;font-style:normal;font-weight:900;font-size:var(--font-size-sm);background:var(--c);padding:3px 10px;",
      "clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}",
      ".gl-dots{position:absolute;right:10px;bottom:8px;display:flex;gap:5px}.gl-dots i{width:8px;height:8px;border-radius:50%;background:var(--gl-on-veil2)}.gl-dots i.on{background:var(--gl-on)}",
      ".gl-quest{position:absolute;right:24px;bottom:110px;width:300px;height:118px;border:0;color:var(--gl-on);text-align:left;",
      "background:linear-gradient(110deg,var(--accent),var(--gl-acc2));clip-path:polygon(16px 0,100% 0,100% 100%,0 100%,0 16px);box-shadow:0 8px 24px var(--gl-shade);",
      "padding:14px 18px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:center}",
      ".gl-quest .gl-ic{--gl-s:64px;--gl-icc:var(--gl-on);grid-row:1/4}",
      ".gl-quest .tag{justify-self:start;color:var(--gl-on);font-size:var(--font-size-2xs);font-weight:700;background:var(--gl-navy);padding:2px 8px}",
      ".gl-quest b{font-size:var(--font-size-display-md);font-weight:900;line-height:1}",
      ".gl-quest small{display:flex;align-items:center;gap:8px;font-size:var(--font-size-2xs);font-weight:700}.gl-quest .gl-bar{flex:1;background:var(--gl-on-veil2)}.gl-quest .gl-bar i{background:var(--gl-on)}",
      ".gl-nav{position:absolute;left:0;right:0;bottom:0;height:96px;display:flex;align-items:flex-end;gap:4px;padding:0 24px 10px;",
      "background:linear-gradient(transparent,var(--dash-glass-strong) 55%)}",
      ".gl-nv{width:110px;white-space:nowrap;display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;font-weight:700;font-size:var(--font-size-xs)}",
      ".gl-nv .gl-ic{--gl-s:42px;--gl-icc:var(--c)}.gl-nv small{font-size:var(--font-size-3xs);color:var(--text-secondary);font-weight:400}",
      ".gl-nav .sp{flex:1}.gl-clock{font-size:var(--font-size-2xs);color:var(--text-secondary);padding:0 12px 4px 0}",
      "}",
      /* 폰: 로비 없이 버튼 줄 */
      "@media(max-width:899px){.gl-plate,.gl-res,.gl-quick,.gl-rest,.gl-banner,.gl-quest,.gl-nav{margin:0 0 10px}",
      ".gl-res,.gl-quick,.gl-nav{display:flex;flex-wrap:wrap;gap:8px}.gl-plate{display:flex;gap:10px;padding:10px;background:var(--gl-navy);color:var(--gl-on)}",
      ".gl-r,.gl-qb,.gl-nv,.gl-rest,.gl-quest{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--border);background:var(--dash-glass-strong)}",
      ".gl-banner,.gl-clock{display:none}.gl-ic{--gl-s:22px}}",
      /* 임무 창 */
      ".gl-dim{position:fixed;inset:0;z-index:20;background:var(--gl-shade);display:none;pointer-events:auto}.gl-dim.show{display:block}",
      ".gl-win{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1140px,94vw);height:min(720px,88vh);background:var(--dash-glass-strong);",
      "border:1px solid var(--border);display:grid;grid-template-columns:220px 1fr;grid-template-rows:64px 1fr;backdrop-filter:blur(16px)}",
      ".gl-wh{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:0 20px;background:linear-gradient(100deg,var(--gl-navy),var(--gl-blue));color:var(--gl-on)}",
      ".gl-wh .gl-ic{--gl-icc:var(--gl-on);--gl-s:30px}.gl-wh h2{margin:0;font-size:var(--font-size-title);font-weight:900;flex:1}",
      ".gl-wh button{border:0;background:none;color:var(--gl-on);font-size:var(--font-size-display-sm)}",
      ".gl-tabs{border-right:1px solid var(--border);padding:12px 0;overflow:auto}",
      ".gl-tab{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-left:4px solid transparent;background:none;padding:12px 20px;",
      "font-size:var(--font-size-sm);font-weight:700;color:var(--text-secondary)}",
      ".gl-tab .gl-ic{--gl-s:26px;opacity:.75}.gl-tab.on{color:var(--text-primary);border-left-color:var(--accent);background:var(--gl-veil)}.gl-tab.on .gl-ic{opacity:1}",
      ".gl-pane{padding:20px 26px;overflow:auto;display:none}.gl-pane.on{display:block}",
      ".gl-meta{display:flex;align-items:center;gap:12px;color:var(--text-secondary);margin-bottom:12px;font-weight:700}.gl-meta .gl-bar{flex:1;height:8px}",
      ".gl-td{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;background:var(--gl-veil);border:1px solid var(--border);border-left:5px solid var(--c);",
      "cursor:pointer;font-size:var(--font-size-sm)}",
      ".gl-td input{width:22px;height:22px;accent-color:var(--accent);cursor:pointer}",
      ".gl-td span{flex:1}.gl-td em{font-style:normal;font-size:var(--font-size-2xs);color:var(--text-secondary);display:flex;align-items:center;gap:6px}",
      ".gl-td em .gl-ic{--gl-s:20px;--gl-icc:var(--c)}.gl-td.done span{color:var(--text-tertiary);text-decoration:line-through}",
      ".gl-rest-on .gl-td{opacity:.45}",
      ".gl-add{display:flex;gap:8px;margin:0 0 12px}.gl-add input{flex:1;min-width:0;height:42px;padding:0 12px;border:1px solid var(--border);background:var(--gl-veil);color:inherit;font:inherit}",
      ".gl-add select{height:42px;border:1px solid var(--border);background:var(--gl-veil);color:inherit;font:inherit}",
      ".gl-add button{border:0;background:var(--accent);color:var(--gl-on);padding:0 18px;font-weight:700}",
      ".gl-br{display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:center;padding:12px 14px;margin-bottom:8px;background:var(--gl-veil);",
      "border:1px solid var(--border);border-left:5px solid var(--c)}",
      ".gl-br .gl-ic{--gl-s:40px;--gl-icc:var(--c);grid-row:1/3}.gl-br b{font-size:var(--font-size-md)}",
      ".gl-br .lv{font-size:var(--font-size-2xs);font-weight:700;color:var(--c);margin-left:8px}.gl-br .dd{font-weight:900;color:var(--c);grid-row:1/3}",
      ".gl-br .st{font-size:var(--font-size-xs);color:var(--text-secondary);outline:none;border-bottom:1px dashed transparent}",
      ".gl-br .st:focus{border-bottom-color:var(--c);color:var(--text-primary)}.gl-br .st:empty:before{content:attr(data-ph);color:var(--text-tertiary)}",
      ".gl-lg{display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);font-size:var(--font-size-sm)}",
      ".gl-lg time{color:var(--text-tertiary);width:44px;flex:none}.gl-lg .dot{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}",
      ".gl-lg button{margin-left:auto;border:1px solid var(--border);background:var(--gl-veil);padding:4px 10px;font-size:var(--font-size-2xs)}",
      ".gl-empty{color:var(--text-tertiary);padding:8px 0}.gl-note{color:var(--text-secondary);font-size:var(--font-size-2xs);margin-top:12px}",
      ".gl-h{margin:18px 0 8px;font-size:var(--font-size-sm);font-weight:900}",
    ].join("");
    document.head.appendChild(el);
  }

  async function render(ctx: DashPanelCtx<DashRepoWrite>): Promise<void> {
    const { root, repo } = ctx;
    ensureStyle();
    ctx.status(t("mydash.gl.loading", undefined, "읽는 중"));

    const base = await repo.readJson<Goals>(DATA_PATH);
    if (!base || String(base.schema || "").split("/")[0] !== "goals")
      throw new Error(DATA_PATH + " schema 가 goals/1 이 아니다");
    const branches: Branch[] = (base.branches || []).filter(
      (b) => b && b.id && b.name,
    );
    const brOf = (id: string): Branch =>
      branches.find((b) => b.id === id) || { id, name: id };

    let events = await loadEvents(repo);
    if (!ctx.isCurrent()) return;

    const now = Date.now();
    const week = weekOf(now);

    /* ── 이벤트 접기. 부를 때마다 새로 (몇백 개 수준) ── */
    type View = {
      todos: Todo[];
      checked: Map<string, number>;
      rest: boolean;
      steps: Map<string, string>;
      wants: Array<{ text: string; at: number }>;
      todoWeek: Map<string, string>;
      allTodos: Map<string, Todo>;
    };
    function fold(): View {
      const allTodos = new Map<string, Todo>();
      const todoWeek = new Map<string, string>();
      for (const [wk, w] of Object.entries(base.weeks || {})) {
        for (const td of (w && w.todos) || []) {
          allTodos.set(td.id, td);
          todoWeek.set(td.id, wk);
        }
      }
      const checked = new Map<string, number>();
      const steps = new Map<string, string>();
      const restBy = new Map<string, boolean>();
      const wants: Array<{ text: string; at: number }> = [];
      for (const e of events) {
        if (e.type === "todo.add") {
          const v = e.value as { branch?: string; text?: string };
          if (v && typeof v.text === "string" && e.week) {
            allTodos.set(e.target, {
              id: e.target,
              branch: String(v.branch || ""),
              text: v.text,
            });
            todoWeek.set(e.target, e.week);
          }
        } else if (e.type === "todo.check") {
          if (e.value === true) checked.set(e.target, e.at);
          else checked.delete(e.target);
        } else if (e.type === "rest") restBy.set(e.target, e.value === true);
        else if (e.type === "step") steps.set(e.target, String(e.value || ""));
        else if (e.type === "want.add" && typeof e.value === "string")
          wants.push({ text: e.value, at: e.at });
      }
      const todos = Array.from(allTodos.values()).filter(
        (td) => todoWeek.get(td.id) === week,
      );
      return {
        todos,
        checked,
        rest: restBy.get(week) === true,
        steps,
        wants: wants.reverse(),
        todoWeek,
        allTodos,
      };
    }
    let view = fold();

    /* ── 보내기 (북마크와 같은 손: 충돌이면 새 시각으로 한 번, 망 실패는 큐) ── */
    function stamp(): { at: number; path: string } {
      const at = Date.now();
      const d = kstDate(at);
      const month = d.toISOString().slice(0, 7);
      return {
        at,
        path:
          EVENTS_DIR +
          "/" +
          month +
          "/" +
          at +
          "-" +
          repo.deviceId +
          "-" +
          repo.nonce +
          ".json",
      };
    }
    async function send(
      type: string,
      target: string,
      value: unknown,
      wk?: string,
    ): Promise<void> {
      for (let tries = 0; tries < 2; tries++) {
        const s = stamp();
        const ev: Ev = {
          v: 1,
          type,
          target,
          value,
          at: s.at,
          dev: repo.deviceId,
        };
        if (wk) ev.week = wk;
        const message = "dash: goals " + type + " " + target;
        events.push(ev);
        view = fold();
        paint();
        try {
          await repo.putNewJson(s.path, ev, message);
          ctx.status(t("mydash.gl.saved", undefined, "저장함"));
          return;
        } catch (e) {
          const kind = (e as { kind?: string }).kind;
          if (kind === "exists") {
            events = events.filter((x) => x !== ev);
            continue;
          }
          if (kind === "auth" || kind === "config") throw e;
          if (kind === "perm") {
            events = events.filter((x) => x !== ev);
            view = fold();
            paint();
            ctx.status(
              t("mydash.gl.denied", undefined, "쓰기 권한이 없어 저장 못 함"),
            );
            return;
          }
          repo.enqueueJson(s.path, ev, message);
          ctx.status(
            t(
              "mydash.gl.queued",
              undefined,
              "네트워크 실패. 큐에 넣고 다음에 다시 보냄",
            ),
          );
          return;
        }
      }
    }
    const newId = (): string => Date.now().toString(36) + "-" + repo.nonce;

    /* ── 뼈대 ── */
    const wrap = document.createElement("div");
    wrap.className = "gl";
    root.textContent = "";
    root.appendChild(wrap);
    let openTab = "";

    function counts(): { done: number; total: number; pct: number } {
      const done = view.todos.filter((td) => view.checked.has(td.id)).length;
      const total = view.todos.length;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }

    function doneRows(): Array<DoneRow & { at: number }> {
      const rows: Array<DoneRow & { at: number }> = (base.done || []).map(
        (r) => ({ ...r, at: Date.parse(r.date + "T00:00:00Z") }),
      );
      for (const [id, at] of view.checked) {
        const td = view.allTodos.get(id);
        if (td)
          rows.push({
            date: ymd(kstDate(at)),
            branch: td.branch,
            text: td.text,
            at,
          });
      }
      return rows.sort((a, b) => b.at - a.at);
    }

    function lobbyHtml(): string {
      const c = counts();
      const rows = doneRows();
      const sunday = addDays(week, 6);
      const monday = week;
      const dues = branches.filter((b) => b.due);
      const banners = dues
        .map(
          (b, i) =>
            '<button class="gl-bn' +
            (i === 0 ? " on" : "") +
            '" data-c="' +
            color(b.color) +
            '" data-open="br">' +
            (i === 0 ? '<img src="' + BANNER_IMG + '" alt="">' : icon(b.icon)) +
            '<div class="gl-bt"><small>' +
            esc(b.name) +
            "</small><b>" +
            esc(view.steps.get(b.id) ?? b.step ?? "") +
            "</b></div>" +
            "<em>" +
            esc(dday(b.due, now)) +
            "</em></button>",
        )
        .join("");
      return (
        '<img class="gl-ch" src="' +
        IMG +
        'alisa.webp" alt="">' +
        '<div class="gl-plate"><div class="wn">' +
        esc(t("mydash.gl.week", undefined, "주")) +
        "<b>" +
        (Math.floor((Number(monday.slice(8, 10)) - 1) / 7) + 1) +
        '</b></div><div class="nm"><b>' +
        esc(weekName(monday)) +
        "</b><small>" +
        md(monday) +
        " ~ " +
        md(sunday) +
        '<span class="gl-bar"><i style="width:' +
        c.pct +
        '%"></i></span></small></div></div>' +
        '<div class="gl-res">' +
        '<button class="gl-r" data-open="wk">' +
        icon("quest") +
        "<span>" +
        c.done +
        " / " +
        c.total +
        "</span><small>" +
        esc(t("mydash.gl.thisWeek", undefined, "이번 주")) +
        "</small><em>+</em></button>" +
        '<button class="gl-r" data-open="lo">' +
        icon("trophy") +
        "<span>" +
        rows.length +
        "</span><small>" +
        esc(t("mydash.gl.done", undefined, "한 것")) +
        "</small><em>+</em></button>" +
        '<button class="gl-r" data-open="wa">' +
        icon("want") +
        "<span>" +
        view.wants.length +
        "</span><small>" +
        esc(t("mydash.gl.want", undefined, "하고 싶은 것")) +
        "</small><em>+</em></button></div>" +
        '<div class="gl-quick">' +
        '<button class="gl-qb" data-open="wa">' +
        icon("want") +
        esc(t("mydash.gl.want", undefined, "하고 싶은 것")) +
        '<span class="gl-badge"' +
        (view.wants.length ? "" : " hidden") +
        ">" +
        view.wants.length +
        "</span></button>" +
        '<button class="gl-qb" data-open="lo">' +
        icon("trophy") +
        esc(t("mydash.gl.done", undefined, "한 것")) +
        "</button>" +
        '<button class="gl-qb" data-open="st">' +
        icon("start") +
        esc(t("mydash.gl.start", undefined, "주 시작")) +
        "</button>" +
        '<button class="gl-qb" data-open="en">' +
        icon("end") +
        esc(t("mydash.gl.end", undefined, "주 끝")) +
        "</button></div>" +
        '<button class="gl-rest' +
        (view.rest ? " on" : "") +
        '" data-rest>' +
        icon("rest") +
        esc(
          view.rest
            ? t("mydash.gl.resting", undefined, "쉬는 중")
            : t("mydash.gl.rest", undefined, "쉬기"),
        ) +
        "</button>" +
        (banners
          ? '<div class="gl-banner">' +
            banners +
            (dues.length > 1
              ? '<div class="gl-dots">' +
                dues
                  .map(
                    (_, i) => "<i" + (i === 0 ? ' class="on"' : "") + "></i>",
                  )
                  .join("") +
                "</div>"
              : "") +
            "</div>"
          : "") +
        '<button class="gl-quest" data-open="wk">' +
        icon("quest") +
        '<span class="tag">' +
        esc(
          view.rest
            ? t("mydash.gl.resting", undefined, "쉬는 중")
            : t("mydash.gl.going", undefined, "진행 중"),
        ) +
        "</span><b>" +
        esc(t("mydash.gl.quest", undefined, "이번 주 임무")) +
        "</b><small><span>" +
        c.done +
        " / " +
        c.total +
        '</span><span class="gl-bar"><i style="width:' +
        c.pct +
        '%"></i></span></small></button>' +
        '<div class="gl-nav">' +
        branches
          .map(
            (b) =>
              '<button class="gl-nv" data-c="' +
              color(b.color) +
              '" data-open="br">' +
              icon(b.icon) +
              esc(b.name) +
              "<small>Lv -</small></button>",
          )
          .join("") +
        '<div class="sp"></div><span class="gl-clock"></span></div>'
      );
    }

    function todoRow(td: Todo): string {
      const b = brOf(td.branch);
      const on = view.checked.has(td.id);
      return (
        '<label class="gl-td' +
        (on ? " done" : "") +
        '" data-c="' +
        color(b.color) +
        '"><input type="checkbox" data-todo="' +
        esc(td.id) +
        '"' +
        (on ? " checked" : "") +
        "><span>" +
        esc(td.text) +
        "</span><em>" +
        icon(b.icon) +
        esc(b.name) +
        "</em></label>"
      );
    }
    function addRow(id: string, ph: string): string {
      return (
        '<div class="gl-add"><select data-br-of="' +
        id +
        '">' +
        branches
          .map(
            (b) =>
              '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>",
          )
          .join("") +
        '</select><input data-add-of="' +
        id +
        '" placeholder="' +
        esc(ph) +
        '"><button data-add="' +
        id +
        '">' +
        esc(t("mydash.gl.add", undefined, "더하기")) +
        "</button></div>"
      );
    }

    function winHtml(): string {
      const c = counts();
      const rows = doneRows();
      const left = view.todos.filter((td) => !view.checked.has(td.id));
      const next = addDays(week, 7);
      const tab = (p: string, ic: string, label: string): string =>
        '<button class="gl-tab' +
        (openTab === p ? " on" : "") +
        '" data-tab="' +
        p +
        '">' +
        icon(ic) +
        esc(label) +
        "</button>";
      const pane = (p: string, html: string): string =>
        '<section class="gl-pane' +
        (openTab === p ? " on" : "") +
        '">' +
        html +
        "</section>";
      return (
        '<div class="gl-win" role="dialog" aria-modal="true"><div class="gl-wh">' +
        icon("quest") +
        "<h2>" +
        esc(t("mydash.gl.mission", undefined, "임무")) +
        '</h2><button data-close aria-label="' +
        esc(t("mydash.gl.close", undefined, "닫기")) +
        '">×</button></div>' +
        '<nav class="gl-tabs">' +
        tab("wk", "quest", t("mydash.gl.thisWeek", undefined, "이번 주")) +
        tab("br", "branch", t("mydash.gl.branches", undefined, "가지")) +
        tab("wa", "want", t("mydash.gl.want", undefined, "하고 싶은 것")) +
        tab("lo", "trophy", t("mydash.gl.done", undefined, "한 것")) +
        tab("st", "start", t("mydash.gl.start", undefined, "주 시작")) +
        tab("en", "end", t("mydash.gl.end", undefined, "주 끝")) +
        "</nav>" +
        pane(
          "wk",
          '<div class="gl-meta"><span>' +
            c.done +
            " / " +
            c.total +
            " " +
            esc(t("mydash.gl.finished", undefined, "끝남")) +
            '</span><div class="gl-bar"><i style="width:' +
            c.pct +
            '%"></i></div></div>' +
            (view.todos.length
              ? view.todos.map(todoRow).join("")
              : '<div class="gl-empty">' +
                esc(
                  t(
                    "mydash.gl.noTodo",
                    undefined,
                    "이번 주 할 일이 없음. 주 시작에서 더함",
                  ),
                ) +
                "</div>"),
        ) +
        pane(
          "br",
          branches
            .map(
              (b) =>
                '<div class="gl-br" data-c="' +
                color(b.color) +
                '">' +
                icon(b.icon) +
                "<div><b>" +
                esc(b.name) +
                '</b><span class="lv">Lv -</span></div><div class="dd">' +
                esc(dday(b.due, now)) +
                '</div><div class="st" contenteditable="true" data-step="' +
                esc(b.id) +
                '" data-ph="' +
                esc(t("mydash.gl.stepPh", undefined, "다음 단계 적기")) +
                '">' +
                esc(view.steps.get(b.id) ?? b.step ?? "") +
                "</div></div>",
            )
            .join("") +
            '<div class="gl-note">' +
            esc(
              t(
                "mydash.gl.stepHint",
                undefined,
                "다음 단계는 눌러서 고치고, 칸을 벗어나면 저장",
              ),
            ) +
            "</div>",
        ) +
        pane(
          "wa",
          '<div class="gl-add"><input data-want-in placeholder="' +
            esc(t("mydash.gl.wantPh", undefined, "떠오르면 한 줄")) +
            '"><button data-want-add>' +
            esc(t("mydash.gl.write", undefined, "적기")) +
            "</button></div>" +
            (view.wants.length
              ? view.wants
                  .map(
                    (w) =>
                      '<div class="gl-lg"><time>' +
                      md(ymd(kstDate(w.at))) +
                      "</time>" +
                      esc(w.text) +
                      "</div>",
                  )
                  .join("")
              : '<div class="gl-empty">' +
                esc(t("mydash.gl.none", undefined, "아직 없음")) +
                "</div>"),
        ) +
        pane(
          "lo",
          rows.length
            ? rows
                .map(
                  (r) =>
                    '<div class="gl-lg" data-c="' +
                    color(brOf(r.branch).color) +
                    '"><span class="dot"></span><time>' +
                    md(r.date) +
                    "</time>" +
                    esc(r.text) +
                    "</div>",
                )
                .join("")
            : '<div class="gl-empty">' +
                esc(t("mydash.gl.none", undefined, "아직 없음")) +
                "</div>",
        ) +
        pane(
          "st",
          '<div class="gl-h">' +
            esc(weekName(week)) +
            "</div>" +
            addRow(
              "wk",
              t("mydash.gl.todoPh", undefined, "이번 주에 할 일 한 줄"),
            ) +
            view.todos.map(todoRow).join(""),
        ) +
        pane(
          "en",
          '<div class="gl-meta"><span>' +
            c.done +
            " / " +
            c.total +
            " " +
            esc(t("mydash.gl.finished", undefined, "끝남")) +
            "</span></div>" +
            '<div class="gl-h">' +
            esc(t("mydash.gl.left", undefined, "남은 것")) +
            "</div>" +
            (left.length
              ? left
                  .map(
                    (td) =>
                      '<div class="gl-lg" data-c="' +
                      color(brOf(td.branch).color) +
                      '"><span class="dot"></span>' +
                      esc(td.text) +
                      (Array.from(view.allTodos.values()).some(
                        (x) =>
                          view.todoWeek.get(x.id) === next &&
                          x.text === td.text,
                      )
                        ? ""
                        : '<button data-carry="' +
                          esc(td.id) +
                          '">' +
                          esc(t("mydash.gl.carry", undefined, "다음 주로")) +
                          "</button>") +
                      "</div>",
                  )
                  .join("")
              : '<div class="gl-empty">' +
                esc(t("mydash.gl.allDone", undefined, "남은 것 없음")) +
                "</div>") +
            '<div class="gl-note">' +
            esc(
              t(
                "mydash.gl.restHint",
                undefined,
                "못 한 주는 쉬기로 두어도 됨. 벌 없음",
              ),
            ) +
            "</div>",
        ) +
        "</div>"
      );
    }

    const lobby = document.createElement("div");
    lobby.style.display = "contents";
    const dim = document.createElement("div");
    dim.className = "gl-dim";
    wrap.appendChild(lobby);
    wrap.appendChild(dim);

    function paint(): void {
      lobby.innerHTML = lobbyHtml();
      wrap.classList.toggle("gl-rest-on", view.rest);
      if (openTab) {
        const focus = document.activeElement as HTMLElement | null;
        const keep =
          focus && dim.contains(focus) && focus.matches("input")
            ? (focus as HTMLInputElement).getAttribute("data-add-of") ||
              (focus.hasAttribute("data-want-in") ? "want" : "")
            : "";
        dim.innerHTML = winHtml();
        dim.classList.add("show");
        if (keep)
          (
            dim.querySelector(
              keep === "want"
                ? "[data-want-in]"
                : '[data-add-of="' + keep + '"]',
            ) as HTMLInputElement | null
          )?.focus();
      } else {
        dim.classList.remove("show");
        dim.textContent = "";
      }
      clock();
      const c = counts();
      ctx.setCount("goals", c.total ? c.done + "/" + c.total : "");
    }
    function open(tab: string): void {
      openTab = tab;
      paint();
      if (tab === "st")
        (
          dim.querySelector('[data-add-of="wk"]') as HTMLInputElement | null
        )?.focus();
      if (tab === "wa")
        (
          dim.querySelector("[data-want-in]") as HTMLInputElement | null
        )?.focus();
    }
    function close(): void {
      openTab = "";
      paint();
    }
    function clock(): void {
      const el = lobby.querySelector(".gl-clock");
      if (el)
        el.textContent = new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
    }

    wrap.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      const opener = el.closest("[data-open]") as HTMLElement | null;
      if (opener) return open(opener.getAttribute("data-open") || "wk");
      const tabEl = el.closest("[data-tab]") as HTMLElement | null;
      if (tabEl) return open(tabEl.getAttribute("data-tab") || "wk");
      if (el.closest("[data-close]") || el === dim) return close();
      if (el.closest("[data-rest]")) return void send("rest", week, !view.rest);
      if (el.closest(".gl-ch")) {
        const ch = el.closest(".gl-ch") as HTMLElement;
        ch.classList.add("bump");
        setTimeout(() => ch.classList.remove("bump"), 250);
        return;
      }
      const carry = el.closest("[data-carry]") as HTMLElement | null;
      if (carry) {
        const td = view.allTodos.get(carry.getAttribute("data-carry") || "");
        if (td)
          void send(
            "todo.add",
            newId(),
            { branch: td.branch, text: td.text },
            addDays(week, 7),
          );
        return;
      }
      if (el.closest("[data-want-add]")) return addWant();
      const add = el.closest("[data-add]") as HTMLElement | null;
      if (add) return addTodo(add.getAttribute("data-add") || "wk");
    });
    wrap.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      const id = el.getAttribute("data-todo");
      if (id) void send("todo.check", id, el.checked);
    });
    wrap.addEventListener("keydown", (e) => {
      const el = e.target as HTMLElement;
      if (e.key !== "Enter" || e.isComposing) return;
      if (el.hasAttribute("data-want-in")) {
        e.preventDefault();
        addWant();
      } else if (el.hasAttribute("data-add-of")) {
        e.preventDefault();
        addTodo(el.getAttribute("data-add-of") || "wk");
      } else if (el.hasAttribute("data-step")) {
        e.preventDefault();
        el.blur();
      }
    });
    wrap.addEventListener("focusout", (e) => {
      const el = e.target as HTMLElement;
      const id = el.getAttribute("data-step");
      if (!id) return;
      const text = (el.textContent || "").trim();
      const b = brOf(id);
      if (text !== (view.steps.get(id) ?? b.step ?? ""))
        void send("step", id, text);
    });
    function addWant(): void {
      const inp = dim.querySelector(
        "[data-want-in]",
      ) as HTMLInputElement | null;
      const v = inp ? inp.value.trim() : "";
      if (v) void send("want.add", newId(), v);
    }
    function addTodo(of: string): void {
      const inp = dim.querySelector(
        '[data-add-of="' + of + '"]',
      ) as HTMLInputElement | null;
      const sel = dim.querySelector(
        '[data-br-of="' + of + '"]',
      ) as HTMLSelectElement | null;
      const v = inp ? inp.value.trim() : "";
      if (v)
        void send(
          "todo.add",
          newId(),
          { branch: sel ? sel.value : "", text: v },
          week,
        );
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && openTab) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    /* 시계와 배너 넘김. 숨은 탭에서는 멈춤 */
    function tick(): void {
      clock();
      const bn = lobby.querySelectorAll(".gl-bn");
      if (bn.length < 2) return;
      const dots = lobby.querySelectorAll(".gl-dots i");
      let i = Array.from(bn).findIndex((x) => x.classList.contains("on"));
      bn[i].classList.remove("on");
      dots[i]?.classList.remove("on");
      i = (i + 1) % bn.length;
      bn[i].classList.add("on");
      dots[i]?.classList.add("on");
    }
    let timer = 0;
    const arm = (): void => {
      window.clearInterval(timer);
      timer = document.hidden ? 0 : window.setInterval(tick, 5000);
    };
    document.addEventListener("visibilitychange", arm);
    arm();
    ctx.onDispose(() => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", arm);
      window.clearInterval(timer);
    });

    paint();
    ctx.status(t("mydash.gl.events", { n: events.length }, "기록 {n}개"));
  }

  void loadNamespace("mydash").catch(() => undefined);

  dashRegistry().register({
    id: "goals",
    get title(): string {
      return t("mydash.gl.title", undefined, "목표");
    },
    access: "write",
    paths: [DATA_PATH, EVENTS_DIR],
    render,
  });
})();

export {};
