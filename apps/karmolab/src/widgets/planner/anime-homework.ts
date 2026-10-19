import { esc } from '../mydash/kit';
import type { NotificationHandle, NotificationReport } from './notifications';

export interface AnimeEpisode { key: string; animeId: string; title: string; provider: 'laftel' | 'netflix'; publishedAt: string; url: string; scheduled: boolean; watchedAt?: string; episodeId?: number; episodeNumber?: string; episodeTitle?: string; archived?: boolean }

export function buildAnimeHomework(container: HTMLElement, notifications: NotificationHandle): { destroy(): void } {
    let current = notifications.report(), completed = false, archive = false, selectedWork = '', busy = false, destroyed = false, editing: string | null = null;
    const inputTime = (value: string): string => new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16);
    const shownTime = (value: string): string => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    container.innerHTML = `<div class="pl-anime"><div class="pl-cal-modes" aria-label="시청 상태"><button type="button" class="pl-cal-mode" data-anime-view="pending" aria-pressed="true">미시청</button><button type="button" class="pl-cal-mode" data-anime-view="completed" aria-pressed="false">시청 완료</button></div><div class="pl-anime-list"></div><p class="pl-anime-status" role="status">불러오는 중</p><button type="button" class="btn btn-ghost btn-xs pl-anime-refresh">새로고침</button></div>`;
    const root = container.querySelector<HTMLElement>('.pl-anime')!;
    const filters = root.querySelector<HTMLElement>('[aria-label="시청 상태"]')!;
    filters.insertAdjacentHTML('beforeend', '<button type="button" class="pl-cal-mode" data-anime-view="archive" aria-pressed="false">과거 회차</button>');
    const workLabel = document.createElement('label');
    workLabel.className = 'pl-field'; workLabel.hidden = true;
    workLabel.innerHTML = '<span class="pl-label">과거 회차의 작품</span><select class="pl-input" aria-label="과거 회차의 작품"></select>';
    filters.after(workLabel);
    const workSelect = workLabel.querySelector<HTMLSelectElement>('select')!;
    const list = root.querySelector<HTMLElement>('.pl-anime-list')!;
    const status = root.querySelector<HTMLElement>('.pl-anime-status')!;
    const render = (report: NotificationReport): void => {
        if (destroyed) return;
        current = report;
        const episodes = report.homework || [];
        root.querySelectorAll<HTMLButtonElement>('[data-anime-view]').forEach(button => {
            const view = button.dataset.animeView;
            const count = episodes.filter(a => view === 'completed' ? !!a.watchedAt : !a.watchedAt && !!a.archived === (view === 'archive')).length;
            button.textContent = `${view === 'completed' ? '시청 완료' : view === 'archive' ? '과거 회차' : '미시청'} ${count}`;
            button.setAttribute('aria-pressed', String(view === (archive ? 'archive' : completed ? 'completed' : 'pending')));
        });
        workLabel.hidden = !archive;
        const works = new Map(episodes.filter(a => a.archived && !a.watchedAt).map(a => [a.animeId, a.title]));
        workSelect.innerHTML = '<option value="">작품 선택</option>' + [...works].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join('');
        workSelect.value = selectedWork;
        const groups = new Map<string, AnimeEpisode[]>();
        const visible = episodes.filter(a => archive ? a.archived && !a.watchedAt && a.animeId === selectedWork : completed ? !!a.watchedAt : !a.watchedAt && !a.archived);
        if (completed) visible.sort((a, b) => Date.parse(b.watchedAt!) - Date.parse(a.watchedAt!));
        for (const episode of visible) {
            const group = groups.get(episode.animeId) || [];
            group.push(episode); groups.set(episode.animeId, group);
        }
        list.innerHTML = [...groups.values()].map(group => {
            const first = group[0], id = first.animeId.split(':')[1] || '';
            const url = first.provider === 'netflix' ? `https://www.netflix.com/title/${encodeURIComponent(id)}` : `https://laftel.net/item/${encodeURIComponent(id)}`;
            return `<section class="pl-anime-work"><h3><a href="${url}" target="_blank" rel="noopener">${esc(first.title)}</a></h3><p class="pl-anime-source">${first.provider === 'netflix' ? '넷플릭스, 공개 일정 기준' : '라프텔'}</p>${group.map(a => {
                const date = new Date(a.publishedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
                const label = a.episodeNumber ? `${a.episodeNumber}${/^\d+(?:\.\d+)?$/.test(a.episodeNumber) ? '화' : ''}${a.episodeTitle ? ' ' + a.episodeTitle : ''}` : `${date} 공개분`;
                return `<div class="pl-anime-episode"><div class="pl-anime-row"><span>${esc(label)}</span><button type="button" class="btn btn-ghost btn-xs" data-watch-edit="${esc(a.key)}" aria-expanded="${editing === a.key}">${editing === a.key ? '닫기' : a.watchedAt ? '수정' : '시청 기록'}</button></div>${a.episodeNumber ? `<p class="pl-anime-source">${esc(date)} 공개분</p>` : ''}${a.watchedAt ? `<p class="pl-anime-watched"><time datetime="${esc(a.watchedAt)}">${esc(shownTime(a.watchedAt))} 시청</time></p>` : ''}${editing === a.key ? `<form class="pl-anime-edit" data-watch-save="${esc(a.key)}"><label class="pl-field"><span class="pl-label">본 날짜와 시간 (한국 시각)</span><input type="datetime-local" name="watchedAt" class="pl-input" value="${inputTime(a.watchedAt || new Date().toISOString())}" max="${inputTime(new Date().toISOString())}" required></label><div class="pl-anime-edit-actions"><button type="submit" class="btn btn-accent btn-xs">저장</button><button type="button" class="btn btn-ghost btn-xs" data-watch-cancel>취소</button>${a.watchedAt ? `<button type="button" class="btn btn-ghost btn-xs" data-watch-clear="${esc(a.key)}">미시청으로</button>` : ''}</div></form>` : ''}</div>`;
            }).join('')}</section>`;
        }).join('') || `<p class="pl-diary-empty">${archive ? '작품을 선택하면 과거 회차를 확인하고 시청 날짜를 기록할 수 있어요.' : completed ? '시청 기록을 저장하면 본 날짜와 시간이 여기에 남아요.' : episodes.length ? '밀린 회차를 모두 봤어요.' : '새 회차를 확인하면 여기에 쌓여요.'}</p>`;
    };
    const setBusy = (value: boolean): void => {
        busy = value;
        root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(input => { input.disabled = value; });
        root.setAttribute('aria-busy', String(value));
    };
    const save = async (key: string, watched: boolean, watchedAt?: string): Promise<void> => {
        if (busy) return;
        setBusy(true); status.textContent = '저장 중';
        try {
            await notifications.setWatched(key, watched, watchedAt);
            if (destroyed) return;
            editing = null; completed = watched; archive = !watched && !!current?.homework?.find(a => a.key === key)?.archived;
            if (current) render(current);
            status.textContent = watched ? '시청 날짜와 시간을 저장했어요. 한국 시각 기준이에요.' : '미시청으로 되돌렸어요.';
        } catch { if (!destroyed) status.textContent = '저장하지 못했어요. 날짜와 시간을 확인하고 다시 저장해 주세요.'; }
        finally { if (!destroyed) { setBusy(false); (list.querySelector<HTMLElement>('[data-watch-edit]') || root.querySelector<HTMLButtonElement>('[data-anime-view]'))?.focus(); } }
    };
    const submit = (event: Event): void => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.dataset.watchSave) return;
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        const value = new FormData(form).get('watchedAt');
        if (typeof value !== 'string' || !Number.isFinite(Date.parse(value + ':00+09:00'))) return;
        void save(form.dataset.watchSave, true, new Date(value + ':00+09:00').toISOString());
    };
    const reload = async (): Promise<void> => {
        if (busy) return;
        setBusy(true); status.textContent = '불러오는 중';
        try { await notifications.reload(); if (!destroyed) status.textContent = ''; }
        catch { if (!destroyed) status.textContent = '목록을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.'; }
        finally { if (!destroyed) setBusy(false); }
    };
    const click = (event: Event): void => {
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!target || busy) return;
        if (target.dataset.animeView) { editing = null; archive = target.dataset.animeView === 'archive'; completed = target.dataset.animeView === 'completed'; if (current) render(current); }
        else if (target.dataset.watchEdit) { editing = editing === target.dataset.watchEdit ? null : target.dataset.watchEdit; if (current) render(current); root.querySelector<HTMLInputElement>('input[name="watchedAt"]')?.focus(); }
        else if (target.hasAttribute('data-watch-cancel')) { editing = null; if (current) render(current); }
        else if (target.dataset.watchClear) void save(target.dataset.watchClear, false);
        else if (target.classList.contains('pl-anime-refresh')) void reload();
    };
    const changeWork = (): void => { selectedWork = workSelect.value; editing = null; if (current) render(current); };
    workSelect.addEventListener('change', changeWork);
    root.addEventListener('submit', submit); root.addEventListener('click', click);
    const unsubscribe = notifications.subscribe(report => { current = report; if (!editing) render(report); if (!busy) status.textContent = ''; });
    if (!current) void reload();
    return { destroy() { destroyed = true; unsubscribe(); workSelect.removeEventListener('change', changeWork); root.removeEventListener('submit', submit); root.removeEventListener('click', click); } };
}
