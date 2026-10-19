import { dashRegistry, esc, type DashPanelCtx } from './kit';

interface Field {
  key: string; label: string; type: 'number' | 'choices'; value: number | string[];
  min?: number; max?: number; options?: { value: string; label: string }[];
}
interface Service {
  id: string; title: string; description: string; group: string; kind: 'managed' | 'external';
  enabled?: boolean; fields?: Field[]; settingsLink?: { label: string; href: string };
  lifecycle?: { running: boolean | null; detail: string; error: boolean } | null;
  observation?: { sent: number; skipped: number; failed: number; lastSentAt?: string; lastErrorAt?: string };
  connected?: boolean; lastSeenAt?: string | null; url?: string;
}
interface Report {
  version: number; channel: { name: string; url: string } | null; services: Service[];
  collectedAt: string; observationsSince: string;
}
const API = 'https://bot.mascari4615.com/dash/notification-services';
const at = (value?: string | null): string => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) : '아직 수신 확인 없음';
const errors: Record<string, string> = {
  settings_conflict: '다른 곳에서 설정이 바뀌었습니다. 새 상태를 확인한 뒤 다시 변경해 주세요.',
  change_in_progress: '다른 변경을 적용 중입니다. 잠시 뒤 다시 시도해 주세요.',
  invalid_settings: '설정 범위와 선택한 값을 확인해 주세요.',
  service_not_configured: '서비스가 시작되지 않았습니다. 설정과 연결 상태를 확인해 주세요.',
  lifecycle_not_supported: '이 서비스는 여기서 실행을 제어할 수 없습니다.',
  login_required: '로그인을 새로 확인해 주세요.', owner_required: '본인 계정만 설정을 변경할 수 있습니다.',
};

