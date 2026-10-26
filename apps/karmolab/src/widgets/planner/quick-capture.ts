import type { DashPanelCtx } from '../mydash/kit';
import { esc } from '../mydash/kit';
import { listDiary, readDiary, writeDiary } from './diary-store';
import { createEvent, createTask, listEvents, listTasks, moveTask } from './local-store';
import { recordStreakActivity } from '../../lib/gamification';

type Kind = 'diary' | 'task' | 'event';
const DRAFT_KEY = 'planner.quick-capture.draft';
const keys = { diary: 'karmolab_planner_diary', task: 'karmolab_planner_tasks', event: 'karmolab_planner_events' };
const labels: Record<Kind, string> = { diary: '일기', task: '할 일', event: '일정' };
const today = (): string => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function validDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function checkStorage(kind: Kind): void {
    const raw = localStorage.getItem(keys[kind]);
    if (raw === null) return;
    const parsed: unknown = JSON.parse(raw);
    const valid = Array.isArray(parsed) && parsed.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const row = item as Record<string, unknown>;
        if (kind === 'diary') return typeof row.date === 'string' && validDate(row.date) && typeof row.text === 'string';
        if (typeof row.id !== 'string' || typeof row.title !== 'string') return false;
        return kind === 'task' ? typeof row.column === 'string' : typeof row.start === 'string' && typeof row.end === 'string' && typeof row.allDay === 'boolean';
    });
    if (!valid) throw new Error('기존 저장 내용을 읽을 수 없어요. 플래너에서 확인해 주세요.');
}

