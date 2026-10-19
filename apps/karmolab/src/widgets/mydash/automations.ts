import { dashRegistry, esc, type DashPanelCtx } from './kit';
type Action = 'start' | 'stop' | 'restart' | 'enable' | 'disable';
interface Item { id: string; provider: string; host: string; name: string; kind: string; trigger: string; running: boolean | null; enabled: boolean | null; actions: Action[]; revision: string; detail?: string; lastRunAt?: string; nextRunAt?: string; lastResult?: number; url?: string }
interface Inventory { at: string; sources: { provider: string; label: string; error: boolean }[]; items: Item[] }
const labels: Record<Action, string> = { start: '실행', stop: '중지', restart: '재시작', enable: '자동 실행 켜기', disable: '자동 실행 끄기' };
const kinds: Record<string, string> = { service: '상주 서비스', task: '예약 작업', startup: '로그인 시 시작', workflow: 'GitHub workflow' };
const errors: Record<string, string> = { inventory_changed: '다른 곳에서 상태가 바뀌었습니다. 새 상태 확인 후 다시 실행해 주세요.', change_in_progress: '이 항목을 변경 중입니다.', action_not_supported: '이 항목은 이 동작을 허용하지 않습니다.', source_unavailable: '원본에 연결하지 못했습니다. 새로고침해 주세요.' };
const time = (value?: string): string => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '미확인';

