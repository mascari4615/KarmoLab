import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx } from './kit';

type Link = { url: string; label: string; title?: string; description?: string; site?: string; rooms: string[]; dates?: string[]; topic?: string; bot?: boolean };
type Run = { id: string; startedAt: string; finishedAt: string; error?: string; notice?: string; selfMessages?: number; links: Link[]; clear?: { rooms?: { room: string; cleared?: boolean; empty?: boolean; processed?: boolean }[]; errors?: string[] } };
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
    root.innerHTML = `<div class="kd"><nav class="kd-dates" aria-label="보고서 날짜"><button type="button" data-day="${esc(days[pos + 1]?.date || '')}" ${pos < 0 || pos + 1 >= days.length ? 'disabled' : ''}>이전 보고서</button><label>날짜 <select data-date aria-label="보고서 날짜">${pos < 0 ? `<option value="${esc(date)}">${esc(date)} (보고서 없음)</option>` : ''}${days.map((d) => `<option value="${esc(d.date)}" ${d.date === date ? 'selected' : ''}>${esc(d.date)} , ${d.links}개</option>`).join('')}</select></label><button type="button" data-day="${esc(days[pos - 1]?.date || '')}" ${pos <= 0 ? 'disabled' : ''}>다음 보고서</button></nav><div data-content role="status">보고서 불러오는 중...</div></div>`;
    root.querySelector<HTMLSelectElement>('[data-date]')!.onchange = (e) => navigate((e.target as HTMLSelectElement).value);
    root.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) => { b.onclick = () => navigate(b.dataset.day || ''); });
    const content = root.querySelector<HTMLElement>('[data-content]')!;
    if (pos < 0) { content.innerHTML = '<p>이 날짜의 보고서는 없습니다. 위에서 저장된 날짜를 선택하세요.</p>'; return; }
    try {
      const daily = await repo.readJson<Daily>(`${DIR}/${date}.json`);
      if (!current || request !== seq) return;
      if (daily.schema !== 'kakao-daily/1' || daily.date !== date || !Array.isArray(daily.runs)) throw new Error('보고서 형식이 맞지 않습니다.');
      paint(content, daily);
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
  function paint(content: HTMLElement, daily: Daily): void {
    const merged = new Map<string, Link>();
    for (const run of daily.runs) for (const link of run.links) {
      const previous = merged.get(link.url);
      merged.set(link.url, previous ? { ...previous, rooms: [...new Set([...previous.rooms, ...link.rooms])] } : link);
    }
    const links = [...merged.values()].sort((a, b) => Number(a.bot || false) - Number(b.bot || false));
    const rooms = [...new Set(links.flatMap((l) => l.rooms))].sort();
    const errors = daily.runs.filter((r) => r.error);
    const held = daily.runs.flatMap((r) => r.clear?.errors || []);
    content.removeAttribute('role');
    content.innerHTML = `<header class="kd-head"><h2>${esc(daily.date)} 카톡 정리</h2><p>새 링크 <strong>${links.length}개</strong>${rooms.length ? `, 공유한 방 ${rooms.length}개` : ''}. ${daily.runs.map((r) => time(r.finishedAt)).join(', ')} 정리</p><p class="kd-caption">정리 실행일 기준. 링크에 표시된 공유일은 이전 날짜일 수 있습니다.</p></header>${errors.length || held.length ? `<p class="kd-notice" role="status">${errors.length ? `정리 실패 ${errors.length}건. ` : ''}${held.length ? `삭제 보류 ${held.length}건. ` : ''}아래 처리 내역에서 이유를 확인하세요.</p>` : ''}<div class="kd-filter"><label>방 <select data-room><option value="">전체 방</option>${rooms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label><label>검색 <input type="search" data-search placeholder="제목, 설명, 사이트" /></label><span data-count aria-live="polite"></span></div><div data-links></div><details class="kd-details"><summary>처리 내역 (${daily.runs.length}회 실행)</summary>${daily.runs.map((r) => `<section><h3>${esc(time(r.startedAt))} → ${esc(time(r.finishedAt))}</h3>${r.error ? `<p>실패: ${esc(r.error)}</p>` : '<p>링크와 처리 위치 저장소 반영 확인</p>'}${r.notice ? `<p>${esc(r.notice)}</p>` : ''}<p>나와의채팅 새 메시지 ${r.selfMessages || 0}개</p><ul>${(r.clear?.rooms || []).map((v) => `<li>${esc(v.room)}: ${v.cleared ? '대화 삭제' : v.empty ? '빈 방' : v.processed ? '처리 완료 확인, 삭제 미실행' : '삭제 미확인'}</li>`).join('')}${(r.clear?.errors || []).map((v) => `<li>삭제 보류: ${esc(v)}</li>`).join('')}${!r.clear ? '<li>대화 삭제 결과 미확인</li>' : ''}</ul></section>`).join('')}</details>`;
    const room = content.querySelector<HTMLSelectElement>('[data-room]')!;
    const search = content.querySelector<HTMLInputElement>('[data-search]')!;
    const list = content.querySelector<HTMLElement>('[data-links]')!;
    function filter(): void {
      const query = search.value.trim().toLocaleLowerCase();
      const found = links.filter((l) => (!room.value || l.rooms.includes(room.value)) && (!query || [l.label, l.title, l.description, l.site, l.url].join(' ').toLocaleLowerCase().includes(query)));
      content.querySelector<HTMLElement>('[data-count]')!.textContent = `${found.length}개`;
      const groups = new Map<string, Link[]>();
      for (const l of found) {
        const topic = l.topic || (l.bot ? '봇이 공유한 링크' : '공유 링크');
        groups.set(topic, [...(groups.get(topic) || []), l]);
      }
      list.innerHTML = found.length ? [...groups].map(([topic, items]) => `<section class="kd-topic"><h3>${esc(topic)} <span>${items.length}</span></h3><ul>${items.map((l) => {
        const url = safeLinkUrl(l.url);
        const title = l.title || l.label || '제목 없는 링크';
        let domain = '';
        try { domain = new URL(l.url).hostname; } catch { /* 열 수 없는 주소 표시 */ }
        return `<li><article><h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>` : `${esc(title)} (주소 열 수 없음)`}</h4>${l.description ? `<p class="kd-description">${esc(l.description)}</p>` : ''}${l.label && l.label !== title ? `<p class="kd-original">공유 글: ${esc(l.label)}</p>` : ''}<p class="kd-meta">${esc(l.site || domain)}${l.rooms.length ? ` , ${esc(l.rooms.join(', '))}` : ''}${l.dates?.length ? ` , 공유 ${esc(l.dates.join(', '))}` : ''}${l.bot ? ' , 봇 공유' : ''}</p></article></li>`;
      }).join('')}</ul></section>`).join('') : `<p class="kd-empty">${links.length ? '검색 조건에 맞는 링크가 없습니다.' : '이날 새로 저장한 링크가 없습니다. 처리 내역은 아래에서 확인하세요.'}</p>`;
    }
    room.onchange = filter;
    search.oninput = filter;
    filter();
  }
  const onHash = (): void => { if (location.hash.startsWith('#' + ROUTE + '/') && fromHash() !== date) void show(fromHash()); };
  window.addEventListener('hashchange', onHash);
  ctx.onDispose(() => { window.removeEventListener('hashchange', onHash); });
  await show(fromHash());
}

dashRegistry().register({ id: ROUTE, title: '카톡 정리', access: 'read', paths: [DIR], render });