export function mountQuickCapture(ctx: DashPanelCtx, { showAgenda = true } = {}): void {
    const box = document.createElement('section');
    box.className = 'mydq';
    box.setAttribute('aria-label', '빠른 기록');
    box.innerHTML = `<form class="mydq-form">
        <div class="mydq-head"><h2>지금 한 줄</h2><button type="button" class="mydq-open">플래너 열기</button></div>
        <div class="mydq-kinds" role="group" aria-label="저장할 곳">${(['diary', 'task', 'event'] as const).map(kind => `<button type="button" data-kind="${kind}" aria-pressed="${kind === 'diary'}">${labels[kind]}</button>`).join('')}</div>
        <label class="mydq-label" for="mydq-text">오늘 남기고 싶은 것</label>
        <textarea id="mydq-text" name="quick-text" rows="2" required maxlength="10000" placeholder="한 일이나 생각을 짧게 적어도 괜찮아요"></textarea>
        <div class="mydq-controls"><label class="mydq-date-label">날짜 <input name="quick-date" type="date" required aria-label="기록 날짜"></label><label class="mydq-time-label" hidden>시각 <input name="quick-time" type="time" aria-label="일정 시작 시각"></label><button type="submit" class="mydq-save">일기에 추가</button></div>
        <p class="mydq-hint">이 브라우저에 저장, 기존 플래너와 같은 기록</p>
        <p class="mydq-status" role="status" aria-live="polite"></p>
        <button type="button" class="mydq-undo" hidden>할 일 완료 되돌리기</button>
        </form><div class="mydq-recent"></div>`;
    ctx.root.insertBefore(box, ctx.root.querySelector('.mydh-grid'));
    const text = box.querySelector<HTMLTextAreaElement>('textarea')!;
    const date = box.querySelector<HTMLInputElement>('[name="quick-date"]')!;
    const time = box.querySelector<HTMLInputElement>('[name="quick-time"]')!;
    const status = box.querySelector<HTMLElement>('.mydq-status')!;
    const save = box.querySelector<HTMLButtonElement>('.mydq-save')!;
    const undo = box.querySelector<HTMLButtonElement>('.mydq-undo')!;
    box.classList.toggle('mydq--diary-only', !showAgenda);
    let kind: Kind = 'diary';
    let lastDone: { id: string; column: 'todo' | 'inProgress' } | null = null;
    date.value = today();
    function message(value: string, error = false): void {
        status.textContent = value;
        status.setAttribute('role', error ? 'alert' : 'status');
    }
    function remember(): void {
        try {
            if (text.value.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, text: text.value, date: date.value, time: time.value }));
            else localStorage.removeItem(DRAFT_KEY);
        }
        catch { message('작성 중인 내용은 임시 저장되지 않았어요. 이 창을 닫지 말고 저장을 다시 시도해 주세요.', true); }
    }
    function select(next: Kind): void {
        kind = next;
        box.querySelectorAll<HTMLElement>('[data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === kind)));
        box.querySelector<HTMLElement>('.mydq-date-label')!.hidden = kind === 'task';
        date.required = kind !== 'task';
        box.querySelector<HTMLElement>('.mydq-time-label')!.hidden = kind !== 'event';
        text.labels![0].textContent = kind === 'diary' ? '오늘 남기고 싶은 것' : kind === 'task' ? '해야 할 일' : '어떤 약속인가요?';
        text.placeholder = kind === 'diary' ? '한 일이나 생각을 짧게 적어도 괜찮아요' : kind === 'task' ? '예: 병원 예약하기' : '예: 친구와 저녁';
        save.textContent = kind === 'diary' ? '일기에 추가' : `${labels[kind]} 추가`;
    }
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
            const draft = JSON.parse(raw) as Record<string, unknown>;
            if (draft && typeof draft.text === 'string' && draft.text.trim()) {
                text.value = draft.text;
                if (typeof draft.date === 'string' && validDate(draft.date)) date.value = draft.date;
                if (typeof draft.time === 'string' && /^\d{2}:\d{2}$/.test(draft.time)) time.value = draft.time;
                if (draft.kind === 'diary' || draft.kind === 'task' || draft.kind === 'event') select(draft.kind);
            }
        }
    } catch { message('임시 기록을 읽지 못했어요. 저장소 설정을 확인해 주세요.', true); }
    function recent(): void {
        try {
            for (const target of ['diary', 'task', 'event'] as const) checkStorage(target);
            const tasks = [...listTasks().todo, ...listTasks().inProgress];
            const diaries = listDiary().slice(0, 2);
            const from = new Date(today() + 'T00:00:00+09:00');
            const to = new Date(from.getTime() + 7 * 86400000);
            const events = listEvents('이 브라우저', from, to).filter(event => Date.parse(event.end.length === 10 ? event.end + 'T00:00:00+09:00' : event.end) > from.getTime() && Date.parse(event.start.length === 10 ? event.start + 'T00:00:00+09:00' : event.start) < to.getTime()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
            box.querySelector<HTMLElement>('.mydq-recent')!.innerHTML = `<div class="mydq-summary"><section><h3>남은 할 일 <span>${tasks.length}</span></h3>${tasks.length ? `<ul>${tasks.slice(0, 3).map(task => `<li><button type="button" data-done="${esc(task.id)}" aria-label="완료: ${esc(task.title)}">완료</button><span>${esc(task.title)}</span></li>`).join('')}</ul>` : '<p>해야 할 일을 한 줄로 남겨보세요.</p>'}</section><section><h3>다가오는 7일</h3>${events.length ? `<ul>${events.map(event => `<li><span>${esc(event.title)}<small>${esc(event.allDay ? event.start + ' 종일' : new Date(event.start).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></span></li>`).join('')}</ul>` : '<p>이 브라우저에 저장한 일정이 없어요.</p>'}</section></div><section class="mydq-diary"><h3>최근 일기</h3>${diaries.length ? diaries.map(entry => `<details><summary>${esc(entry.date)} <span>${esc(entry.text.split('\n').find(line => line.trim())?.slice(0, 70) || '')}</span></summary><p>${esc(entry.text)}</p></details>`).join('') : '<p>첫 기록은 한 문장이면 충분해요.</p>'}</section>`;
        } catch { box.querySelector<HTMLElement>('.mydq-recent')!.textContent = '기록을 읽지 못했어요. 기존 내용은 그대로 두었어요.'; }
    }
    box.querySelector('form')!.addEventListener('submit', event => {
        event.preventDefault();
        const value = text.value.trim();
        if (!value) { text.focus(); return; }
        try {
            checkStorage(kind);
            if (kind !== 'task' && !validDate(date.value)) throw new Error('날짜를 확인해 주세요.');
            if (kind === 'diary') {
                const previous = readDiary(date.value)?.text || '';
                const next = previous ? previous + '\n\n' + value : value;
                writeDiary(date.value, next);
                if (readDiary(date.value)?.text !== next) throw new Error('저장 공간이나 브라우저 설정을 확인해 주세요.');
                recordStreakActivity('diary', date.value);
            } else if (kind === 'task') {
                const id = createTask(value);
                if (!listTasks().todo.some(task => task.id === id)) throw new Error('저장 공간이나 브라우저 설정을 확인해 주세요.');
            } else {
                const allDay = !time.value;
                const start = allDay ? date.value : date.value + 'T' + time.value + ':00+09:00';
                const end = new Date(Date.parse(allDay ? date.value + 'T00:00:00Z' : start) + (allDay ? 86400000 : 3600000)).toISOString();
                const id = createEvent({ title: value, start, end: allDay ? end.slice(0, 10) : end, allDay });
                if (!listEvents('이 브라우저').some(item => item.id === id)) throw new Error('저장 공간이나 브라우저 설정을 확인해 주세요.');
            }
            text.value = '';
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* 본문 저장 성공, 임시 기록만 잔존 */ }
            message(kind === 'diary' ? `${date.value} 일기에 추가했어요.` : kind === 'task' ? '할 일에 추가했어요.' : `${date.value} 일정에 추가했어요.${time.value ? ' 1시간 일정으로 저장.' : ' 종일 일정으로 저장.'}`);
            recent();
            text.focus();
        } catch (error) {
            message(error instanceof SyntaxError ? '기존 저장 내용을 읽을 수 없어요. 내용을 보존하고 플래너에서 확인해 주세요.' : `저장하지 못했어요. ${error instanceof Error ? error.message : '다시 시도해 주세요.'}`, true);
        }
    });
    text.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            box.querySelector('form')!.requestSubmit();
        }
    });
    box.addEventListener('input', remember);
    box.addEventListener('click', event => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (button?.dataset.kind) { select(button.dataset.kind as Kind); remember(); }
        if (button?.dataset.done) {
            try {
                checkStorage('task');
                const column = listTasks().inProgress.some(task => task.id === button.dataset.done) ? 'inProgress' : 'todo';
                moveTask(button.dataset.done, 'done');
                if (!listTasks().done.some(task => task.id === button.dataset.done)) throw new Error('완료 상태를 저장하지 못했어요.');
                lastDone = { id: button.dataset.done, column };
                undo.hidden = false;
                message('할 일을 완료했어요.');
                recent();
            } catch { message('완료 상태를 저장하지 못했어요. 다시 시도해 주세요.', true); }
        }
    });
    undo.addEventListener('click', () => {
        if (!lastDone) return;
        try {
            checkStorage('task');
            const { id, column } = lastDone;
            if (!listTasks().done.some(task => task.id === id)) throw new Error('다른 화면에서 변경됨');
            moveTask(id, column);
            if (!listTasks()[column].some(task => task.id === id)) throw new Error('저장 실패');
            undo.hidden = true;
            lastDone = null;
            message('완료 전 상태로 되돌렸어요.');
            recent();
        } catch { message('되돌리지 못했어요. 다시 시도해 주세요.', true); }
    });
    box.querySelector('.mydq-open')!.addEventListener('click', () => {
        try {
            if (kind === 'event') localStorage.removeItem('karmolab.planner.side');
            else localStorage.setItem('karmolab.planner.side', kind === 'diary' ? 'diary' : 'kanban');
        } catch { /* 저장 불가 시 기본 플래너로 이동 */ }
        ctx.openItem('planner');
    });
    const changed = (): void => { if (ctx.isCurrent()) recent(); };
    window.addEventListener('storage', changed);
    window.addEventListener('planner-local-change', changed);
    window.addEventListener('focus', changed);
    ctx.onDispose(() => {
        window.removeEventListener('storage', changed);
        window.removeEventListener('planner-local-change', changed);
        window.removeEventListener('focus', changed);
    });
    recent();
}
