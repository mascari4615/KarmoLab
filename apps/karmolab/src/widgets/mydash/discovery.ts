import { dashRegistry, esc, type DashPanelCtx } from './kit';
import { DISCOVERY_PATH, parseDiscovery, sourceLink, type DiscoveryFeed, type DiscoveryItem } from './discovery-data';
import { discoveryContent, discoveryIcon, discoveryStyles, discoveryTitle, guardDiscoveryImages } from './discovery-content';

const when = (date: string): string => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
const postedDate = (date: string): string => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' }).format(new Date(date));
const dates = (item: DiscoveryItem): string => item.kind === 'event' ? `${item.start} ~ ${new Date(Date.parse(item.end!) - 86400000).toISOString().slice(0, 10)}` : when(item.publishedAt!);

export async function renderDiscovery(ctx: DashPanelCtx): Promise<void> {
  discoveryStyles();
  const { root } = ctx;
  let disposed = false, generation = 0, readFailed = false, feed: DiscoveryFeed | null = null, kind = '', selected = '';
  ctx.onDispose(() => { disposed = true; generation++; });
  root.innerHTML = `<section class="discovery"><div class="discovery-controls"><div class="discovery-tabs" aria-label="종류"><button type="button" data-kind="" aria-pressed="true">전체</button><button type="button" data-kind="news" aria-pressed="false">AI 소식</button><button type="button" data-kind="event" aria-pressed="false">행사</button></div><button class="btn btn-ghost" type="button" data-refresh>목록 다시 읽기</button><input type="search" aria-label="찾기" placeholder="제목, 내용, 출처 찾기"></div><p class="discovery-status" role="status">목록 불러오는 중...</p><div class="discovery-layout"><section class="discovery-list-pane" aria-label="소식 목록"><ul class="discovery-list"></ul></section><article class="discovery-reader" aria-label="선택한 소식"></article></div><details class="discovery-source-status"><summary>출처와 수집 상태</summary><div class="discovery-sources"></div></details></section>`;
  const surface = root.querySelector<HTMLElement>('.discovery')!;
  const query = root.querySelector<HTMLInputElement>('input')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!, list = root.querySelector<HTMLElement>('.discovery-list')!, reader = root.querySelector<HTMLElement>('.discovery-reader')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-refresh]')!, sources = root.querySelector<HTMLElement>('.discovery-sources')!;

  function openItem(item: DiscoveryItem, activate = false): void {
    selected = item.id;
    const source = feed!.sources.find(row => row.id === item.sourceId)!;
    const history = item.version ? feed!.items.filter(row => row.sourceId === item.sourceId && row.id !== item.id) : [];
    reader.innerHTML = `<button type="button" class="discovery-back">목록으로</button><h2>${esc(discoveryTitle(item))}</h2><p class="discovery-meta">${esc(item.sourceName)} / ${esc(dates(item))}${source.status === 'error' ? ' / 최신 확인 실패, 이전 확인본' : ''}</p>${discoveryContent(item)}${history.length ? `<details><summary>이전 릴리스 ${history.length}개</summary>${history.map(row => `<p><a href="${esc(sourceLink(row.url))}" target="_blank" rel="noopener noreferrer">${esc(row.title)}</a></p>`).join('')}</details>` : ''}<div class="discovery-actions"><a href="${esc(sourceLink(item.url))}" target="_blank" rel="noopener noreferrer">공식 원문 읽기</a>${item.kind === 'event' ? `<a href="#planner/discovery/${esc(item.start!)}" aria-label="${esc(item.title)} 달력에서 보기">달력에서 보기</a>` : ''}</div>`;
    guardDiscoveryImages(reader);
    reader.scrollTop = 0;
    for (const button of list.querySelectorAll<HTMLElement>('[data-item]')) button.setAttribute('aria-current', String(button.dataset.item === selected));
    reader.querySelector<HTMLButtonElement>('.discovery-back')!.addEventListener('click', () => {
      surface.classList.remove('discovery--reading');
      Array.from(list.querySelectorAll<HTMLButtonElement>('[data-item]')).find(button => button.dataset.item === selected)?.focus();
    });
    if (activate) {
      surface.classList.add('discovery--reading');
      if (matchMedia('(max-width:850px)').matches) reader.querySelector<HTMLButtonElement>('.discovery-back')!.focus();
    }
  }

  function paint(): void {
    if (!feed) return;
    const term = query.value.trim().toLocaleLowerCase();
    const releaseSources = new Set<string>();
    const items = [...feed.items].sort((a, b) => a.kind !== b.kind ? a.kind === 'news' ? -1 : 1 : a.kind === 'event' ? a.start!.localeCompare(b.start!) : b.publishedAt!.localeCompare(a.publishedAt!)).filter(item => {
      if (item.version) { if (releaseSources.has(item.sourceId)) return false; releaseSources.add(item.sourceId); }
      return (!kind || item.kind === kind) && (!term || `${item.title} ${item.headline || ''} ${item.sourceName} ${item.location || ''} ${item.summary || ''} ${item.reading || ''} ${item.body || ''}`.toLocaleLowerCase().includes(term));
    });
    list.innerHTML = items.map(item => `<li class="discovery-row"><button type="button" class="discovery-story" data-item="${esc(item.id)}" aria-current="${item.id === selected}"><img class="discovery-thumb ${item.imageUrl ? '' : 'discovery-thumb--icon'}" src="${esc(item.imageUrl ? sourceLink(item.imageUrl) : discoveryIcon(item))}" alt="" referrerpolicy="no-referrer" loading="lazy"><div class="discovery-copy"><h3>${esc(discoveryTitle(item))}</h3><p>${esc(item.summary || item.body?.slice(0, 180) || item.location || '공식 원문 내용 읽기')}</p><small>${esc(item.sourceName)} / ${esc(item.kind === 'event' ? dates(item) : postedDate(item.publishedAt!))}</small></div></button></li>`).join('') || '<li class="discovery-row">일치하는 항목이 없습니다. 검색어와 종류를 바꿔 보세요.</li>';
    guardDiscoveryImages(list);
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-item]')) button.addEventListener('click', () => openItem(items.find(item => item.id === button.dataset.item)!, true));
    const item = items.find(row => row.id === selected) || items[0];
    if (item) openItem(item); else { reader.innerHTML = ''; surface.classList.remove('discovery--reading'); }
    const failed = feed.sources.filter(row => row.status === 'error');
    status.textContent = `${readFailed ? '목록 다시 읽기 실패, 이전 목록 표시. ' : ''}${items.length}개 표시 / 수집 ${when(feed.generatedAt)}${failed.length ? ` / ${failed.length}개 출처 확인 실패, 이전 확인본 포함` : ''}`;
    sources.innerHTML = feed.sources.map(source => `<p${source.status === 'error' ? ' class="discovery-error"' : ''}>${esc(source.name)}: ${source.status === 'ok' ? '확인됨' : '확인 실패'} / 최근 성공 ${source.lastSuccessAt ? esc(when(source.lastSuccessAt)) : '없음'}${source.status === 'error' ? ` / ${esc(source.error || '수집 실패')}` : ''}</p>`).join('');
  }

  async function load(): Promise<void> {
    const version = ++generation; refresh.disabled = true; status.textContent = '목록 불러오는 중...';
    try {
      const next = parseDiscovery(await ctx.repo.readJson<unknown>(DISCOVERY_PATH, { fresh: true }));
      if (disposed || version !== generation) return;
      feed = next; readFailed = false; paint();
    } catch (error) {
      if (disposed || version !== generation) return;
      readFailed = true;
      if (feed) paint(); else status.textContent = '목록을 읽지 못했습니다. 다시 읽기를 눌러 주세요.';
      if ((error as { kind?: string }).kind === 'auth') throw error;
    } finally { if (!disposed && version === generation) refresh.disabled = false; }
  }
  query.addEventListener('input', paint);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-kind]')) button.addEventListener('click', () => {
    kind = button.dataset.kind!; surface.classList.remove('discovery--reading');
    for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-kind]')) tab.setAttribute('aria-pressed', String(tab === button));
    paint();
  });
  refresh.addEventListener('click', () => { void load().catch(() => { if (!disposed) status.textContent = '로그인이 만료됐습니다. Dash에 다시 로그인해 주세요.'; }); });
  await load();
}

dashRegistry().register({ id: 'discovery', title: '행사와 AI 소식', access: 'read', paths: [DISCOVERY_PATH], render: renderDiscovery });
