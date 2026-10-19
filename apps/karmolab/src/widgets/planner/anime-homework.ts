import { esc } from '../mydash/kit';
import type { NotificationHandle, NotificationReport } from './notifications';

export interface AnimeEpisode { key: string; animeId: string; title: string; provider: 'laftel' | 'netflix'; publishedAt: string; url: string; scheduled: boolean; watchedAt?: string }

export function buildAnimeHomework(container: HTMLElement, notifications: NotificationHandle): { destroy(): void } {
    let current = notifications.report(), completed = false, busy = false, destroyed = false;
    container.innerHTML = `<div class="pl-anime"><div class="pl-cal-modes" aria-label="시청 상태"><button type="button" class="pl-cal-mode" data-anime-view="pending" aria-pressed="true">미시청</button><button type="button" class="pl-cal-mode" data-anime-view="completed" aria-pressed="false">시청 완료</button></div><div class="pl-anime-list"></div><p class="pl-anime-status" role="status">불러오는 중</p><button type="button" class="btn btn-ghost btn-xs pl-anime-refresh">새로고침</button></div>`;
    const root = container.querySelector<HTMLElement>('.pl-anime')!;
    const list = root.querySelector<HTMLElement>('.pl-anime-list')!;
    const status = root.querySelector<HTMLElement>('.pl-anime-status')!;
    const render = (report: NotificationReport): void => {
        if (destroyed) return;
        current = report;
        const episodes = report.homework || [];
        root.querySelectorAll<HTMLButtonElement>('[data-anime-view]').forEach(button => {
            const done = button.dataset.animeView === 'completed';
            button.textContent = `${done ? '시청 완료' : '미시청'} ${episodes.filter(a => !!a.watchedAt === done).length}`;
            button.setAttribute('aria-pressed', String(completed === done));
        });
        const groups = new Map<string, AnimeEpisode[]>();
        for (const episode of episodes.filter(a => !!a.watchedAt === completed)) {
            const group = groups.get(episode.animeId) || [];
            group.push(episode); groups.set(episode.animeId, group);
        }
        list.innerHTML = [...groups.values()].map(group => {
            const first = group[0], id = first.animeId.split(':')[1] || '';
            const url = first.provider === 'netflix' ? `https://www.netflix.com/title/${encodeURIComponent(id)}` : `https://laftel.net/item/${encodeURIComponent(id)}`;
            return `<section class="pl-anime-work"><h3><a href="${url}" target="_blank" rel="noopener">${esc(first.title)}</a></h3><p class="pl-anime-source">${first.provider === 'netflix' ? '넷플릭스, 공개 일정 기준' : '라프텔'}</p>${group.map(a => {
                const date = new Date(a.publishedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
                return `<label class="pl-check pl-anime-row"><input type="checkbox" data-anime-key="${esc(a.key)}" ${a.watchedAt ? 'checked' : ''} aria-label="${esc(a.title)} ${esc(date)} 회차 봤음"><span>${esc(date)} 공개분</span></label>`;
            }).join('')}</section>`;
        }).join('') || `<p class="pl-diary-empty">${completed ? '체크한 회차가 여기에 모여요.' : episodes.length ? '밀린 회차를 모두 봤어요.' : '새 회차를 확인하면 여기에 쌓여요.'}</p>`;
    };
    const setBusy = (value: boolean): void => {
        busy = value;
        root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(input => { input.disabled = value; });
        root.setAttribute('aria-busy', String(value));
    };
    const change = async (event: Event): Promise<void> => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.dataset.animeKey || busy) return;
        const watched = input.checked;
        input.checked = !watched;
        setBusy(true); status.textContent = '저장 중';
        try { await notifications.setWatched(input.dataset.animeKey, watched); if (!destroyed) status.textContent = watched ? '봤음으로 저장했어요.' : '미시청으로 되돌렸어요.'; }
        catch { if (!destroyed) status.textContent = '저장하지 못했어요. 다시 체크해 주세요.'; }
        finally { if (!destroyed) { setBusy(false); (list.querySelector<HTMLInputElement>('input') || root.querySelector<HTMLButtonElement>('[data-anime-view]'))?.focus(); } }
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
        if (target.dataset.animeView) { completed = target.dataset.animeView === 'completed'; if (current) render(current); }
        else if (target.classList.contains('pl-anime-refresh')) void reload();
    };
    root.addEventListener('change', change); root.addEventListener('click', click);
    const unsubscribe = notifications.subscribe(report => { render(report); if (!busy) status.textContent = ''; });
    if (!current) void reload();
    return { destroy() { destroyed = true; unsubscribe(); root.removeEventListener('change', change); root.removeEventListener('click', click); } };
}
