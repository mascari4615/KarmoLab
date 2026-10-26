import { dashRegistry, esc, type DashPanelCtx } from './kit';
import { mountQuickCapture } from '../planner/quick-capture';
import { mountNotifications, type NotificationReport } from '../planner/notifications';
import { listEvents, listTasks, moveTask } from '../planner/local-store';

function renderDaily(ctx: DashPanelCtx): void {
  ctx.root.classList.add('mydd');
  ctx.root.innerHTML = '<div class="mydd-layout"><div class="mydd-capture"></div><div class="mydd-agenda" aria-live="polite"></div></div><div class="mydd-notifications"></div>';
  const capture = ctx.root.querySelector<HTMLElement>('.mydd-capture')!;
  mountQuickCapture({ ...ctx, root: capture }, { showAgenda: false });
  const notificationsRoot = ctx.root.querySelector<HTMLElement>('.mydd-notifications')!;
  const notifications = mountNotifications({ ...ctx, root: notificationsRoot }, { compact: true });
  let report: NotificationReport | null = null;
  let undone: { id: string; column: 'todo' | 'inProgress' } | null = null;
  let notice = '';
  const agenda = ctx.root.querySelector<HTMLElement>('.mydd-agenda')!;
  function paint(): void {
    const local = listTasks();
    const tasks = [...local.todo, ...local.inProgress];
    const remoteTasks = (report?.tasks || []).filter(task => !task.id.startsWith('local__') && task.status !== 'completed');
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const from = Date.parse(day + 'T00:00:00+09:00');
    const to = from + 8 * 86400000;
    const at = (value: string): number => Date.parse(value.length === 10 ? value + 'T00:00:00+09:00' : value);
    const events = [...listEvents('내 기록', new Date(from), new Date(to)), ...(report?.events || []).filter(event => !event.id.startsWith('local__'))]
      .filter(event => at(event.end) > from && at(event.start) < to)
      .sort((a, b) => at(a.start) - at(b.start));
    const when = (value: string, allDay: boolean): string => allDay ? value + ' 종일' : new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    agenda.innerHTML = `<section><div class="mydd-section-head"><h3>할 일 <span>${tasks.length + remoteTasks.length}</span></h3><button type="button" data-open="kanban">전체 보기</button></div>${tasks.length + remoteTasks.length ? `<ul>${tasks.slice(0, 8).map(task => `<li><button type="button" data-complete="${esc(task.id)}" aria-label="완료: ${esc(task.title)}">완료</button><span>${esc(task.title)}</span></li>`).join('')}${remoteTasks.slice(0, 5).map(task => `<li><span>${esc(task.title)}<small>구글 할 일${task.due ? ' / ' + esc(task.due.slice(0, 10)) : ''}</small></span></li>`).join('')}</ul>` : '<p>할 일이 생기면 왼쪽에서 바로 남겨보세요.</p>'}${notice ? `<p role="status">${esc(notice)}</p>` : ''}${undone ? '<button type="button" data-undo>완료 되돌리기</button>' : ''}</section>
      <section><div class="mydd-section-head"><h3>오늘과 다음 7일 <span>${events.length}</span></h3><button type="button" data-open="calendar">캘린더 보기</button></div>${events.length ? `<ol>${events.slice(0, 8).map(event => `<li><span>${esc(event.title)}<small>${esc(when(event.start, event.allDay))}</small></span></li>`).join('')}</ol>` : '<p>정해진 약속이 없어요.</p>'}<p class="mydd-source">내 기록${report?.connected ? '과 연결한 구글 계정' : ''}의 일정과 할 일</p></section>
      <section class="mydd-anime"><div class="mydd-section-head"><h3>애니 숙제 <span>${(report?.homework || []).filter(item => !item.watchedAt && !item.archived).length}</span></h3><button type="button" data-open="anime">목록 보기</button></div><p>시청 기록과 새 회차를 플래너에서 확인해요.</p></section>`;
  }
  const safelyPaint = (): void => {
    if (!ctx.isCurrent()) return;
    try { paint(); }
    catch { agenda.textContent = '저장한 일정과 할 일을 읽지 못했어요. 기존 기록은 보존했어요.'; }
  };
  const unsubscribe = notifications.subscribe(value => { report = value; safelyPaint(); });
  agenda.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.open) {
      try {
        if (button.dataset.open === 'calendar') localStorage.removeItem('karmolab.planner.side');
        else localStorage.setItem('karmolab.planner.side', button.dataset.open);
      } catch { /* 저장 불가 시 기본 플래너로 이동 */ }
      ctx.openItem('planner');
      return;
    }
    try {
      if (button.dataset.complete) {
        const id = button.dataset.complete;
        const column = listTasks().inProgress.some(task => task.id === id) ? 'inProgress' : 'todo';
        moveTask(id, 'done');
        if (!listTasks().done.some(task => task.id === id)) throw new Error('저장 실패');
        undone = { id, column };
        notice = '할 일을 완료했어요.';
      } else if (button.hasAttribute('data-undo') && undone) {
        const { id, column } = undone;
        if (!listTasks().done.some(task => task.id === id)) throw new Error('다른 화면에서 변경됨');
        moveTask(id, column);
        if (!listTasks()[column].some(task => task.id === id)) throw new Error('저장 실패');
        undone = null;
        notice = '완료 전 상태로 되돌렸어요.';
      }
    } catch { notice = '상태를 저장하지 못했어요. 다시 시도해 주세요.'; }
    safelyPaint();
  });
  window.addEventListener('planner-local-change', safelyPaint);
  window.addEventListener('planner-remote-change', safelyPaint);
  window.addEventListener('storage', safelyPaint);
  window.addEventListener('focus', safelyPaint);
  ctx.onDispose(() => {
    unsubscribe();
    window.removeEventListener('planner-local-change', safelyPaint);
    window.removeEventListener('planner-remote-change', safelyPaint);
    window.removeEventListener('storage', safelyPaint);
    window.removeEventListener('focus', safelyPaint);
  });
  safelyPaint();
}
dashRegistry().register({ id: 'daily', title: '오늘', access: 'read', paths: [], render: renderDaily });