export async function renderByeoru(ctx: DashPanelCtx, api = API): Promise<void> {
  let report: Report | undefined;
  let busy = true;
  let notice = '서비스 상태를 불러오는 중...';
  let failed = false;
  let inspected: string | null = null;
  let externalOpen = false;
  let changeError = false;
  const controllers = new Set<AbortController>();
  ctx.onDispose(() => controllers.forEach(controller => controller.abort()));

  async function request(method = 'GET', id = '', patch?: object): Promise<Report> {
    const token = await ctx.ghToken();
    if (!token) throw Error('login_required');
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(api + (id ? '/' + encodeURIComponent(id) : ''), {
        method, headers: { Authorization: `Bearer ${token}`, ...(patch ? { 'Content-Type': 'application/json' } : {}) },
        ...(patch ? { body: JSON.stringify({ version: report?.version, ...patch }) } : {}), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'services_unavailable');
      if (method === 'GET' && (!Array.isArray(body.services) || !Number.isSafeInteger(body.version))) throw Error('services_unavailable');
      return body as Report;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function fieldHtml(field: Field): string {
    const key = esc(field.key);
    if (field.type === 'number') return `<label class="bn-field">${esc(field.label)}<input name="${key}" type="number" min="${field.min}" max="${field.max}" step="1" required value="${Number(field.value)}"></label>`;
    const selected = Array.isArray(field.value) ? field.value : [];
    return `<fieldset class="bn-choices"><legend>${esc(field.label)}</legend>${(field.options || []).map(option => `<label><input type="checkbox" name="${key}" value="${esc(option.value)}" ${selected.includes(option.value) ? 'checked' : ''}>${esc(option.label)}</label>`).join('')}</fieldset>`;
  }
  function row(service: Service): string {
    const disabled = busy || failed ? 'disabled' : '';
    const life = service.lifecycle;
    const observation = service.observation;
    const activity = service.kind === 'external'
      ? service.lastSeenAt ? `최근 수신 ${at(service.lastSeenAt)}` : '최근 수신 미확인'
      : observation?.lastSentAt ? `최근 전송 ${at(observation.lastSentAt)}` : '이번 실행에서 전송 기록 없음';
    const open = inspected === service.id;
    const status = life ? life.running === null ? '확인 필요' : life.running ? '실행 중' : '중지됨' : service.kind === 'external' ? service.connected ? '연결됨' : '확인 필요' : '요청 시 수신';
    const settings = service.fields?.length ? `<form data-service="${esc(service.id)}">${service.fields.map(fieldHtml).join('')}<div class="bn-save"><button type="submit" ${disabled}>설정 저장</button><span>실행 중인 서비스에 바로 적용</span></div></form>` : '';
    return `<article class="bn-row${open ? ' bn-selected' : ''}" data-row="${esc(service.id)}"><div class="bn-line"><div class="bn-source"><h4>${esc(service.title)}</h4><p>${esc(service.kind === 'external' ? activity : service.description)}</p></div>
      <div class="bn-runtime"><span class="bn-state" data-state="${life?.error || life?.running === null ? 'attention' : life?.running || service.connected ? 'on' : 'off'}">${status}${life?.error ? ', 확인 필요' : ''}</span>${life ? `<button type="button" class="bn-run" aria-label="${esc(service.title)} ${life.running ? '중지' : '시작'}" data-action="lifecycle" data-service="${esc(service.id)}" ${disabled || life.running === null ? 'disabled' : ''}>${life.running ? '중지' : '시작'}</button>` : ''}</div>
      <div class="bn-delivery">${typeof service.enabled === 'boolean' ? `<button type="button" role="switch" aria-label="${esc(service.title)} 알림 받기" aria-checked="${service.enabled ? 'true' : 'false'}" data-action="delivery" data-service="${esc(service.id)}" ${disabled}><span class="bn-switch-track" aria-hidden="true"></span><span>${service.enabled ? '켬' : '끔'}</span></button>` : '<span class="bn-external-label">직접 수신</span>'}</div>
      <button type="button" class="bn-inspect" data-inspect="${esc(service.id)}" aria-label="${esc(service.title)} 상세 설정" aria-expanded="${open}" ${open ? `aria-controls="bn-detail-${esc(service.id)}"` : ''}>${open ? '닫기' : '상세'}</button></div>
      ${open ? `<div class="bn-detail" id="bn-detail-${esc(service.id)}"><div class="bn-detail-info"><p>${esc(activity)}</p>${life?.detail ? `<p>${esc(life.detail)}</p>` : ''}${observation ? `<p>전송 ${observation.sent}회 · 건너뜀 ${observation.skipped}회 · 실패 ${observation.failed}회</p>` : ''}${observation?.failed ? `<p class="bn-warning">최근 전송 실패 ${esc(at(observation.lastErrorAt))}</p>` : ''}${service.kind === 'external' ? `<p>실행과 중지는 원래 서비스에서 관리</p>${service.url ? `<a href="${esc(service.url)}" target="_blank" rel="noopener">수신 채널 열기</a>` : ''}` : ''}${service.settingsLink ? `<a href="${esc(service.settingsLink.href)}">${esc(service.settingsLink.label)}</a>` : ''}</div>${settings}</div>` : ''}</article>`;
  }
  function paint(): void {
    if (!ctx.isCurrent()) return;
    const managed = report?.services.filter(service => typeof service.enabled === 'boolean') || [];
    const groups = [...new Set(managed.map(service => service.group))];
    const external = report?.services.filter(service => typeof service.enabled !== 'boolean') || [];
    ctx.root.innerHTML = `<div class="dc bn"><header class="bn-head"><div><h2>알림과 서비스</h2><p>${report ? `알림 수신 켜짐 ${managed.filter(service => service.enabled).length}/${managed.length}` : '벼루로 오는 소식 관리'}</p></div><nav aria-label="벼루 관리 바로가기">${report?.channel ? `<a href="${esc(report.channel.url)}" target="_blank" rel="noopener">#${esc(report.channel.name)}</a>` : ''}<a href="#discord-channels">전체 채널</a><button type="button" data-refresh ${busy ? 'disabled' : ''}>새로고침</button></nav></header>
      <p class="bn-notice${busy || failed || changeError ? ' bn-notice-visible' : ''}" role="${failed || changeError ? 'alert' : 'status'}">${esc(notice)}</p>
      ${report ? `<div class="bn-columns" aria-hidden="true"><span>서비스</span><span>실행 상태</span><span>알림 수신</span><span></span></div>${groups.map(group => `<section class="bn-group"><h3>${esc(group)}</h3>${managed.filter(service => service.group === group).map(row).join('')}</section>`).join('')}<details class="bn-external" ${externalOpen ? 'open' : ''}><summary>외부 연결 <span>${external.length}</span><small>외부 서비스에서 직접 보내는 알림</small></summary>${external.map(row).join('')}</details><footer class="bn-note"><span>알림을 꺼도 서비스는 실행됩니다. 중지는 주기 실행을 멈춥니다.</span><span>확인 ${esc(at(report.collectedAt))} · 기록 ${esc(at(report.observationsSince))}부터</span></footer>` : failed ? '<p>상태를 읽지 못했습니다. 새로고침으로 다시 확인해 주세요.</p>' : ''}</div>`;
    ctx.root.querySelector<HTMLButtonElement>('[data-refresh]')?.addEventListener('click', () => { void refresh(); });
    ctx.root.querySelector<HTMLDetailsElement>('.bn-external')?.addEventListener('toggle', event => { externalOpen = (event.currentTarget as HTMLDetailsElement).open; });
    ctx.root.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach(button => button.addEventListener('click', () => {
      inspected = inspected === button.dataset.inspect ? null : button.dataset.inspect!;
      paint();
      ctx.root.querySelector<HTMLButtonElement>(`[data-inspect="${CSS.escape(button.dataset.inspect!)}"]`)?.focus({ preventScroll: true });
    }));
    ctx.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
      const service = report?.services.find(item => item.id === button.dataset.service);
      if (!service || busy || failed) return;
      void change(service.id, button.dataset.action === 'delivery' ? { enabled: !service.enabled } : { running: !service.lifecycle?.running });
    }));
    ctx.root.querySelectorAll<HTMLFormElement>('form[data-service]').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault();
      const service = report?.services.find(item => item.id === form.dataset.service);
      if (!service || !form.reportValidity() || busy || failed) return;
      const values: Record<string, number | string[]> = {};
      const data = new FormData(form);
      for (const field of service.fields || []) values[field.key] = field.type === 'number' ? Number(data.get(field.key)) : data.getAll(field.key).map(String);
      void change(service.id, { values });
    }));
  }
  async function refresh(): Promise<void> {
    changeError = false;
    busy = true; paint();
    try { report = await request(); failed = false; notice = '현재 설정과 서비스 상태를 확인했습니다.'; }
    catch (error) { failed = true; notice = errors[(error as Error).message] || '서비스에 연결하지 못했습니다. 이전 표시가 있으면 마지막 확인 상태입니다.'; }
    finally { busy = false; paint(); }
  }
  async function change(id: string, patch: object): Promise<void> {
    changeError = false;
    busy = true; notice = '변경을 적용하는 중...'; paint();
    let message = '변경을 저장하고 실제 상태를 확인했습니다.';
    try { await request('PATCH', id, patch); }
    catch (error) { changeError = true; message = errors[(error as Error).message] || '변경을 적용하지 못했습니다. 서비스 상태를 다시 확인해 주세요.'; }
    try { report = await request(); failed = false; }
    catch { failed = true; message += ' 현재 상태를 읽지 못해 조작을 잠시 막았습니다.'; }
    busy = false; notice = message; paint();
    const action = 'enabled' in patch ? 'delivery' : 'running' in patch ? 'lifecycle' : '';
    const target = ctx.root.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] ${action ? `[data-action="${action}"]` : 'button[type="submit"]'}`);
    target?.focus({ preventScroll: true });
  }
  paint(); await refresh();
}

dashRegistry().register({ id: 'byeoru', title: '벼루 관리', access: 'read', paths: [], render: renderByeoru });
