import { esc } from '../mydash/kit';

export interface AnimeEpisode { key: string; animeId: string; title: string; provider: 'laftel' | 'netflix'; publishedAt: string; url: string; scheduled: boolean; watchedAt?: string }

export function animeHomework(episodes: AnimeEpisode[]): string {
    const pending = episodes.filter(a => !a.watchedAt), completed = episodes.filter(a => a.watchedAt);
    const row = (a: AnimeEpisode): string => {
        const date = new Date(a.publishedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
        const provider = a.provider === 'netflix' ? '넷플릭스' : '라프텔';
        const id = a.animeId.split(':')[1] || '';
        const url = a.provider === 'netflix' ? `https://www.netflix.com/title/${encodeURIComponent(id)}` : `https://laftel.net/item/${encodeURIComponent(id)}`;
        return `<li class="pl-anime-episode"><label><input type="checkbox" data-anime-key="${esc(a.key)}" ${a.watchedAt ? 'checked' : ''} aria-label="${esc(a.title)} ${esc(date)} 회차 봤음"><span>${esc(a.title)}<small>${provider}, ${esc(date)} 회차${a.scheduled ? ', 공개 일정 기준' : ''}</small></span></label><a href="${url}" target="_blank" rel="noopener">작품 열기</a></li>`;
    };
    return `<section class="pl-anime-homework"><h3>애니 숙제 <span>${pending.length}회 남음</span></h3><p>봤으면 체크. 체크를 풀면 다시 미시청 목록으로.</p>${pending.length ? `<ul>${pending.map(row).join('')}</ul>` : '<p>밀린 회차 없음</p>'}${completed.length ? `<details class="pl-anime-completed"><summary>본 회차 ${completed.length}개</summary><ul>${completed.slice().reverse().map(row).join('')}</ul></details>` : ''}<p>라프텔은 확인된 최신 회차부터 기록. 넷플릭스는 공개 예정일이 지난 등록 회차만 표시.</p></section>`;
}
