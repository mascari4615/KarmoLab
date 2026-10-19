import type { DashPanelCtx } from '../mydash/kit';
import { esc } from '../mydash/kit';
import { ensureToken, notificationRefreshToken } from './gauth';
import { listEvents, listTasks } from './local-store';
import { withLinkedEvents } from './event-group';
import { updateAnimeCalendar, type AnimeItem } from './anime-calendar';
import { animeHomework, type AnimeEpisode } from './anime-homework';

const API = 'https://bot.mascari4615.com/dash/notifications';
interface AgendaEvent { id: string; title: string; start: string; end: string; allDay: boolean }
interface Report {
    collectedAt: string; connected: boolean; errors: string[]; lastSentAt?: string; localUpdatedAt?: string;
    settings: { enabled: boolean; hour: number; minute: number; reminderMinutes: number; animeIds: number[] };
    events: AgendaEvent[]; tasks: Array<{ id: string; title: string; due?: string; status?: string }>;
    anime: AnimeItem[];
    homework?: AnimeEpisode[];
}
const when = (value: string): string => new Date(value.length === 10 ? value + 'T00:00:00+09:00' : value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function mountNotifications(ctx: DashPanelCtx, { visible = true } = {}): void {
    const box = document.createElement('details');
    box.className = 'pl-notifications';
    try { box.open = localStorage.getItem('planner.notifications.open') === '1'; } catch { /* 저장 불가 */ }
    box.addEventListener('toggle', () => { try { localStorage.setItem('planner.notifications.open', box.open ? '1' : '0'); } catch { /* 저장 불가 */ } });
    box.innerHTML = `<summary>오늘 안내와 디코 알림 <span class="pl-notify-count"></span></summary>
        <div class="pl-notify-body"><p class="pl-notify-status" role="status">알림 상태 확인 중</p>
        <div class="pl-notify-actions"><button type="button" class="btn btn-ghost pl-notify-connect">상시 구글 알림 연결</button><button type="button" class="btn btn-ghost pl-notify-refresh">지금 갱신</button><button type="button" class="btn btn-ghost pl-notify-test">디코로 안내 보내기</button><button type="button" class="btn btn-ghost pl-notify-disconnect" hidden>구글 알림 연결 해제</button></div>
        <p>기존 알림 채널로 아침 요약, 일정 전 안내, 찜과 시청 작품의 새 에피소드 알림. 로컬 일정과 할 일은 이 브라우저에서 홈이나 플래너를 열 때 동기화.</p>
        <div class="pl-notify-report"></div></div>`;
    const style = document.createElement('style');
    style.textContent = `.pl-notifications{flex-shrink:0;border-top:1px solid var(--border);font-size:var(--font-size-sm);color:var(--text-primary)}.pl-notifications summary{padding:12px 16px;cursor:pointer;min-height:44px}.pl-notify-count{font-size:var(--font-size-xs);color:var(--text-secondary)}.pl-notify-body{padding:0 16px 16px;max-height:50vh;overflow:auto}.pl-notify-body p{color:var(--text-secondary);line-height:1.6}.pl-notify-actions{display:flex;flex-wrap:wrap;gap:8px}.pl-notify-actions button{min-height:44px}.pl-notify-actions [hidden]{display:none}.pl-notify-report{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:20px}.pl-notify-report h3{font-size:var(--font-size-sm);margin:12px 0}.pl-notify-report ul{padding-left:20px;margin:0}.pl-notify-report li{margin:8px 0;overflow-wrap:anywhere}.pl-notify-report a{color:var(--accent)}.pl-notify-warning{color:var(--text-primary)!important}`;
    box.appendChild(style);
    const homeStyle = document.createElement('style');
    homeStyle.textContent = '.mydh>.pl-notifications{background:var(--dash-paper,var(--bg-secondary));margin-top:var(--space-md);border:1px solid var(--border)}';
    box.appendChild(homeStyle);
    const homeworkStyle = document.createElement('style');
    homeworkStyle.textContent = '.pl-anime-homework{grid-column:1/-1}.pl-anime-homework h3 span{font-weight:400}.pl-anime-homework ul{list-style:none;padding:0}.pl-anime-episode{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);padding:8px 0}.pl-anime-episode label{display:flex;align-items:center;gap:10px;min-height:44px;flex:1;min-width:0;cursor:pointer}.pl-anime-episode input{width:22px;height:22px;flex-shrink:0;accent-color:var(--accent)}.pl-anime-episode small{display:block;color:var(--text-secondary);line-height:1.6}.pl-anime-episode>a{flex-shrink:0;display:flex;align-items:center;min-height:44px}.pl-anime-completed summary{padding:8px 0}.pl-anime-completed .pl-anime-episode label span{text-decoration:line-through}.pl-anime-episode input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}';
    box.appendChild(homeworkStyle);
    if (visible) ctx.root.appendChild(box);
    let disposed = false, busy = false, connected = false, pendingSync = false;
    const status = box.querySelector<HTMLElement>('.pl-notify-status')!;
    const buttons = (): HTMLButtonElement[] => Array.from(box.querySelectorAll('button'));
    const inputs = (): HTMLInputElement[] => Array.from(box.querySelectorAll('input'));
    async function call(method = 'GET', body?: unknown, suffix = ''): Promise<Report> {
        const token = await ctx.ghToken();
        if (!token) throw new Error('Dash 로그인 필요');
        const res = await fetch(API + suffix, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(res.status === 401 ? 'Dash 로그인 갱신 필요' : res.status === 403 ? '본인 계정만 연결 가능' : res.status === 404 ? '알림 서버 배포 대기' : '알림 서버 연결 또는 전송 실패');
        return res.json() as Promise<Report>;
    }
    function paint(report: Report): void {
        if (disposed) return;
        connected = report.connected;
        updateAnimeCalendar(report.anime);
        const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), midnight = Date.parse(date + 'T00:00:00+09:00');
        const tasks = report.tasks.filter(t => t.status !== 'completed' && (!t.due || t.due.slice(0, 10) <= date));
        const today = report.events.filter(e => Date.parse(e.start.length === 10 ? e.start + 'T00:00:00+09:00' : e.start) < midnight + 86400000 && Date.parse(e.end.length === 10 ? e.end + 'T00:00:00+09:00' : e.end) > midnight);
        const next = report.events.filter(e => { const at = Date.parse(e.start.length === 10 ? e.start + 'T00:00:00+09:00' : e.start); return at >= midnight + 86400000 && at < midnight + 8 * 86400000; });
        const nextTasks = report.tasks.filter(t => t.status !== 'completed' && t.due && t.due.slice(0, 10) > date && Date.parse(t.due.slice(0, 10) + 'T00:00:00+09:00') < midnight + 8 * 86400000);
        status.textContent = `${connected ? '구글 상시 알림 연결됨' : '구글 상시 알림 미연결'} · ${report.settings.enabled ? '알림 켜짐' : '알림 꺼짐'} · 매일 ${String(report.settings.hour).padStart(2, '0')}:${String(report.settings.minute).padStart(2, '0')}, ${report.settings.reminderMinutes}분 전 · ${report.collectedAt ? when(report.collectedAt) + ' 갱신' : '수집 전'}`;
        box.querySelector<HTMLElement>('.pl-notify-count')!.textContent = `할 일 ${tasks.length} · 오늘 일정 ${today.length} · 안 본 애니 ${(report.homework || []).filter(a => !a.watchedAt).length}회`;
        box.querySelector<HTMLButtonElement>('.pl-notify-connect')!.hidden = connected;
        box.querySelector<HTMLButtonElement>('.pl-notify-disconnect')!.hidden = !connected;
        const list = (rows: string[]): string => `<ul>${rows.length ? rows.slice(0, 50).map(row => '<li>' + row + '</li>').join('') : '<li>없음</li>'}</ul>`;
        const event = (e: AgendaEvent): string => `${esc(e.allDay ? e.start + ' 종일' : when(e.start))} ${esc(e.title)}`;
        const animeRow = (a: AnimeItem): string => {
            if (a.provider === 'netflix') {
                const next = a.releases?.find(at => Date.parse(at) >= Date.now());
                const id = String(a.id).replace(/^netflix:/, '');
                return `<a href="https://www.netflix.com/title/${encodeURIComponent(id)}" target="_blank" rel="noopener">[넷플릭스] ${esc(a.title)}</a> · ${next ? esc(when(next)) + ' 공개 예정' : '등록된 공개 일정 종료'}<br>공식 일정 기준 · 실제 업로드 확인 전`;
            }
            return `<a href="https://laftel.net/item/${a.id}" target="_blank" rel="noopener">${esc(a.title)}</a> · 최근 ${esc(when(a.publishedAt))}<br>${esc(a.weekdays.join(', '))} 업로드`;
        };
        box.querySelector<HTMLElement>('.pl-notify-report')!.innerHTML = `${report.errors.length ? '<p class="pl-notify-warning">확인 필요: ' + report.errors.map(esc).join(', ') + '</p>' : ''}
            ${animeHomework(report.homework || [])}
            <section><h3>오늘 할 일과 마감</h3>${list(tasks.map(t => esc(t.title || '제목 없는 할 일') + (t.due ? ' · 마감 ' + esc(t.due.slice(0, 10)) : '')))}</section>
            <section><h3>오늘 일정</h3>${list(today.map(event))}<h3>다음 7일</h3>${list([...next.map(event), ...nextTasks.map(t => esc(t.due!.slice(0, 10)) + ' 마감 ' + esc(t.title))])}<a href="#planner">캘린더 보기</a></section>
            <section><h3>작품 업로드와 공개 일정</h3>${list(report.anime.map(animeRow))}<p>라프텔 ${report.settings.animeIds.length}작품 · 넷플릭스 ${report.anime.filter(a => a.provider === 'netflix').length}작품<br>라프텔은 새 에피소드 확인, 넷플릭스는 등록된 공식 공개 일정 안내</p></section>`;
    }
    async function sync(connect = false, preview = false): Promise<void> {
        let deviceId = localStorage.getItem('planner.notifications.device');
        if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('planner.notifications.device', deviceId); }
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const to = new Date(from); to.setDate(to.getDate() + 60);
        let refreshToken: string | undefined;
        if (connect) {
            await ensureToken();
            refreshToken = notificationRefreshToken() || undefined;
            if (!refreshToken) throw new Error('플래너 구글 연결 먼저 필요');
        }
        const localEvents = withLinkedEvents(listEvents('이 브라우저', from, to)).filter(e => Date.parse(e.end.length === 10 ? e.end + 'T00:00:00' : e.end) > +from && Date.parse(e.start.length === 10 ? e.start + 'T00:00:00' : e.start) < +to).map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay }));
        const tasks = listTasks();
        paint(await call('POST', { deviceId, ...(refreshToken ? { refreshToken } : {}), localEvents, localTasks: [...tasks.todo, ...tasks.inProgress], localThrough: to.toISOString(), preview }));
        if (preview && !disposed) status.textContent += ', 디코 안내 전송됨';
    }
    async function run(action: () => Promise<void>): Promise<void> {
        if (busy || disposed) return;
        busy = true; buttons().forEach(b => { b.disabled = true; }); inputs().forEach(b => { b.disabled = true; }); status.textContent = '저장과 갱신 중';
        try { await action(); }
        catch (e) { if (!disposed) { const message = (e as Error)?.message || '알림 갱신 실패'; status.textContent = /failed to fetch|NetworkError|Load failed/i.test(message) ? '알림 서버에 연결할 수 없음, 잠시 뒤 지금 갱신' : message; } }
        finally { busy = false; if (!disposed) { buttons().forEach(b => { b.disabled = false; }); inputs().forEach(b => { b.disabled = false; }); } if (pendingSync && !disposed) { pendingSync = false; void run(() => sync()); } }
    }
    box.addEventListener('change', event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.dataset.animeKey) return;
        const watched = input.checked;
        input.checked = !watched;
        if (busy) return;
        void run(async () => {
            paint(await call('POST', { key: input.dataset.animeKey, watched }, '/anime'));
            const next = watched ? box.querySelector<HTMLElement>('.pl-anime-homework > ul input, .pl-anime-completed summary') : inputs().find(item => item.dataset.animeKey === input.dataset.animeKey);
            next?.focus();
        });
    });
    box.querySelector('.pl-notify-connect')!.addEventListener('click', () => { void run(() => sync(true, true)); });
    box.querySelector('.pl-notify-refresh')!.addEventListener('click', () => { void run(() => sync()); });
    box.querySelector('.pl-notify-test')!.addEventListener('click', () => { void run(() => sync(false, true)); });
    box.querySelector('.pl-notify-disconnect')!.addEventListener('click', () => { void run(async () => { await call('DELETE'); paint(await call()); }); });
    const changed = (): void => { if (connected) { if (busy) pendingSync = true; else void run(() => sync()); } };
    window.addEventListener('planner-local-change', changed);
    let timer: ReturnType<typeof setInterval> | null = null;
    const visibility = (): void => {
        if (timer) clearInterval(timer);
        timer = null;
        if (!document.hidden && !disposed) timer = setInterval(() => { void run(async () => { if (connected) await sync(); else paint(await call()); }); }, 5 * 60_000);
    };
    const focused = (): void => { if (!disposed && !busy) void run(async () => { paint(await call()); }); };
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', visibility);
    visibility();
    ctx.onDispose(() => { disposed = true; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', focused); window.removeEventListener('planner-local-change', changed); updateAnimeCalendar([]); });
    void run(async () => { paint(await call()); if (connected) await sync(); });
}
