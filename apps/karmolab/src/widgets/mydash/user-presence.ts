import { dashRegistry, esc } from './kit';
import type { DashPanelCtx } from './kit';
import presenceCss from './user-presence.css';

const LABELS: Record<string, string> = { home: '집', commute: '출근 중', work: '회사', return: '퇴근 중', away: '외출', sleep: '수면' };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
interface Rule { id: string; days: number[]; start: string; end: string; state: string }
interface Report {
  config: { revision: number; enabled: boolean; defaultState: string | null; rules: Rule[]; manual: { until: number | null } | null };
  current: { state: string | null; source: string; since: number | null };
  next: { at: number; state: string | null } | null; evaluatedAt: number;
}
const when = (at: number): string => new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const options = (): string => Object.entries(LABELS).map(([id, label]) => '<option value="' + id + '">' + label + '</option>').join('');
const dayText = (days: number[]): string => {
  const key = [...days].sort().join('');
  if (key === '0123456') return '매일';
  if (key === '12345') return '월~금';
  if (key === '06') return '토, 일';
  return [1, 2, 3, 4, 5, 6, 0].filter(day => days.includes(day)).map(day => DAYS[day]).join(', ') || '요일 선택';
};
const chevron = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>';

export function renderUserPresence(ctx: DashPanelCtx): void {
  const root = ctx.root;
  root.innerHTML = `<div class="up-panel">
    <section class="up-current" aria-labelledby="up-heading">
      <div class="up-current-row"><div><h2 id="up-heading">지금은 <span class="up-state" aria-live="polite">확인 중</span></h2><p class="up-source"></p></div><button type="button" class="up-button up-change" aria-expanded="false" aria-controls="up-manual">상태 바꾸기</button></div>
      <div class="up-current-foot"><p class="up-next"></p><button type="button" class="up-text-button up-resume" hidden>시간표로 돌아가기</button><button type="button" class="up-text-button up-refresh">새로고침</button></div>
      <form class="up-manual" id="up-manual" hidden>
        <fieldset><legend>지금 상태 선택</legend><div class="up-state-options">${Object.entries(LABELS).map(([id, label]) => `<label><input type="radio" name="state" value="${id}" required><span>${label}</span></label>`).join('')}</div></fieldset>
        <div class="up-manual-actions"><label>유지 기간<select name="duration"><option value="60">1시간</option><option value="180">3시간</option><option value="today">오늘 자정까지</option><option value="forever">직접 해제할 때까지</option></select></label><button class="up-button up-primary" type="submit">지금 적용</button><button class="up-text-button up-manual-close" type="button">닫기</button></div>
        <p class="up-help">선택한 기간에는 시간표보다 우선해요.</p>
      </form>
    </section>
    <p class="up-message" role="status" hidden></p>
    <form class="up-schedule">
      <div class="up-section-heading"><h3>나의 시간표</h3><label class="up-enabled"><input type="checkbox" name="enabled" role="switch"><span>자동 적용</span></label></div>
      <div class="up-default-line"><label>평소에는 <select name="defaultState" aria-label="평소 상태"><option value="">미설정</option>${options()}</select></label><span class="up-timezone">한국 시간</span></div>
      <p class="up-help up-schedule-help">아래 시간에만 다른 상태로 바뀌어요.</p>
      <div class="up-rules"></div>
      <p class="up-empty" hidden>정해진 일과가 있다면 시간을 추가해 보세요.</p>
      <button type="button" class="up-add"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>시간 추가</button>
      <div class="up-savebar" hidden><span class="up-save-note" aria-hidden="true">저장하지 않은 변경</span><div><button type="button" class="up-text-button up-cancel">취소</button><button type="submit" class="up-button up-primary">시간표 저장</button></div></div>
    </form>
    <p class="up-foot">PC와 폰에서 함께 사용해요. AI 작업 실행은 아직 연결 전이에요.</p>
  </div>`;
  const style = document.createElement('style'); style.textContent = presenceCss; root.prepend(style);
  const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
  const message = query<HTMLElement>('.up-message');
  const manualForm = query<HTMLFormElement>('.up-manual');
  const scheduleForm = query<HTMLFormElement>('.up-schedule');
  const list = query<HTMLElement>('.up-rules');
  let report: Report | null = null, busy = false, disposed = false, dirty = false, editing = false;
  const controller = new AbortController();
  const say = (text: string, error = false): void => {
    message.textContent = text; message.hidden = !text; message.classList.toggle('up-error', error);
    message.setAttribute('role', error ? 'alert' : 'status');
    query<HTMLElement>('.up-save-note').textContent = error ? text : '저장하지 않은 변경';
  };
  const updateScheduleHelp = (): void => {
    query<HTMLElement>('.up-schedule-help').textContent = query<HTMLInputElement>('.up-enabled input').checked ? '아래 시간에만 다른 상태로 바뀌어요.' : '자동 적용이 꺼져 있어요. 평소 상태만 유지해요.';
  };
  const controls = (): void => {
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(el => { el.disabled = busy || (!report && !el.classList.contains('up-refresh')); });
    query<HTMLButtonElement>('.up-add').disabled = busy || !report || list.children.length >= 256;
  };
  const changed = (): void => { dirty = true; query<HTMLElement>('.up-savebar').hidden = false; say(''); };
  function updateEmpty(): void {
    query<HTMLElement>('.up-empty').hidden = list.children.length > 0;
    controls();
  }
  function addRule(rule?: Rule): HTMLDetailsElement {
    const row = document.createElement('details'); row.className = 'up-rule'; row.dataset.id = rule?.id || crypto.randomUUID();
    row.innerHTML = `<summary><span class="up-rule-state"></span><span class="up-rule-time"></span><span class="up-rule-days"></span>${chevron}</summary>
      <div class="up-editor">
        <div class="up-day-presets" aria-label="요일 빠른 선택"><button type="button" data-days="1,2,3,4,5">평일</button><button type="button" data-days="6,0">주말</button><button type="button" data-days="0,1,2,3,4,5,6">매일</button></div>
        <fieldset class="up-day-field"><legend>반복 요일</legend><div class="up-days">${[1,2,3,4,5,6,0].map(day => `<label><input type="checkbox" value="${day}" ${rule?.days.includes(day) ? 'checked' : ''}><span>${DAYS[day]}</span></label>`).join('')}</div></fieldset>
        <div class="up-time-fields"><label>시작<input type="time" name="start" value="${esc(rule?.start || '')}" required></label><span class="up-time-separator" aria-hidden="true">~</span><label>종료<input type="time" name="end" value="${esc(rule?.end === '24:00' ? '00:00' : rule?.end || '')}" required></label><label class="up-rule-state-field">이 시간에는<select name="state">${options()}</select></label></div>
        <div class="up-editor-foot"><label class="up-allday"><input type="checkbox" name="allday" ${rule?.start === '00:00' && rule?.end === '24:00' ? 'checked' : ''}>하루 종일</label><p class="up-overnight"></p></div>
        <div class="up-editor-actions"><button type="button" class="up-text-button up-remove">구간 삭제</button><button type="button" class="up-button up-fold">접기</button></div>
      </div>`;
    if (rule) row.querySelector<HTMLSelectElement>('select')!.value = rule.state;
    const start = row.querySelector<HTMLInputElement>('[name=start]')!, end = row.querySelector<HTMLInputElement>('[name=end]')!, allDay = row.querySelector<HTMLInputElement>('[name=allday]')!;
    const selectedDays = (): number[] => Array.from(row.querySelectorAll<HTMLInputElement>('.up-days input:checked')).map(el => Number(el.value));
    const updateSummary = (): void => {
      const days = selectedDays(), overnight = !allDay.checked && start.value && end.value && end.value < start.value;
      const state = row.querySelector<HTMLSelectElement>('select')!.value;
      row.querySelector<HTMLElement>('.up-rule-state')!.textContent = LABELS[state];
      row.querySelector<HTMLElement>('.up-rule-days')!.textContent = dayText(days);
      row.querySelector<HTMLElement>('.up-rule-time')!.textContent = allDay.checked ? '하루 종일' : (start.value || '--:--') + ' ~ ' + (end.value === '00:00' ? '자정' : end.value || '--:--') + (overnight && end.value !== '00:00' ? ' 다음 날' : '');
      row.querySelector<HTMLElement>('.up-overnight')!.textContent = overnight ? '종료는 다음 날이에요.' : '';
      start.readOnly = end.readOnly = allDay.checked;
      row.querySelectorAll<HTMLButtonElement>('[data-days]').forEach(button => {
        const preset = button.dataset.days!.split(',').map(Number);
        button.setAttribute('aria-pressed', String(preset.length === days.length && preset.every(day => days.includes(day))));
      });
    };
    row.addEventListener('input', updateSummary);
    row.querySelectorAll<HTMLButtonElement>('[data-days]').forEach(button => button.addEventListener('click', () => {
      const days = button.dataset.days!.split(',').map(Number);
      row.querySelectorAll<HTMLInputElement>('.up-days input').forEach(input => { input.checked = days.includes(Number(input.value)); });
      updateSummary(); changed();
    }));
    allDay.addEventListener('change', () => { if (allDay.checked) { start.value = '00:00'; end.value = '00:00'; } updateSummary(); });
    row.querySelector('.up-remove')!.addEventListener('click', () => { row.remove(); changed(); updateEmpty(); query<HTMLButtonElement>('.up-add').focus(); });
    row.querySelector('.up-fold')!.addEventListener('click', () => {
      if (!start.reportValidity() || !end.reportValidity()) return;
      if (!selectedDays().length) { say('반복할 요일을 선택해 주세요.', true); return; }
      row.open = false; row.querySelector<HTMLElement>('summary')!.focus();
    });
    row.addEventListener('toggle', () => {
      if (row.open) for (const other of list.querySelectorAll<HTMLDetailsElement>('.up-rule')) if (other !== row) other.open = false;
      editing = !!list.querySelector('details[open]');
    });
    list.appendChild(row); updateSummary(); updateEmpty(); return row;
  }
  function paint(value: Report, form = false): void {
    report = value;
    query<HTMLElement>('.up-state').textContent = value.current.state ? LABELS[value.current.state] || '미확인' : '미설정';
    query<HTMLElement>('.up-source').textContent = value.current.source === 'manual' ? (value.config.manual?.until ? when(value.config.manual.until) + '까지 직접 설정' : '직접 해제할 때까지 유지') : value.current.source === 'schedule' ? '시간표에 따라 자동 적용 중' : value.current.source === 'default' ? '평소 상태로 지내는 시간이에요.' : '평소 상태를 먼저 선택해 주세요.';
    query<HTMLElement>('.up-next').textContent = value.next ? when(value.next.at) + ' → ' + (value.next.state ? LABELS[value.next.state] : '미설정') : '예정된 변경 없음';
    query<HTMLElement>('.up-resume').hidden = value.current.source !== 'manual';
    ctx.status(when(value.evaluatedAt) + ' 확인');
    if (form) {
      list.replaceChildren();
      for (const rule of value.config.rules) addRule(rule);
      query<HTMLInputElement>('.up-enabled input').checked = value.config.enabled;
      query<HTMLSelectElement>('[name=defaultState]').value = value.config.defaultState || '';
      updateScheduleHelp();
      query<HTMLElement>('.up-savebar').hidden = true;
      dirty = false; editing = false; updateEmpty();
    }
    controls();
  }
  async function request(body?: unknown): Promise<Report> {
    const token = await ctx.ghToken();
    if (!token) throw new Error('로그인 후 새로고침해 주세요.');
    const response = await fetch('https://bot.mascari4615.com/dash/user-presence', { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error(response.status === 409 ? '다른 기기에서 변경했어요. 취소 후 다시 편집해 주세요.' : response.status === 400 ? '시간이 겹치는 구간이 있어요. 요일과 시작, 종료를 확인해 주세요.' : response.status === 404 ? '상태 서버 배포 대기 중이에요. 잠시 뒤 새로고침해 주세요.' : response.status === 401 || response.status === 403 ? '본인 계정으로 로그인해 주세요.' : '서버에 연결하지 못했어요. 입력은 그대로 있으니 다시 시도해 주세요.');
    return response.json() as Promise<Report>;
  }
  async function run(action: () => Promise<void>, feedback = ''): Promise<void> {
    if (busy || disposed) return;
    busy = true; controls(); if (feedback) say(feedback);
    try { await action(); }
    catch (error) { if (!disposed) { say((error as Error).message || '연결 실패. 다시 시도해 주세요.', true); if (!report) query<HTMLElement>('.up-state').textContent = '확인 불가'; } }
    finally { busy = false; if (!disposed) controls(); }
  }
  const refresh = (explicit = false): void => { void run(async () => {
    const fresh = await request(); if (disposed) return;
    paint(fresh, explicit || (!dirty && !editing)); if (explicit) say('최신 상태를 불러왔어요.');
  }, explicit ? '불러오는 중...' : ''); };
  query('.up-refresh').addEventListener('click', () => {
    if (dirty) { say('변경을 저장하거나 취소한 뒤 새로고침해 주세요.', true); return; }
    refresh(true);
  });
  query('.up-cancel').addEventListener('click', () => { dirty = false; editing = false; refresh(true); });
  scheduleForm.addEventListener('input', changed);
  query('.up-enabled input').addEventListener('change', updateScheduleHelp);
  query('.up-add').addEventListener('click', () => {
    const row = addRule(); row.open = true; editing = true; changed();
    row.querySelector<HTMLInputElement>('[name=start]')!.focus();
  });
  function closeManual(): void { manualForm.hidden = true; query<HTMLButtonElement>('.up-change').setAttribute('aria-expanded', 'false'); }
  query('.up-change').addEventListener('click', () => {
    manualForm.hidden = !manualForm.hidden;
    query<HTMLButtonElement>('.up-change').setAttribute('aria-expanded', String(!manualForm.hidden));
    if (!manualForm.hidden && report) {
      const state = report.current.state || report.config.defaultState || 'home';
      const input = manualForm.querySelector<HTMLInputElement>('input[value="' + state + '"]'); if (input) { input.checked = true; input.focus(); }
    }
  });
  query('.up-manual-close').addEventListener('click', () => { closeManual(); query<HTMLButtonElement>('.up-change').focus(); });
  manualForm.addEventListener('submit', event => { event.preventDefault(); if (!report) return;
    const data = new FormData(manualForm), duration = data.get('duration'), now = Date.now(), kst = new Date(now + 9 * 3_600_000);
    const until = duration === 'forever' ? null : duration === 'today' ? Date.parse(kst.toISOString().slice(0, 10) + 'T00:00:00+09:00') + 86_400_000 : now + Number(duration) * 60_000;
    void run(async () => { const fresh = await request({ action: 'manual', revision: report!.config.revision, state: data.get('state'), until }); if (!disposed) { paint(fresh); closeManual(); say('지금 상태를 바꿨어요.'); query<HTMLButtonElement>('.up-change').focus(); } }, '상태를 바꾸는 중...');
  });
  query('.up-resume').addEventListener('click', () => { if (!report) return; void run(async () => { const fresh = await request({ action: 'resume', revision: report!.config.revision }); if (!disposed) { paint(fresh); closeManual(); say('시간표로 돌아왔어요.'); } }); });
  scheduleForm.addEventListener('submit', event => {
    event.preventDefault(); if (!report) return;
    const rows = Array.from(list.querySelectorAll<HTMLDetailsElement>('.up-rule'));
    const rules = rows.map(row => ({ id: row.dataset.id!, days: Array.from(row.querySelectorAll<HTMLInputElement>('.up-days input:checked')).map(input => Number(input.value)), start: row.querySelector<HTMLInputElement>('[name=start]')!.value, end: row.querySelector<HTMLInputElement>('[name=allday]')!.checked ? '24:00' : row.querySelector<HTMLInputElement>('[name=end]')!.value, state: row.querySelector<HTMLSelectElement>('select')!.value }));
    const invalid = rules.findIndex(rule => !rule.days.length || !rule.start || !rule.end || rule.start === rule.end);
    if (invalid >= 0) {
      rows[invalid].open = true;
      say(!rules[invalid].days.length ? '반복할 요일을 선택해 주세요.' : '시작과 종료를 다르게 지정해 주세요. 24시간은 하루 종일을 선택해 주세요.', true);
      rows[invalid].querySelector<HTMLInputElement>('input')!.focus(); return;
    }
    // Capture before disabling controls; native form validation must also reach folded rows.
    const body = { action: 'schedule', revision: report.config.revision, enabled: query<HTMLInputElement>('.up-enabled input').checked, defaultState: query<HTMLSelectElement>('[name=defaultState]').value || null, rules };
    void run(async () => { const fresh = await request(body); if (!disposed) { paint(fresh, true); say('시간표를 저장했어요.'); } }, '저장하는 중...');
  });
  const onInvalid = (event: Event): void => { const row = (event.target as HTMLElement).closest<HTMLDetailsElement>('.up-rule'); if (row) row.open = true; };
  scheduleForm.addEventListener('invalid', onInvalid, true);
  const onVisible = (): void => { if (!document.hidden && !dirty && !editing && manualForm.hidden) refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => { if (!document.hidden && !dirty && !editing && manualForm.hidden) refresh(); }, 30_000);
  ctx.onDispose(() => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); });
  controls(); refresh();
}

dashRegistry().register({ id: 'user-presence', title: '내 상태', access: 'read', paths: [], render: renderUserPresence });
