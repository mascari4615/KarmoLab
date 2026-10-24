import { dashRegistry, esc, type DashPanelCtx } from './kit';
import { DISCOVERY_PATH, parseDiscovery, sourceLink, type DiscoveryFeed } from './discovery-data';

const when = (date: string): string => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
function styles(): void {
  if (document.getElementById('discovery-style')) return;
  const style = document.createElement('style'); style.id = 'discovery-style';
  style.textContent = `
    .discovery { max-width: 72rem; margin-inline: auto; color: var(--text-primary); }
    .discovery h2 { margin: 0 0 8px; } .discovery h3 { font-size: 1rem; margin: 24px 0 8px; }
    .discovery p { line-height: 1.65; } .discovery-controls { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin-block:24px; }
    .discovery > a { display:inline-flex; align-items:center; min-height:44px; color:var(--text-primary); text-underline-offset:4px; }
    .discovery input::placeholder { color:var(--text-secondary); opacity:1; }
    .discovery .discovery-controls input { min-height:44px; font-size:var(--font-size-sm); }
    .discovery label { display:grid; gap:6px; flex:1 1 12rem; } .discovery input, .discovery select, .discovery button { min-height:44px; font:inherit; }
    .discovery input, .discovery select { width:100%; min-width:0; font-size:var(--font-size-sm); color:var(--text-primary); background:var(--bg-secondary); border:1px solid var(--border); padding:8px; }
    .discovery-list { list-style:none; margin:0; padding:0; } .discovery-row { padding-block:16px; border-bottom:1px solid var(--border); overflow-wrap:anywhere; }
    .discovery-row a { display:inline-flex; align-items:center; min-height:44px; color:var(--text-primary); font-weight:600; text-underline-offset:4px; }
    .discovery-row small { display:block; color:var(--text-secondary); line-height:1.7; }
    .discovery details { margin-block:24px; } .discovery summary { cursor:pointer; min-height:44px; display:flex; align-items:center; }
    .discovery a:focus-visible, .discovery input:focus-visible, .discovery select:focus-visible, .discovery button:focus-visible, .discovery summary:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
    .discovery-status { color:var(--text-secondary); } .discovery-error { color:var(--text-primary); font-weight:600; }
  `;
  document.head.appendChild(style);
}
export async function renderDiscovery(ctx: DashPanelCtx): Promise<void> {
  styles();
  const { root } = ctx;
  let disposed = false, generation = 0, readFailed = false, feed: DiscoveryFeed | null = null;
  ctx.onDispose(() => { disposed = true; generation++; });
  root.innerHTML = `<section class="discovery"><h2>행사와 AI 소식</h2><p>관심 있는 행사 일정과 공식 AI 업데이트. 행사는 플래너에서도 함께 볼 수 있습니다.</p><a href="#planner">플래너 열기</a><div class="discovery-controls"><label>찾기<input type="search" aria-label="찾기" placeholder="행사, 제품, 출처"></label><label>종류<select aria-label="종류"><option value="">전체</option><option value="event">행사</option><option value="news">AI 소식</option></select></label><button type="button" class="btn btn-ghost" data-refresh>목록 다시 읽기</button></div><p class="discovery-status" role="status">목록 불러오는 중...</p><ul class="discovery-list"></ul><details><summary>출처와 수집 상태</summary><div class="discovery-sources"></div></details></section>`;
  const query = root.querySelector<HTMLInputElement>('input')!, filter = root.querySelector<HTMLSelectElement>('select')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!, list = root.querySelector<HTMLElement>('.discovery-list')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-refresh]')!, sources = root.querySelector<HTMLElement>('.discovery-sources')!;
  function paint(): void {
    if (!feed) return;
    const term = query.value.trim().toLocaleLowerCase();
    const items = feed.items.filter(item => (!filter.value || item.kind === filter.value) && (!term || `${item.title} ${item.sourceName} ${item.location || ''}`.toLocaleLowerCase().includes(term)));
    list.innerHTML = items.map(item => {
      const source = feed!.sources.find(s => s.id === item.sourceId)!;
      const date = item.kind === 'event' ? `${item.start} ~ ${new Date(Date.parse(item.end!) - 86400000).toISOString().slice(0, 10)}${item.location ? ` / ${item.location}` : ''}` : when(item.publishedAt!);
      return `<li class="discovery-row"><a href="${esc(sourceLink(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a><small>${esc(date)}</small>${item.kind === 'event' ? `<a href="#planner/discovery/${esc(item.start!)}" aria-label="${esc(item.title)} 달력에서 보기">달력에서 보기</a>` : ''}<small>${esc(item.sourceName)} / ${source.status === 'error' ? '최신 확인 실패, 이전 확인본' : '공식 출처'} / 확인 ${esc(when(item.checkedAt))}</small></li>`;
    }).join('') || '<li class="discovery-row">일치하는 항목이 없습니다. 검색어와 종류를 바꿔 보세요.</li>';
    const failed = feed.sources.filter(s => s.status === 'error');
    status.textContent = `${readFailed ? '목록 다시 읽기 실패, 이전 목록 표시. ' : ''}${items.length}개 표시 / 수집 ${when(feed.generatedAt)}${failed.length ? ` / ${failed.length}개 출처 확인 실패, 이전 확인본 포함` : ''}`;
    sources.innerHTML = feed.sources.map(s => `<p${s.status === 'error' ? ' class="discovery-error"' : ''}>${esc(s.name)}: ${s.status === 'ok' ? '확인됨' : '확인 실패'} / 최근 성공 ${s.lastSuccessAt ? esc(when(s.lastSuccessAt)) : '없음'}${s.status === 'error' ? ` / ${esc(s.error || '수집 실패')}` : ''}</p>`).join('');
  }
  async function load(): Promise<void> {
    const version = ++generation; refresh.disabled = true;
    status.textContent = '목록 불러오는 중...';
    try {
      const next = parseDiscovery(await ctx.repo.readJson<unknown>(DISCOVERY_PATH, { fresh: true }));
      if (disposed || version !== generation) return;
      feed = next; readFailed = false; paint();
    } catch (error) {
      if (disposed || version !== generation) return;
      readFailed = true;
      if (feed) paint();
      else status.textContent = '목록을 읽지 못했습니다. 다시 읽기를 눌러 주세요.';
      if ((error as { kind?: string }).kind === 'auth') throw error;
    } finally { if (!disposed && version === generation) refresh.disabled = false; }
  }
  query.addEventListener('input', paint); filter.addEventListener('change', paint);
  refresh.addEventListener('click', () => { void load().catch(() => { if (!disposed) status.textContent = '로그인이 만료됐습니다. Dash에 다시 로그인해 주세요.'; }); });
  await load();
}
dashRegistry().register({ id: 'discovery', title: '행사와 AI 소식', access: 'read', paths: [DISCOVERY_PATH], render: renderDiscovery });
