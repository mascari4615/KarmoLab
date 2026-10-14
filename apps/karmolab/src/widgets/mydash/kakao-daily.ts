import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx } from './kit';

type Occurrence = { room: string; at: string; order: number; bot: boolean };
type Link = { url: string; label: string; title?: string; description?: string; site?: string; image?: string; rooms: string[]; dates?: string[]; topic?: string; bot?: boolean; occurrences?: Occurrence[] };
type Message = { id: string; at: string; order: number; speaker: string; text: string };
type Conversation = { room: string; botMessages: number; messages: Message[]; summary: { status: string; error?: string; topics: { title: string; summary: string; messageIds: string[] }[] } };
type Content = { schema: string; rooms: Conversation[] };
type Run = { id: string; startedAt: string; finishedAt: string; error?: string; notice?: string; selfMessages?: number; links: Link[]; conversationPath?: string; clear?: { rooms?: { room: string; cleared?: boolean; empty?: boolean; processed?: boolean }[]; errors?: string[] } };
type Daily = { schema: string; date: string; runs: Run[] };
type Index = { schema: string; days: { date: string; links: number; runs: number }[] };
const DIR = 'data/kakao-daily';
const ROUTE = 'kakao-daily';
const validDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const time = (s: string): string => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s));

async function render(ctx: DashPanelCtx): Promise<void> {
  const { root, repo } = ctx;
  let current = true;
  let request = 0;
  ctx.onDispose(() => { current = false; });
  root.innerHTML = '<div class="kd" role="status">카톡 보고서 불러오는 중...</div>';
  let index: Index;
  try {
    index = await repo.readJson<Index>(DIR + '/index.json');
  } catch (e) {
    if ((e as { kind?: string }).kind !== 'notfound') throw e;
    root.innerHTML = '<div class="kd"><h2>카톡 정리</h2><p>아직 저장된 보고서가 없습니다. 다음 카톡 정리부터 날짜별로 쌓입니다.</p></div>';
    return;
  }
  if (!current) return;
  if (index.schema !== 'kakao-daily-index/1' || !Array.isArray(index.days)) throw new Error('카톡 보고서 목록 형식이 맞지 않습니다.');
  const days = index.days.filter((d) => validDate(d.date)).sort((a, b) => b.date.localeCompare(a.date));
  ctx.setCount(ROUTE, days[0] ? `${days[0].links}개` : '');
  if (!days.length) {
    root.innerHTML = '<div class="kd"><h2>카톡 정리</h2><p>아직 저장된 보고서가 없습니다.</p></div>';
    return;
  }
  let date = '';
  const fromHash = (): string => {
    const value = location.hash.replace(/^#/, '').split('/')[1] || '';
    return validDate(value) ? value : days[0].date;
  };
  async function show(selected: string): Promise<void> {
    const seq = ++request;
    date = selected;
    const pos = days.findIndex((d) => d.date === date);
    root.innerHTML = `<div class="kd"><nav class="kd-dates" aria-label="보고서 날짜"><button type="button" data-day="${esc(days[pos + 1]?.date || '')}" ${pos < 0 || pos + 1 >= days.length ? 'disabled' : ''} aria-label="이전 보고서">이전</button><label>날짜 <select data-date aria-label="보고서 날짜">${pos < 0 ? `<option value="${esc(date)}">${esc(date)} (보고서 없음)</option>` : ''}${days.map((d) => `<option value="${esc(d.date)}" ${d.date === date ? 'selected' : ''}>${esc(d.date)} , ${d.links}개</option>`).join('')}</select></label><button type="button" data-day="${esc(days[pos - 1]?.date || '')}" ${pos <= 0 ? 'disabled' : ''} aria-label="다음 보고서">다음</button></nav><div data-content role="status">보고서 불러오는 중...</div></div>`;
    root.querySelector<HTMLSelectElement>('[data-date]')!.onchange = (e) => navigate((e.target as HTMLSelectElement).value);
    root.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) => { b.onclick = () => navigate(b.dataset.day || ''); });
    const content = root.querySelector<HTMLElement>('[data-content]')!;
    if (pos < 0) { content.innerHTML = '<p>이 날짜의 보고서는 없습니다. 위에서 저장된 날짜를 선택하세요.</p>'; return; }
    try {
      const daily = await repo.readJson<Daily>(`${DIR}/${date}.json`);
      if (!current || request !== seq) return;
      if (daily.schema !== 'kakao-daily/1' || daily.date !== date || !Array.isArray(daily.runs)) throw new Error('보고서 형식이 맞지 않습니다.');
      const conversations = await Promise.all(daily.runs.filter((r) => r.conversationPath).map(async (r) => {
        if (!/^data\/kakao-daily-content\/\d{4}-\d{2}-\d{2}\/\d+\.json$/.test(r.conversationPath!)) throw new Error('대화 원문 경로 오류');
        const result = await repo.readJson<Content>(r.conversationPath!);
        if (result.schema !== 'kakao-daily-content/1' || !Array.isArray(result.rooms)) throw new Error('대화 원문 형식 오류');
        return result.rooms;
      }));
      if (!current || request !== seq) return;
      paint(content, daily, conversations.flat());
      ctx.status('한국 시각 기준, 정리 실행일별 보고서');
    } catch (e) {
      if (!current || request !== seq) return;
      content.innerHTML = '<p>보고서를 읽지 못했습니다. 날짜를 다시 선택하거나 재시도하세요.</p><button type="button" data-retry>다시 시도</button>';
      content.querySelector<HTMLButtonElement>('[data-retry]')!.onclick = () => { void show(selected); };
      ctx.status((e as { kind?: string }).kind === 'auth' ? '로그인이 만료되었습니다. 새로고침 후 로그인하세요.' : '보고서 읽기 실패');
    }
  }
  function navigate(selected: string): void {
    if (!validDate(selected)) return;
    history.replaceState({}, '', location.pathname + '#' + ROUTE + '/' + selected);
    void show(selected);
  }
  function paint(content: HTMLElement, daily: Daily, conversations: Conversation[]): void {
    const merged = new Map<string, Link>();
    for (const run of daily.runs) for (const link of run.links) {
      const previous = merged.get(link.url);
      merged.set(link.url, previous ? { ...previous, rooms: [...new Set([...previous.rooms, ...link.rooms])], occurrences: [...(previous.occurrences || []), ...(link.occurrences || [])], bot: !!previous.bot && !!link.bot } : link);
    }
    const links = [...merged.values()];
    const rooms = [...new Set([...links.flatMap((l) => l.rooms), ...conversations.map((c) => c.room)])].sort();
    const held = daily.runs.flatMap((r) => r.clear?.errors || []);
    const messages = conversations.flatMap((c) => c.messages.map((m) => ({ ...m, room: c.room })));
    content.removeAttribute('role');
    content.innerHTML = `<header class="kd-head"><h2>${esc(daily.date)} 카톡 정리</h2><p>사람 대화 ${messages.length}건, 링크 ${links.filter((l) => !l.bot).length}개. 봇 소식 기본 숨김</p></header><div class="kd-tools"><label>방 <select data-room><option value="">전체 방</option>${rooms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label><label>정렬 <select data-sort><option value="old">시간순</option><option value="new">최근순</option><option value="topic">주제별</option></select></label><label class="kd-search">검색 <input type="search" data-search placeholder="대화, 제목, 설명" /></label><label class="kd-bots"><input type="checkbox" data-bots /> 봇 링크 포함</label></div><nav class="kd-tabs" aria-label="내용 보기"><button type="button" data-view="summary" aria-pressed="true">대화 요약</button><button type="button" data-view="raw" aria-pressed="false">대화 원문</button><button type="button" data-view="links" aria-pressed="false">링크 미리보기</button><span data-count aria-live="polite"></span></nav><div data-reading></div><details class="kd-details"><summary>처리 내역${held.length ? `, 삭제 보류 ${held.length}건` : ''}</summary><p>정리 실행일 기준, 공유일은 각 항목에 표시.</p>${daily.runs.map((r) => `<p>${esc(time(r.finishedAt))}: ${r.error ? esc(r.error) : '저장소 반영 확인'}</p>${(r.clear?.rooms || []).map((v) => `<p>${esc(v.room)}: ${v.cleared ? '삭제' : v.empty ? '빈 방' : '삭제 미확인'}</p>`).join('')}${(r.clear?.errors || []).map((v) => `<p>${esc(v)}</p>`).join('')}`).join('')}</details>`;
    const room = content.querySelector<HTMLSelectElement>('[data-room]')!;
    const search = content.querySelector<HTMLInputElement>('[data-search]')!;
    const sort = content.querySelector<HTMLSelectElement>('[data-sort]')!;
    const bots = content.querySelector<HTMLInputElement>('[data-bots]')!;
    const reading = content.querySelector<HTMLElement>('[data-reading]')!;
    let view = 'summary';
    let limit = 60;
    let selectedIds: Set<string> | null = null;
    const atText = (at: string): string => at.includes('T') && Number.isFinite(Date.parse(at)) ? `${at.slice(5, 10)} ${time(at)}` : at ? `${at}, 시각 미기록` : '공유 시각 미기록';
    const linkAt = (l: Link): string => (l.occurrences || []).filter((o) => !room.value || o.room === room.value).map((o) => o.at).sort()[0] || l.dates?.[0] || '';
    const match = (value: string): boolean => !search.value || value.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
    function renderReading(): void {
      content.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
      const count = content.querySelector<HTMLElement>('[data-count]')!;
      if (view === 'summary') {
        const selected = conversations.filter((c) => !room.value || c.room === room.value);
        count.textContent = `${selected.reduce((n, c) => n + c.messages.length, 0)}건`;
        const entries = selected.flatMap((c) => c.summary.topics.map((topic, topicIndex) => ({
          c, topic, topicIndex, conversationIndex: conversations.indexOf(c),
          at: c.messages.filter((m) => topic.messageIds.includes(m.id)).map((m) => m.at).sort()[0] || '',
        }))).filter((entry) => match(entry.topic.title + ' ' + entry.topic.summary));
        entries.sort((a, b) => sort.value === 'topic' ? a.topic.title.localeCompare(b.topic.title) : (sort.value === 'new' ? -1 : 1) * a.at.localeCompare(b.at));
        reading.innerHTML = selected.length ? selected.filter((c) => c.summary.status !== 'ready').map((c) => `<p role="status">${esc(c.room)}: ${esc(c.summary.error || '대화 요약 대기, 원문에서 확인 가능')}</p>`).join('') + entries.map(({ c, topic, topicIndex, conversationIndex, at }) => `<article class="kd-summary" data-at="${esc(at)}"><p class="kd-meta">${esc(c.room)}, ${esc(atText(at))}</p><h4>${esc(topic.title)}</h4><p>${esc(topic.summary)}</p><button type="button" data-evidence-conv="${conversationIndex}" data-evidence-index="${topicIndex}">해당 원문 보기 (${topic.messageIds.length}건)</button></article>`).join('') + (!entries.length ? '<p>조건에 맞는 요약 없음. 대화 원문에서 확인 가능.</p>' : '') : '<p>이 보고서에는 대화 원문과 요약이 아직 없습니다. 새 수집부터 저장합니다.</p>';
        reading.querySelectorAll<HTMLButtonElement>('[data-evidence-conv]').forEach((b) => { b.onclick = () => {
          const c = conversations[Number(b.dataset.evidenceConv)];
          const topic = c.summary.topics[Number(b.dataset.evidenceIndex)];
          search.value = ''; room.value = c.room; selectedIds = new Set(topic.messageIds); view = 'raw'; limit = 60; renderReading();
          reading.querySelector<HTMLButtonElement>('[data-clear-evidence]')?.focus();
        }; });
      } else if (view === 'raw') {
        const found = messages.filter((m) => (!room.value || m.room === room.value) && (!selectedIds || selectedIds.has(m.id)) && match(m.text));
        found.sort((a, b) => (sort.value === 'new' ? -1 : 1) * (a.at.localeCompare(b.at) || a.order - b.order));
        count.textContent = `${found.length}건`;
        reading.innerHTML = `<p class="kd-caption">발화자 익명, 연락처 가림. 봇 메시지 제외. 대화 문장은 원문 그대로.</p>${selectedIds ? '<button type="button" data-clear-evidence>방 전체 원문 보기</button>' : ''}<ol class="kd-transcript">${found.slice(0, limit).map((m) => `<li><div class="kd-meta"><time datetime="${esc(m.at)}">${esc(atText(m.at))}</time> ${esc(m.room)}, ${esc(m.speaker)}</div><p>${esc(m.text)}</p></li>`).join('')}</ol>${!found.length ? '<p>조건에 맞는 대화 없음.</p>' : ''}${found.length > limit ? '<button type="button" data-more>대화 더 보기</button>' : ''}`;
        reading.querySelector<HTMLButtonElement>('[data-clear-evidence]')?.addEventListener('click', () => { selectedIds = null; renderReading(); });
        reading.querySelector<HTMLButtonElement>('[data-more]')?.addEventListener('click', () => { limit += 60; renderReading(); });
      } else {
        const found = links.filter((l) => (bots.checked || !l.bot) && (!room.value || l.rooms.includes(room.value)) && match([l.label, l.title, l.description, l.url].join(' ')));
        if (sort.value !== 'topic') found.sort((a, b) => (sort.value === 'new' ? -1 : 1) * linkAt(a).localeCompare(linkAt(b)));
        count.textContent = `${found.length}개`;
        const groups = new Map<string, Link[]>();
        for (const l of found) { const key = sort.value === 'topic' ? l.topic || '미분류' : ''; groups.set(key, [...(groups.get(key) || []), l]); }
        reading.innerHTML = [...groups].map(([topic, items]) => `<section class="kd-topic">${topic ? `<h3>${esc(topic)}</h3>` : ''}<ul>${items.map((l) => {
          const url = safeLinkUrl(l.url), image = safeLinkUrl(l.image || '');
          let domain = ''; try { domain = new URL(l.url).hostname; } catch { /* 열 수 없는 주소 표시 */ }
          return `<li><article class="kd-link">${image ? `<a class="kd-thumb" href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></a>` : ''}<div><h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(l.title || l.label || '제목 없는 링크')}</a>` : esc(l.label)}</h4>${l.description ? `<p class="kd-description">${esc(l.description)}</p>` : ''}<p class="kd-meta">${esc(l.site || domain)}, ${esc(l.rooms.join(', '))}, ${esc(atText(linkAt(l)))}${l.bot ? ', 봇 공유' : ''}</p></div></article></li>`;
        }).join('')}</ul></section>`).join('') || '<p>조건에 맞는 링크 없음.</p>';
        reading.querySelectorAll<HTMLImageElement>('img').forEach((img) => { img.onerror = () => { img.closest('.kd-thumb')?.remove(); }; });
      }
    }
    content.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => { b.onclick = () => { view = b.dataset.view!; selectedIds = null; limit = 60; renderReading(); }; });
    room.onchange = () => { selectedIds = null; limit = 60; renderReading(); };
    search.oninput = renderReading; sort.onchange = renderReading; bots.onchange = renderReading;
    renderReading();
  }
  const onHash = (): void => { if (location.hash.startsWith('#' + ROUTE + '/') && fromHash() !== date) void show(fromHash()); };
  window.addEventListener('hashchange', onHash);
  ctx.onDispose(() => { window.removeEventListener('hashchange', onHash); });
  await show(fromHash());
}

dashRegistry().register({ id: ROUTE, title: '카톡 정리', access: 'read', paths: [DIR], render });
