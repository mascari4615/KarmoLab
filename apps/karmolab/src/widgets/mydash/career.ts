/**
 * 패널: 커리어. 지원서별 자소서 시안 비교와 고르기, 합격 사례, 공고 링크.
 *
 * 정본은 private memo 하나 (Claude, Codex 공통, 스킬 `career`):
 *  - `data/career/applications.json` 지원 목록, 문항, 시안 파일 자리, 고른 안 (`picks`)
 *  - `data/career/cases.json` 합격 사례 요약
 *  - 시안 본문은 `<draftsDir>/<file>` 의 `<!-- answer:X -->` 주석 사이
 * 형식: memo `data/career/README.md`. 지원별 HTML 생성기 (`build-viewer.mjs`) 와 같은 규칙
 *
 * 고르기: 이벤트 브랜치에 새 파일 하나 (`career/picks/<app>/<epoch-ms>-<device6>-<nonce4>.json`).
 * 화면의 고른 안은 applications.json `picks` 위에 이벤트를 시각 순으로 덮은 값. pick 이 null 이면 취소.
 * 화면 결은 홈 S5 (memo `notes/mydash/design/redesign-20261111/drafts4/career-C1.html`)
 */
import { dashRegistry, esc, safeLinkUrl, type DashPanelCtx, type DashRepoWrite } from './kit';

interface Question {
  id: number;
  title: string;
  limit: number;
  prompt: string;
  file?: string;
  paused?: boolean;
  definitions?: string[];
}
interface Application {
  id: string;
  company: string;
  role: string;
  status: string;
  opens?: string;
  deadline?: string;
  links?: Array<{ label: string; url: string }>;
  research?: string;
  draftsDir: string;
  caseIds?: string[];
  picks?: Record<string, string>;
  questions: Question[];
}
interface CaseAnswer {
  question: string;
  answer: string;
  note: string;
}
interface CaseItem {
  id: string;
  company: string;
  role: string;
  period: string;
  kind: string;
  stage: string;
  source: string;
  url: string;
  checkedAt?: string;
  takeaway?: string;
  answers: CaseAnswer[];
}
interface Variant {
  id: string;
  title: string;
  text: string;
  focus: string;
  note: string;
}
interface PickEvent {
  type: 'career-pick';
  app: string;
  q: number;
  pick: string | null;
  at: number;
}

const APPS = 'data/career/applications.json';
const CASES = 'data/career/cases.json';
const PICKS_DIR = 'career/picks';
const STATUS: Record<string, string> = {
  drafting: '작성 중',
  submitted: '제출함',
  passed: '합격',
  failed: '불합격',
  closed: '마감',
};
type Tab = 'drafts' | 'cases' | 'links';

/** 시안 파일 하나에서 `## X. 제목` 과 answer 주석 사이 본문. 생성기 `parseVariants` 와 같은 규칙 */
export function parseVariants(source: string): Variant[] {
  const out: Variant[] = [];
  const re = /^## ([A-Z])\. (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const id = m[1];
    const parts = source.slice(m.index).split(`<!-- answer:${id} -->`);
    const text = (parts[1] || '').split(`<!-- /answer:${id} -->`)[0].trim();
    if (!text) continue;
    out.push({
      id,
      title: m[2].trim(),
      text,
      focus: (parts[0].match(/^- 중심: (.+)$/m) || [])[1] || '',
      note: (parts[0].match(/^- 장점: (.+)$/m) || [])[1] || '',
    });
  }
  return out;
}

/** 정본 picks 위에 고르기 이벤트를 시각 순으로 덮음. pick null 은 취소 */
export function applyPicks(base: Record<string, string> | undefined, events: PickEvent[]): Record<string, string> {
  const out: Record<string, string> = { ...(base || {}) };
  for (const ev of [...events].sort((a, b) => a.at - b.at)) {
    if (ev.pick) out[String(ev.q)] = ev.pick;
    else delete out[String(ev.q)];
  }
  return out;
}

function isPickEvent(v: unknown): v is PickEvent {
  const e = v as PickEvent;
  return !!e && e.type === 'career-pick' && typeof e.app === 'string' && typeof e.q === 'number' && typeof e.at === 'number' && (e.pick === null || typeof e.pick === 'string');
}