export async function renderAutomations(ctx: DashPanelCtx, api = 'https://laptop.mascari4615.com/dash/automations'): Promise<void> {
  let inventory: Inventory | undefined, busy = false, failed = false, changeError = false, notice = '자동화 목록을 불러오는 중...', search = '', host = '', selected = '';
  const controllers = new Set<AbortController>();
  ctx.onDispose(() => controllers.forEach(controller => controller.abort()));
  async function request(id = '', action?: Action): Promise<Inventory> {
    const token = await ctx.ghToken();
    if (!token) throw Error('로그인 확인 필요');
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const item = inventory?.items.find(entry => entry.id === id);
      const response = await fetch(api + (id ? '/' + encodeURIComponent(id) : ''), { method: action ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(action ? { 'Content-Type': 'application/json' } : {}) }, ...(action ? { body: JSON.stringify({ action, revision: item?.revision }) } : {}), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'connection_failed');
      if (!Array.isArray(body.items) || !Array.isArray(body.sources)) throw Error('invalid_inventory');
      return body;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function button(item: Item, action: Action): string {
    return `<button type="button" data-item="${esc(item.id)}" data-action="${action}" aria-label="${esc(item.name)} ${labels[action]}" ${busy || failed ? 'disabled' : ''}>${labels[action]}</button>`;
  }
  function row(item: Item): string {
    const runtime = item.running === null ? '상태 미확인' : item.running ? '실행 중' : item.kind === 'task' || item.kind === 'workflow' ? '대기' : '중지';
    const actions = item.actions;
    const open = selected === item.id;
    return `<article class="au-row" data-row="${esc(item.id)}"><div class="au-line"><div class="au-name"><strong>${esc(item.name)}</strong><small>${esc(item.host)} / ${esc(kinds[item.kind] || item.kind)}</small></div><div class="au-trigger">${esc(item.trigger)}</div><div class="au-state" data-running="${item.running}">${runtime}${item.enabled === null ? '' : `<small>자동 ${item.enabled ? '켜짐' : '꺼짐'}</small>`}</div><div class="au-actions">${actions.includes(item.running ? 'stop' : 'start') ? button(item, item.running ? 'stop' : 'start') : ''}${actions.includes('restart') ? button(item, 'restart') : ''}<button type="button" data-detail="${esc(item.id)}" aria-label="${esc(item.name)} 상세" aria-expanded="${open}">${open ? '닫기' : '상세'}</button></div></div>${open ? `<div class="au-detail"><p>${esc(item.detail || '')}</p><dl><dt>자동 실행</dt><dd>${item.enabled === null ? '미확인' : item.enabled ? '켜짐' : '꺼짐'}</dd>${item.lastRunAt ? `<dt>마지막 실행</dt><dd>${esc(time(item.lastRunAt))}</dd>` : ''}${item.nextRunAt ? `<dt>다음 실행</dt><dd>${esc(time(item.nextRunAt))}</dd>` : ''}${typeof item.lastResult === 'number' ? `<dt>실행 결과 코드</dt><dd>${item.lastResult}</dd>` : ''}</dl>${actions.includes(item.enabled ? 'disable' : 'enable') ? button(item, item.enabled ? 'disable' : 'enable') : ''}${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">원본에서 열기</a>` : ''}</div>` : ''}</article>`;
  }
  function list(): void {
    const area = ctx.root.querySelector<HTMLElement>('.au-list');
    if (!area) return;
    const query = search.toLowerCase();
    const items = inventory?.items.filter(item => (!host || item.host === host) && [item.name, item.host, item.kind, kinds[item.kind], item.trigger].join(' ').toLowerCase().includes(query)) || [];
    area.innerHTML = items.length ? items.map(row).join('') : `<p>${inventory ? inventory.sources.some(source => source.error) ? '조회하지 못한 원본이 있습니다. 연결 상태를 확인해 주세요.' : '조건에 맞는 자동화가 없습니다.' : '목록 조회 중...'}</p>`;
    area.querySelectorAll<HTMLButtonElement>('[data-detail]').forEach(control => control.addEventListener('click', () => { selected = selected === control.dataset.detail ? '' : control.dataset.detail!; list(); area.querySelector<HTMLButtonElement>(`[data-detail="${CSS.escape(control.dataset.detail!)}"]`)?.focus({ preventScroll: true }); }));
    area.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(control => control.addEventListener('click', () => { void change(control.dataset.item!, control.dataset.action as Action); }));
  }
  function paint(): void {
    if (!ctx.isCurrent()) return;
    const hosts = [...new Set(inventory?.items.map(item => item.host) || [])];
    ctx.root.innerHTML = `<div class="dc au"><header><div><h2>자동화</h2><p>상주 서비스, 예약 작업과 자동 시작을 한곳에서.</p></div><button type="button" data-refresh ${busy ? 'disabled' : ''}>새로고침</button></header><p class="au-notice" role="${failed ? 'alert' : 'status'}">${esc(notice)}</p>${inventory?.sources.some(source => source.error) ? `<p class="au-error">조회 실패: ${inventory.sources.filter(source => source.error).map(source => esc(source.label)).join(', ')}</p>` : ''}<div class="au-filters"><label>찾기<input type="search" value="${esc(search)}" placeholder="이름, 기기, 실행 조건" data-search></label><label>실행 위치<select data-host><option value="">전체</option>${hosts.map(value => `<option value="${esc(value)}" ${host === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><small>${inventory ? `${inventory.items.length}개 / ${esc(time(inventory.at))} 확인` : ''}</small></div><div class="au-columns" aria-hidden="true"><span>자동화</span><span>실행 조건</span><span>상태</span><span>제어</span></div><div class="au-list"></div><p class="au-note">실행 중지와 자동 실행 끄기는 별도입니다. 연결 유지 항목과 관리 범위 밖 항목은 조회만 제공합니다.</p></div>`;
    ctx.root.querySelector('[data-refresh]')?.addEventListener('click', () => { void refresh(); });
    ctx.root.querySelector('.au-notice')?.setAttribute('role', failed || changeError ? 'alert' : 'status');
    ctx.root.querySelector<HTMLInputElement>('[data-search]')?.addEventListener('input', event => { search = (event.currentTarget as HTMLInputElement).value; list(); });
    ctx.root.querySelector<HTMLSelectElement>('[data-host]')?.addEventListener('change', event => { host = (event.currentTarget as HTMLSelectElement).value; list(); });
    list();
  }
  async function refresh(): Promise<void> {
    busy = true; changeError = false; paint();
    try { inventory = await request(); failed = false; notice = '실제 실행 상태와 자동 실행 설정'; }
    catch { failed = true; notice = '자동화 원본에 연결하지 못했습니다. 새로고침해 주세요.'; }
    finally { busy = false; paint(); }
  }
  async function change(id: string, action: Action): Promise<void> {
    if (busy || failed) return;
    busy = true; changeError = false; notice = labels[action] + ' 적용 중...'; paint();
    try { inventory = await request(id, action); notice = '요청 처리 후 실제 상태를 다시 조회했습니다.'; failed = false; }
    catch (error) {
      changeError = true;
      notice = errors[(error as Error).message] || '변경에 실패했습니다. 상태를 새로 확인해 주세요.';
      try { inventory = await request(); } catch { failed = true; }
    } finally { busy = false; paint(); ctx.root.querySelector<HTMLButtonElement>(`[data-detail="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
  }
  await refresh();
}
dashRegistry().register({ id: 'automations', title: '자동화', access: 'read', paths: [], render: renderAutomations });
