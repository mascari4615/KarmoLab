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
const options = (): string => Object.entries(LABELS).map(([id, label]) => `<option value="${id}">${label}</option>`).join('');

export function renderUserPresence(ctx: DashPanelCtx): void {
  const root = ctx.root;
  root.innerHTML = `<div class="up-panel">
    <section class="up-current" aria-labelledby="up-heading"><h2 id="up-heading">지금 내 상태</h2><p class="up-state" aria-live="polite">확인 중</p><p class="up-source"></p><p class="up-next"></p><button type="button" class="btn btn-ghost up-refresh">다시 확인</button></section>
    <p class="up-message" role="status"></p>
    <form class="up-manual"><h3>수동 설정</h3><p>선택한 기간에는 시간표보다 수동 설정을 우선해요.</p><div class="up-fields"><label>현재 상태<select name="state">${options()}</select></label><label>유지 기간<select name="duration"><option value="60">1시간</option><option value="180">3시간</option><option value="today">오늘 자정까지</option><option value="forever">직접 해제할 때까지</option></select></label><button class="btn" type="submit">상태 적용</button><button class="btn btn-ghost up-resume" type="button">수동 설정 해제</button></div></form>
    <form class="up-schedule"><h3>시간별 자동 전환</h3><label class="up-enabled"><input type="checkbox" name="enabled"> 시간표 사용</label><p>한국 시간 기준. 선택한 요일의 시작부터 종료까지 적용해요. 종료가 시작보다 이르면 다음 날 종료예요. 브라우저를 닫아도 적용돼요.</p><div class="up-fields"><label>구간 밖 기본 상태<select name="defaultState"><option value="">미설정</option>${options()}</select></label></div><p>시간표가 꺼져 있거나 어떤 구간에도 해당하지 않으면 기본 상태로 돌아가요.</p><div class="up-rules"></div><div class="up-actions"><button type="button" class="btn btn-ghost up-add">시간 구간 추가</button><button type="submit" class="btn">시간표 저장</button></div><p class="up-empty">시간표는 아직 비어 있어요. 요일과 시작, 종료 시각을 추가해 주세요.</p></form>
    <p class="up-foot">PC와 폰에서 같은 상태 사용. 상태에 따른 AI 작업 실행은 아직 연결하지 않았어요.</p></div>`;
  const style = document.createElement('style'); style.textContent = presenceCss; root.prepend(style);
  const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
  const message = query<HTMLElement>('.up-message');
  const manualForm = query<HTMLFormElement>('.up-manual');
  const scheduleForm = query<HTMLFormElement>('.up-schedule');
  const list = query<HTMLElement>('.up-rules');
  let report: Report | null = null, busy = false, disposed = false, dirty = false;
  const controller = new AbortController();
  const controls = (): void => {
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(el => { el.disabled = busy || (!report && !el.classList.contains('up-refresh')); });
    query<HTMLButtonElement>('.up-resume').disabled = busy || !report || report.current.source !== 'manual';
  };
  function addRule(rule?: Rule): void {
    const row = document.createElement('fieldset'); row.className = 'up-rule'; row.dataset.id = rule?.id || crypto.randomUUID();
    row.innerHTML = `<legend>시간 구간</legend><div class="up-days">${[1, 2, 3, 4, 5, 6, 0].map(day => `<label><input type="checkbox" value="${day}" ${rule?.days.includes(day) ? 'checked' : ''}>${DAYS[day]}</label>`).join('')}</div><div class="up-fields"><label>시작<input type="time" name="start" value="${esc(rule?.start || '')}" required></label><label>종료<input type="time" name="end" value="${esc(rule?.end === '24:00' ? '00:00' : rule?.end || '')}" required></label><label class="up-midnight"><input type="checkbox" name="midnight" ${rule?.end === '24:00' ? 'checked' : ''}>종료를 그날 자정으로</label><label>상태<select name="state">${options()}</select></label><button type="button" class="btn btn-ghost up-remove">삭제</button></div><p class="up-overnight"></p>`;
    if (rule) row.querySelector<HTMLSelectElement>('select')!.value = rule.state;
    const start = row.querySelector<HTMLInputElement>('[name=start]')!, end = row.querySelector<HTMLInputElement>('[name=end]')!, midnight = row.querySelector<HTMLInputElement>('[name=midnight]')!;
    const hint = (): void => {
      const overnight = !midnight.checked && start.value && end.value && end.value < start.value;
      row.querySelector<HTMLElement>('.up-overnight')!.textContent = midnight.checked ? '선택한 요일의 끝, 24:00에 종료' : overnight ? '선택한 요일에 시작, 다음 날 종료' : '';
      end.readOnly = midnight.checked;
    };
    row.addEventListener('input', hint); hint();
    row.querySelector('button')!.addEventListener('click', () => { row.remove(); dirty = true; updateEmpty(); });
    list.appendChild(row); updateEmpty();
  }
  function updateEmpty(): void {
    query<HTMLElement>('.up-empty').hidden = list.children.length > 0;
    query<HTMLButtonElement>('.up-add').disabled = busy || !report || list.children.length >= 256;
  }
  function paint(value: Report, form = false): void {
    report = value;
    query<HTMLElement>('.up-state').textContent = value.current.state ? LABELS[value.current.state] || '미확인' : '미설정';
    query<HTMLElement>('.up-source').textContent = value.current.source === 'manual' ? `수동 설정, ${value.config.manual?.until ? when(value.config.manual.until) + '까지' : '직접 해제할 때까지'}` : value.current.source === 'schedule' ? '시간표 적용 중, 한국 시간' : value.current.source === 'default' ? '구간 밖 기본 상태 적용 중' : '수동 설정하거나 기본 상태와 시간표를 지정해 주세요.';
    query<HTMLElement>('.up-next').textContent = value.next ? `다음 전환 ${when(value.next.at)}, ${value.next.state ? LABELS[value.next.state] : '미설정'}` : '예정된 전환 없음';
    ctx.status(`${when(value.evaluatedAt)} 확인`);
    if (form) {
      list.replaceChildren();
      for (const rule of value.config.rules) addRule(rule);
      query<HTMLInputElement>('.up-enabled input').checked = value.config.enabled;
      query<HTMLSelectElement>('[name=defaultState]').value = value.config.defaultState || '';
      dirty = false; updateEmpty();
    }
    controls();
  }
  async function request(body?: unknown): Promise<Report> {
    const token = await ctx.ghToken();
    if (!token) throw new Error('로그인 후 다시 확인해 주세요.');
    const response = await fetch('https://bot.mascari4615.com/dash/user-presence', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error(response.status === 409 ? '다른 기기에서 변경했어요. 다시 확인 후 저장해 주세요.' : response.status === 400 ? '시간 구간을 확인해 주세요. 시작과 종료는 달라야 하고, 구간이 겹치면 저장할 수 없어요.' : response.status === 404 ? '상태 서버 배포 대기 중. 배포 후 다시 확인해 주세요.' : response.status === 401 || response.status === 403 ? '본인 계정으로 로그인한 뒤 다시 확인해 주세요.' : '상태 서버에 연결하지 못했어요. 다시 확인해 주세요.');
    return response.json() as Promise<Report>;
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy || disposed) return;
    busy = true; controls(); message.textContent = '확인 중...';
    try { await action(); }
    catch (error) { if (!disposed) {
      message.textContent = (error as Error).message || '연결 실패. 다시 확인해 주세요.';
      if (!report) query<HTMLElement>('.up-state').textContent = '확인 불가';
    } }
    finally { busy = false; if (!disposed) { controls(); updateEmpty(); } }
  }
  const refresh = (explicit = false): void => { void run(async () => {
    const fresh = await request(); if (disposed) return;
    paint(fresh, explicit || !dirty); message.textContent = dirty ? '현재 상태 갱신됨. 작성 중인 시간표는 저장 전이에요.' : '서버 상태 확인됨';
  }); };
  query('.up-refresh').addEventListener('click', () => {
    if (dirty) { message.textContent = '작성 중인 시간표가 있어요. 저장하거나 아래의 편집 취소를 눌러 주세요.'; return; }
    refresh(true);
  });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-ghost'; cancel.textContent = '편집 취소';
  cancel.addEventListener('click', () => { dirty = false; refresh(true); }); query('.up-actions').appendChild(cancel);
  scheduleForm.addEventListener('input', () => { dirty = true; });
  query('.up-add').addEventListener('click', () => { addRule(); dirty = true; list.lastElementChild?.querySelector<HTMLInputElement>('input')?.focus(); });
  manualForm.addEventListener('submit', event => { event.preventDefault(); if (!report) return;
    const data = new FormData(manualForm), duration = data.get('duration');
    const now = Date.now(), kst = new Date(now + 9 * 3_600_000);
    const until = duration === 'forever' ? null : duration === 'today' ? Date.parse(kst.toISOString().slice(0, 10) + 'T00:00:00+09:00') + 86_400_000 : now + Number(duration) * 60_000;
    void run(async () => { const fresh = await request({ action: 'manual', revision: report!.config.revision, state: data.get('state'), until }); if (!disposed) { paint(fresh); message.textContent = '수동 상태 저장됨'; } });
  });
  query('.up-resume').addEventListener('click', () => { if (!report) return; void run(async () => { const fresh = await request({ action: 'resume', revision: report!.config.revision }); if (!disposed) { paint(fresh); message.textContent = '수동 설정 해제됨'; } }); });
  scheduleForm.addEventListener('submit', event => { event.preventDefault(); if (!report) return;
    const rules = Array.from(list.querySelectorAll<HTMLElement>('.up-rule')).map(row => ({ id: row.dataset.id!, days: Array.from(row.querySelectorAll<HTMLInputElement>('.up-days input:checked')).map(input => Number(input.value)), start: row.querySelector<HTMLInputElement>('[name=start]')!.value, end: row.querySelector<HTMLInputElement>('[name=midnight]')!.checked ? '24:00' : row.querySelector<HTMLInputElement>('[name=end]')!.value, state: row.querySelector<HTMLSelectElement>('select')!.value }));
    if (rules.some(rule => !rule.days.length)) { message.textContent = '각 구간의 요일을 하나 이상 선택해 주세요.'; return; }
    if (rules.some(rule => rule.start === rule.end)) { message.textContent = '시작과 종료를 다르게 지정해 주세요. 하루 전체는 00:00 시작과 그날 자정 종료를 선택해 주세요.'; return; }
    void run(async () => { const fresh = await request({ action: 'schedule', revision: report!.config.revision, enabled: query<HTMLInputElement>('.up-enabled input').checked, defaultState: query<HTMLSelectElement>('[name=defaultState]').value || null, rules }); if (!disposed) { paint(fresh, true); message.textContent = '시간표 저장됨'; } });
  });
  const onVisible = (): void => { if (!document.hidden && !dirty) refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => { if (!document.hidden && !dirty) refresh(); }, 30_000);
  ctx.onDispose(() => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); });
  controls(); refresh();
}

dashRegistry().register({ id: 'user-presence', title: '내 상태', access: 'read', paths: [], render: renderUserPresence });
