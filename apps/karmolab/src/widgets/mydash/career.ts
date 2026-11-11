/**
 * 패널: 커리어. 지원서별 자소서 시안과 합격 사례.
 *
 * 정본은 private memo 하나 (Claude, Codex 공통, 스킬 `career`):
 *  - `data/career/applications.json` 지원 목록, 문항, 시안 파일 자리, 고른 안
 *  - `data/career/cases.json` 합격 사례 요약
 *  - 시안 본문은 `<draftsDir>/<file>` 의 `<!-- answer:X -->` 주석 사이
 * 형식: memo `data/career/README.md`. 지원별 HTML 생성기 (`build-viewer.mjs`) 와 같은 규칙
 * 읽기 전용. 고른 안은 memo 정본 `picks` 에서 편집
 */
import { dashRegistry, esc, safeLinkUrl, type DashPanelCtx } from './kit';

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

const APPS = 'data/career/applications.json';
const CASES = 'data/career/cases.json';
const STATUS: Record<string, string> = {
  drafting: '작성 중',
  submitted: '제출함',
  passed: '합격',
  failed: '불합격',
  closed: '마감',
};

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

function dday(deadline?: string): string {
  if (!deadline) return '';
  const end = Date.parse(deadline);
  if (!Number.isFinite(end)) return '';
  const left = end - Date.now();
  if (left < 0) return '마감 지남';
  const days = Math.floor(left / 86400000);
  return days === 0 ? `오늘 마감, ${Math.ceil(left / 3600000)}시간 남음` : `D-${days}`;
}

function kst(iso?: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(iso));
}