function daysLeft(deadline?: string): { big: string; sub: string } {
  if (!deadline) return { big: '-', sub: '' };
  const end = Date.parse(deadline);
  if (!Number.isFinite(end)) return { big: '-', sub: '' };
  const left = end - Date.now();
  if (left < 0) return { big: '마감', sub: '마감 지남' };
  const days = Math.floor(left / 86400000);
  return days === 0 ? { big: 'D-0', sub: `오늘 마감, ${Math.ceil(left / 3600000)}시간 남음` } : { big: `D-${days}`, sub: '' };
}

function kst(iso?: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(iso));
}

/** 문항 제목 뒤 괄호 메모 ("(시안만, 확정 보류)") 는 판 아래 작은 줄로 */
function splitTitle(title: string): { name: string; memo: string } {
  const m = title.match(/^(.*?)\s*\((.+)\)$/);
  return m ? { name: m[1], memo: m[2] } : { name: title, memo: '' };
}

async function renderCareer(ctx: DashPanelCtx<DashRepoWrite>): Promise<void> {
  ctx.root.classList.add('cr');
  ctx.root.innerHTML = '<p class="cr-muted">커리어 정본을 읽는 중</p>';
  const repo = ctx.repo;
  const [appsDoc, casesDoc] = await Promise.all([
    repo.readJson<{ applications: Application[] }>(APPS),
    repo.readJson<{ cases: CaseItem[] }>(CASES).catch(() => ({ cases: [] as CaseItem[] })),
  ]);
  const apps = appsDoc.applications || [];
  const info = ctx.repoInfo;
  const gh = (path: string): string | null =>
    info && info.owner ? `https://github.com/${info.owner}/${info.repo}/blob/${info.branch}/${path.split('/').map(encodeURIComponent).join('/')}` : null;
  const ghLink = (path: string | undefined, label: string): string => {
    const url = path ? gh(path) : null;
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
  };
  if (!apps.length) {
    ctx.root.innerHTML = `<p>지원서가 없어요. memo <code>${APPS}</code> 에 추가하세요.</p>`;
    return;
  }

  const sub = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  let app = apps.find((a) => a.id === sub[1]) || apps[0];
  let tab: Tab = sub[2] === 'cases' || sub[2] === 'links' ? sub[2] : 'drafts';
  let qid = 0;
  let show = '';
  let note = '';
  const variantsCache = new Map<string, Variant[] | Error>();
  const pickEvents: PickEvent[] = [];

  async function loadPickEvents(): Promise<void> {
    if (!repo.tree || !repo.eventsBranch) return;
    const ref = repo.eventsBranch;
    const entries = await repo.tree(ref).catch(() => []);
    const want = entries.filter((e) => e.type === 'file' && e.path.indexOf(PICKS_DIR + '/') === 0 && /\.json$/i.test(e.name));
    const read = await Promise.all(want.map((e) => repo.readJson<unknown>(e.path, { ref }).catch(() => null)));
    pickEvents.length = 0;
    for (const raw of read) if (isPickEvent(raw)) pickEvents.push(raw);
  }
  const picksOf = (a: Application): Record<string, string> => applyPicks(a.picks, pickEvents.filter((e) => e.app === a.id));

  async function savePick(q: Question, pick: string | null): Promise<void> {
    const at = Date.now();
    const ev: PickEvent = { type: 'career-pick', app: app.id, q: q.id, pick, at };
    pickEvents.push(ev);
    if (!repo.putNewJson) {
      note = '이 화면은 저장하지 않아요.';
      return;
    }
    const path = `${PICKS_DIR}/${app.id}/${at}-${repo.deviceId}-${repo.nonce}.json`;
    const message = `dash: career pick ${app.id} ${q.id}${pick || '-'}`;
    try {
      await repo.putNewJson(path, ev, message);
      note = pick ? `${q.id}번 ${pick}안 저장함.` : `${q.id}번 고름 취소 저장함.`;
    } catch (e) {
      const kind = (e as { kind?: string }).kind;
      if (kind === 'auth' || kind === 'config') throw e;
      if (kind === 'perm') {
        pickEvents.pop();
        note = '쓰기 권한이 없어 저장하지 못했어요.';
        return;
      }
      if (kind === 'exists') {
        note = '저장함.';
        return;
      }
      repo.enqueueJson(path, ev, message);
      note = '연결이 불안정해 보낼 목록에 넣었어요. 잠시 뒤 자동으로 보냄.';
    }
  }

  function setHash(): void {
    try {
      history.replaceState({}, '', location.pathname + '#' + ['career', app.id, tab].map(encodeURIComponent).join('/'));
    } catch {
      /* 주소를 못 바꿔도 화면은 바뀐다 */
    }
  }

  async function loadVariants(q: Question): Promise<Variant[] | Error> {
    const key = app.id + '/' + q.id;
    const hit = variantsCache.get(key);
    if (hit) return hit;
    let value: Variant[] | Error;
    try {
      value = q.file ? parseVariants(await repo.readText(app.draftsDir + '/' + q.file)) : [];
    } catch (e) {
      value = e instanceof Error ? e : new Error(String(e));
    }
    variantsCache.set(key, value);
    return value;
  }

  function top(picks: Record<string, string>): string {
    const active = app.questions.filter((q) => !q.paused);
    const picked = active.filter((q) => picks[String(q.id)]).length;
    const left = daysLeft(app.deadline);
    const appPicker =
      apps.length > 1
        ? `<select class="cr-app" aria-label="지원서">${apps.map((a) => `<option value="${esc(a.id)}"${a.id === app.id ? ' selected' : ''}>${esc(a.company)} / ${esc(a.role)}</option>`).join('')}</select>`
        : '';
    const segs = app.questions
      .map((q, i) => {
        const p = picks[String(q.id)];
        const cls = [q.paused ? 'cr-off' : p ? 'cr-on' : '', i === qid && tab === 'drafts' ? 'cr-cur' : ''].filter(Boolean).join(' ');
        return `<button type="button" data-q="${i}" class="${cls}" aria-label="${q.id}번${p ? ' ' + esc(p) + '안' : ''}">${q.id}${p ? esc(p) : ''}</button>`;
      })
      .join('');
    return `<header class="cr-top cr-head">
      <div class="cr-who"><small>${esc(STATUS[app.status] || app.status)}</small><h2>${esc(app.company)}</h2><p>${esc(app.role)}</p>${appPicker}
        <nav class="cr-tabs" role="tablist">
          <button type="button" role="tab" data-tab="drafts" aria-selected="${tab === 'drafts'}">자소서 시안</button>
          <button type="button" role="tab" data-tab="cases" aria-selected="${tab === 'cases'}">합격 사례<span>${(app.caseIds || []).length}</span></button>
          <button type="button" role="tab" data-tab="links" aria-selected="${tab === 'links'}">공고와 자료</button>
        </nav></div>
      <div class="cr-dday"><small>마감 ${esc(kst(app.deadline))}</small><b>${esc(left.big)}</b><span>${esc(left.sub || (app.opens ? '공고 ' + kst(app.opens) : ''))}</span></div>
      <div class="cr-prog"><small>고른 안</small><div class="cr-n">${picked}<i>/ ${active.length}</i></div><div class="cr-segs">${segs}</div></div>
    </header>`;
  }

  function qnav(picks: Record<string, string>): string {
    const items = app.questions
      .map((q, i) => {
        const t = splitTitle(q.title);
        const p = picks[String(q.id)];
        return `<button type="button" class="cr-qbtn${q.paused ? ' cr-paused' : ''}" data-q="${i}" aria-current="${i === qid && tab === 'drafts'}"><span class="cr-no">${q.id}</span><span class="cr-qt"><b>${esc(t.name)}</b><small>${q.limit}자${t.memo ? ' / ' + esc(t.memo) : ''}</small></span><span class="cr-pk${p ? '' : ' cr-none'}">${p ? esc(p) : q.paused ? '보류' : '미정'}</span></button>`;
      })
      .join('');
    const combo = app.questions
      .filter((q) => !q.paused)
      .map((q) => q.id + (picks[String(q.id)] || '_'))
      .join(' ');
    return `<nav class="cr-qnav" aria-label="문항">${items}
      <div class="cr-combo"><small>고른 조합</small><b>${esc(combo)}</b><button type="button" data-copyall="1">고른 안 모아 복사</button></div></nav>`;
  }

  function casesView(): string {
    const list = (app.caseIds || []).map((id) => casesDoc.cases.find((c) => c.id === id)).filter((c): c is CaseItem => !!c);
    if (!list.length) return `<p class="cr-muted">연결된 합격 사례가 없어요. memo <code>${CASES}</code> 에 넣고 <code>caseIds</code> 에 연결하세요.</p>`;
    return `<p class="cr-band">질문과 답변은 요약. 합격 표시는 출처 기준이고 회사 통지 원본 검증이 아님. 참고 메모는 내 시안에 대한 제안이며 공식 평가 기준 아님.</p>
      <div class="cr-cases">${list
        .map((c) => {
          const url = safeLinkUrl(c.url);
          return `<article class="cr-case"><h3>${esc(c.company)} / ${esc(c.role)} <span>${esc(c.period)}</span></h3>
          <p class="cr-note">${esc(c.stage)}${c.checkedAt ? ' / 확인 ' + esc(c.checkedAt) : ''}</p>
          ${c.takeaway ? `<p>${esc(c.takeaway)}</p>` : ''}
          ${c.answers.length ? `<ol>${c.answers.map((a) => `<li><b>${esc(a.question)}</b><p>${esc(a.answer)}</p><p class="cr-note">${esc(a.note)}</p></li>`).join('')}</ol>` : ''}
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.source)} 원문</a>` : ''}</article>`;
        })
        .join('')}</div>`;
  }

  function linksView(): string {
    const links = (app.links || [])
      .map((l) => {
        const url = safeLinkUrl(l.url);
        return url ? `<a class="cr-link" href="${esc(url)}" target="_blank" rel="noopener"><b>${esc(l.label)}</b><small>${esc(url)}</small></a>` : '';
      })
      .concat(
        [ghLink(app.research, '공고 조사 (memo)'), ghLink(app.draftsDir + '/README.md', '시안 가이드 (memo)')]
          .filter(Boolean)
          .map((a) => a.replace('<a ', '<a class="cr-link" '))
      )
      .filter(Boolean)
      .join('');
    return `<div class="cr-links">${links || '<p class="cr-muted">링크가 없어요.</p>'}</div>`;
  }

  async function draftsView(body: HTMLElement, picks: Record<string, string>): Promise<void> {
    const q = app.questions[qid] || app.questions[0];
    const t = splitTitle(q.title);
    const defs = q.definitions && q.definitions.length ? `<div class="cr-defs">${q.definitions.map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : '';
    body.innerHTML = `<div class="cr-ask cr-q"><h3>${q.id}. ${esc(t.name)}</h3><p>${esc(q.prompt)}</p><span class="cr-lim">${q.limit}자</span></div>${defs}
      <div class="cr-vtabs" role="tablist"></div><div class="cr-variants"><p class="cr-muted">시안 읽는 중</p></div>
      ${note ? `<p class="cr-status" role="status">${esc(note)}</p>` : ''}`;
    const box = body.querySelector<HTMLElement>('.cr-variants')!;
    if (q.paused) {
      box.innerHTML = '<p class="cr-empty">보류한 문항. 시안 없음.</p>';
      return;
    }
    const vs = await loadVariants(q);
    if (!ctx.isCurrent() || !box.isConnected) return;
    if (vs instanceof Error) {
      box.innerHTML = `<p class="cr-empty">시안 파일을 못 읽었어요: <code>${esc(app.draftsDir + '/' + (q.file || ''))}</code></p>`;
      return;
    }
    if (!vs.length) {
      box.innerHTML = `<p class="cr-empty">시안이 없어요. ${ghLink(app.draftsDir + '/' + q.file, '파일 열기')}</p>`;
      return;
    }
    const pick = picks[String(q.id)];
    if (!vs.some((v) => v.id === show)) show = pick || vs[0].id;
    body.querySelector<HTMLElement>('.cr-vtabs')!.innerHTML = vs
      .map((v) => `<button type="button" role="tab" data-show="${esc(v.id)}" aria-selected="${v.id === show}">${esc(v.id)}${pick === v.id ? ' 고름' : ''}</button>`)
      .join('');
    box.innerHTML = vs
      .map((v) => {
        const n = v.text.length;
        const over = v.text.replace(/\n/g, '\r\n').length > q.limit;
        const pct = Math.min(100, Math.round((n / q.limit) * 100));
        const mine = pick === v.id;
        return `<article class="cr-variant${mine ? ' cr-picked' : ''}${v.id === show ? ' cr-show' : ''}">
          <header><span class="cr-id">${esc(v.id)}</span><div><h4>${esc(v.title)}${mine ? ' <b>고른 안</b>' : ''}</h4>${v.focus ? `<p class="cr-note">${esc(v.focus)}</p>` : ''}</div></header>
          <div class="cr-text">${esc(v.text)}</div>
          <footer><div class="cr-cnt"><span class="${over ? 'cr-over' : ''}"><b>${n}</b> / ${q.limit}자${over ? ' 초과' : ''}</span><i class="cr-bar"><i style="width:${pct}%"></i></i></div>
          <button type="button" class="cr-copy" data-copy="${esc(v.id)}">복사</button>
          <button type="button" class="cr-pick" data-pick="${esc(v.id)}">${mine ? '고름 취소' : '이 안 고르기'}</button></footer></article>`;
      })
      .join('');
  }

  async function copyText(button: HTMLButtonElement, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '복사함';
    } catch {
      button.textContent = '복사 막힘';
    }
  }

  async function copyAll(button: HTMLButtonElement): Promise<void> {
    const picks = picksOf(app);
    const parts: string[] = [];
    for (const q of app.questions) {
      const p = picks[String(q.id)];
      if (!p) continue;
      const vs = await loadVariants(q);
      const v = vs instanceof Error ? undefined : vs.find((x) => x.id === p);
      if (v) parts.push(`${q.id}. ${splitTitle(q.title).name} (${p})\n\n${v.text}`);
    }
    if (!parts.length) {
      button.textContent = '고른 안 없음';
      return;
    }
    await copyText(button, parts.join('\n\n\n'));
  }

  async function paint(): Promise<void> {
    setHash();
    const picks = picksOf(app);
    ctx.status(app.company + ' ' + daysLeft(app.deadline).big);
    ctx.root.innerHTML = top(picks) + qnav(picks) + '<section class="cr-main cr-body"></section>';
    const body = ctx.root.querySelector<HTMLElement>('.cr-main')!;
    if (tab === 'cases') body.innerHTML = casesView();
    else if (tab === 'links') body.innerHTML = linksView();
    else await draftsView(body, picks);
  }

  ctx.root.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!t) return;
    if (t.dataset.copyall) {
      void copyAll(t);
      return;
    }
    if (t.dataset.copy) {
      const q = app.questions[qid];
      const vs = variantsCache.get(app.id + '/' + q.id);
      const v = vs && !(vs instanceof Error) ? vs.find((x) => x.id === t.dataset.copy) : undefined;
      if (v) void copyText(t, v.text);
      return;
    }
    if (t.dataset.pick) {
      const q = app.questions[qid];
      const cur = picksOf(app)[String(q.id)];
      const next = cur === t.dataset.pick ? null : t.dataset.pick;
      t.disabled = true;
      void savePick(q, next).then(paint, () => paint());
      return;
    }
    note = '';
    if (t.dataset.tab) tab = t.dataset.tab === 'cases' || t.dataset.tab === 'links' ? t.dataset.tab : 'drafts';
    else if (t.dataset.q) {
      qid = Number(t.dataset.q) || 0;
      tab = 'drafts';
      show = picksOf(app)[String(app.questions[qid].id)] || '';
    } else if (t.dataset.show) show = t.dataset.show;
    else return;
    void paint();
  });
  ctx.root.addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement;
    if (!s.classList.contains('cr-app')) return;
    app = apps.find((a) => a.id === s.value) || app;
    qid = 0;
    show = '';
    void paint();
  });
  await loadPickEvents();
  show = picksOf(app)[String(app.questions[0]?.id)] || '';
  await paint();
}

dashRegistry().register({ id: 'career', title: '커리어', access: 'write', paths: [APPS, CASES, 'career/goal/research/', PICKS_DIR + '/'], render: renderCareer });