async function renderCareer(ctx: DashPanelCtx): Promise<void> {
  ctx.root.classList.add('cr');
  ctx.root.innerHTML = '<p class="cr-muted">커리어 정본을 읽는 중</p>';
  const [appsDoc, casesDoc] = await Promise.all([
    ctx.repo.readJson<{ applications: Application[] }>(APPS),
    ctx.repo.readJson<{ cases: CaseItem[] }>(CASES).catch(() => ({ cases: [] as CaseItem[] })),
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
  let tab: 'drafts' | 'cases' = sub[2] === 'cases' ? 'cases' : 'drafts';
  let qid = 0;
  const variantsCache = new Map<string, Variant[] | Error>();

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
      value = q.file ? parseVariants(await ctx.repo.readText(app.draftsDir + '/' + q.file)) : [];
    } catch (e) {
      value = e instanceof Error ? e : new Error(String(e));
    }
    variantsCache.set(key, value);
    return value;
  }

  function head(): string {
    const picks = app.picks || {};
    const active = app.questions.filter((q) => !q.paused);
    const picked = active.filter((q) => picks[String(q.id)]).length;
    const links = (app.links || [])
      .map((l) => {
        const url = safeLinkUrl(l.url);
        return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(l.label)}</a>` : '';
      })
      .concat([ghLink(app.research, '공고 조사'), ghLink(app.draftsDir + '/README.md', '시안 가이드')])
      .filter(Boolean)
      .join('');
    const appPicker =
      apps.length > 1
        ? `<select class="cr-app" aria-label="지원서">${apps.map((a) => `<option value="${esc(a.id)}"${a.id === app.id ? ' selected' : ''}>${esc(a.company)} / ${esc(a.role)}</option>`).join('')}</select>`
        : '';
    return `<header class="cr-head">
      <div><h2>${esc(app.company)} <span>${esc(app.role)}</span></h2>
      <p>${esc(STATUS[app.status] || app.status)} / 마감 ${esc(kst(app.deadline))} <b>${esc(dday(app.deadline))}</b> / 고른 안 ${picked} / ${active.length}</p></div>
      ${appPicker}<nav class="cr-links">${links}</nav></header>
      <nav class="cr-tabs" role="tablist">
        <button type="button" role="tab" data-tab="drafts" aria-selected="${tab === 'drafts'}">내 자소서 시안</button>
        <button type="button" role="tab" data-tab="cases" aria-selected="${tab === 'cases'}">합격 사례 <span>${(app.caseIds || []).length}</span></button>
      </nav>`;
  }

  function casesView(): string {
    const list = (app.caseIds || []).map((id) => casesDoc.cases.find((c) => c.id === id)).filter((c): c is CaseItem => !!c);
    if (!list.length) return `<p class="cr-muted">연결된 합격 사례가 없어요. memo <code>${CASES}</code> 에 넣고 <code>caseIds</code> 에 연결하세요.</p>`;
    return `<p class="cr-muted">질문과 답변은 요약. 합격 표시는 출처 기준이고 회사 통지 원본 검증이 아님. 참고 메모는 내 시안에 대한 제안이며 공식 평가 기준 아님.</p>
      ${list
        .map((c) => {
          const url = safeLinkUrl(c.url);
          return `<article class="cr-case"><h3>${esc(c.company)} / ${esc(c.role)} <span>${esc(c.period)}</span></h3>
          <p class="cr-muted">${esc(c.stage)}${c.checkedAt ? ' / 확인 ' + esc(c.checkedAt) : ''}</p>
          ${c.takeaway ? `<p>${esc(c.takeaway)}</p>` : ''}
          ${c.answers.length ? `<ol>${c.answers.map((a) => `<li><b>${esc(a.question)}</b><p>${esc(a.answer)}</p><p class="cr-note">${esc(a.note)}</p></li>`).join('')}</ol>` : ''}
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.source)} 원문</a>` : ''}</article>`;
        })
        .join('')}`;
  }

  async function draftsView(body: HTMLElement): Promise<void> {
    const picks = app.picks || {};
    const q = app.questions[qid] || app.questions[0];
    const nav = app.questions
      .map(
        (x, i) =>
          `<button type="button" data-q="${i}" aria-current="${i === qid}"${x.paused ? ' class="cr-paused"' : ''}>${x.id}. ${esc(x.title)}${picks[String(x.id)] ? ` <b>${esc(picks[String(x.id)])}</b>` : ''}${x.paused ? ' <small>보류</small>' : ''}</button>`
      )
      .join('');
    const defs = q.definitions && q.definitions.length ? `<ul>${q.definitions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
    body.innerHTML = `<div class="cr-drafts"><nav class="cr-qnav" aria-label="문항">${nav}</nav>
      <section><div class="cr-q"><h3>${q.id}. ${esc(q.title)} <span>${q.limit}자</span></h3><p>${esc(q.prompt)}</p>${defs}</div>
      <div class="cr-variants"><p class="cr-muted">시안 읽는 중</p></div></section></div>`;
    const box = body.querySelector<HTMLElement>('.cr-variants')!;
    if (q.paused) {
      box.innerHTML = '<p class="cr-muted">보류한 문항. 시안 없음.</p>';
      return;
    }
    const vs = await loadVariants(q);
    if (!ctx.isCurrent() || !box.isConnected) return;
    if (vs instanceof Error) {
      box.innerHTML = `<p>시안 파일을 못 읽었어요: <code>${esc(app.draftsDir + '/' + (q.file || ''))}</code></p>`;
      return;
    }
    if (!vs.length) {
      box.innerHTML = `<p class="cr-muted">시안이 없어요. ${ghLink(app.draftsDir + '/' + q.file, '파일 열기')}</p>`;
      return;
    }
    const pick = picks[String(q.id)];
    box.innerHTML =
      vs
        .map((v) => {
          const n = v.text.length;
          const over = v.text.replace(/\n/g, '\r\n').length > q.limit;
          return `<article class="cr-variant${pick === v.id ? ' cr-picked' : ''}"><h4>${v.id}. ${esc(v.title)}${pick === v.id ? ' <b>고른 안</b>' : ''}</h4>
          ${v.focus ? `<p class="cr-note">중심: ${esc(v.focus)}</p>` : ''}${v.note ? `<p class="cr-note">장점: ${esc(v.note)}</p>` : ''}
          <div class="cr-text">${esc(v.text).replace(/\n/g, '<br>')}</div>
          <footer><span class="${over ? 'cr-over' : ''}">${n} / ${q.limit}자${over ? ' 초과' : ''}</span><button type="button" data-copy="${esc(v.id)}">본문 복사</button></footer></article>`;
        })
        .join('') + `<p class="cr-muted cr-src">정본 ${ghLink(app.draftsDir + '/' + q.file, q.file || '')}. 고른 안은 applications.json 의 picks.</p>`;
    box.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
      b.addEventListener('click', async () => {
        const v = vs.find((x) => x.id === b.dataset.copy);
        if (!v) return;
        try {
          await navigator.clipboard.writeText(v.text);
          b.textContent = '복사함';
        } catch {
          b.textContent = '복사 막힘';
        }
      })
    );
  }

  async function paint(): Promise<void> {
    setHash();
    ctx.status(app.company + ' ' + dday(app.deadline));
    ctx.root.innerHTML = head() + '<div class="cr-body"></div>';
    const body = ctx.root.querySelector<HTMLElement>('.cr-body')!;
    if (tab === 'cases') body.innerHTML = casesView();
    else await draftsView(body);
  }

  ctx.root.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-tab], [data-q]');
    if (!t) return;
    if (t.dataset.tab) tab = t.dataset.tab === 'cases' ? 'cases' : 'drafts';
    if (t.dataset.q) qid = Number(t.dataset.q) || 0;
    void paint();
  });
  ctx.root.addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement;
    if (!s.classList.contains('cr-app')) return;
    app = apps.find((a) => a.id === s.value) || app;
    qid = 0;
    void paint();
  });
  await paint();
}

dashRegistry().register({ id: 'career', title: '커리어', access: 'read', paths: [APPS, CASES, 'career/goal/research/'], render: renderCareer });
