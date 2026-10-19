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
  function fieldHtml(service: Service, field: Field): string {
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
    const details = service.fields?.length || service.settingsLink
      ? `<details class="bn-settings"><summary>설정</summary>${service.fields?.length ? `<form data-service="${esc(service.id)}">${service.fields.map(field => fieldHtml(service, field)).join('')}<button type="submit" ${disabled}>설정 저장</button><span class="bn-save-note">실행 중이면 저장한 설정으로 다시 시작</span></form>` : ''}${service.settingsLink ? `<a href="${esc(service.settingsLink.href)}">${esc(service.settingsLink.label)}</a>` : ''}</details>` : '';
    return `<article class="bn-row" data-row="${esc(service.id)}"><div class="bn-source"><h4>${esc(service.title)}</h4><p>${esc(service.description)}</p><small>${esc(activity)}</small>${observation?.failed ? `<small class="bn-warning">전송 실패 ${observation.failed}회, 최근 ${esc(at(observation.lastErrorAt))}</small>` : ''}${details}</div>
      <div class="bn-delivery"><span class="bn-mobile-label">알림</span>${typeof service.enabled === 'boolean' ? `<button type="button" role="switch" aria-label="${esc(service.title)} 알림 받기" aria-checked="${service.enabled ? 'true' : 'false'}" data-action="delivery" data-service="${esc(service.id)}" ${disabled}>${service.enabled ? '받는 중' : '받지 않음'}</button>` : '<span class="bn-state">외부에서 직접 수신</span>'}</div>
      <div class="bn-runtime"><span class="bn-mobile-label">서비스</span>${life ? `<span class="bn-state">${life.running === null ? '상태 확인 필요' : life.running ? '실행 중' : '중지'}${life.error ? ', 조작 확인 필요' : ''}</span><button type="button" data-action="lifecycle" data-service="${esc(service.id)}" ${disabled || life.running === null ? 'disabled' : ''}>${life.running ? '중지' : '시작'}</button>${life.detail ? `<small>${esc(life.detail)}</small>` : ''}` : service.kind === 'external' ? `<span class="bn-state">${service.connected ? '연결됨' : '연결 확인 필요'}</span><small>실행과 중지는 원래 서비스에서 관리</small>${service.url ? `<a href="${esc(service.url)}" target="_blank" rel="noopener">수신 채널 열기</a>` : ''}` : '<span class="bn-state">주기 실행 제어 없음</span>'}</div></article>`;
  }
  function paint(): void {
    if (!ctx.isCurrent()) return;
    const expanded = new Set([...ctx.root.querySelectorAll<HTMLDetailsElement>('[data-row] details[open]')].map(details => details.closest<HTMLElement>('[data-row]')?.dataset.row));
    const groups = [...new Set(report?.services.map(service => service.group) || [])];
    const managed = report?.services.filter(service => typeof service.enabled === 'boolean') || [];
    ctx.root.innerHTML = `<div class="dc bn"><header class="bn-head"><div><p class="bn-eyebrow">대화와 알림</p><h2>벼루 관리</h2><p>무엇을 받을지, 어떤 서비스를 실행할지 한곳에서.</p></div><nav aria-label="벼루 관리 바로가기">${report?.channel ? `<a href="${esc(report.channel.url)}" target="_blank" rel="noopener">#${esc(report.channel.name)} 열기</a>` : ''}<a href="#discord-channels">전체 채널 목록</a><button type="button" data-refresh ${busy ? 'disabled' : ''}>새로고침</button></nav></header>
      <p class="bn-notice" role="${failed ? 'alert' : 'status'}">${esc(notice)}</p>
      ${report ? `<p class="bn-summary">알림 ${managed.filter(service => service.enabled).length}/${managed.length}개 받는 중 <span>확인 ${esc(at(report.collectedAt))}</span></p><div class="bn-columns" aria-hidden="true"><span>알림과 서비스</span><span>알림 수신</span><span>실행 상태</span></div>${groups.map(group => `<section class="bn-group"><h3>${esc(group)}</h3>${report!.services.filter(service => service.group === group).map(row).join('')}</section>`).join('')}<p class="bn-note">알림을 끄면 이 채널로 보내지 않습니다. 서비스 중지는 주기 실행을 멈춥니다. 외부 연결의 실행 상태는 원래 서비스에서 확인해 주세요.<br>전송 기록은 ${esc(at(report.observationsSince))}부터 이번 봇 실행에서 관측한 값입니다.</p>` : failed ? '<p>상태를 읽지 못했습니다. 새로고침으로 다시 확인해 주세요.</p>' : ''}</div>`;
    ctx.root.querySelector<HTMLButtonElement>('[data-refresh]')?.addEventListener('click', () => { void refresh(); });
    ctx.root.querySelectorAll<HTMLDetailsElement>('[data-row] details').forEach(details => { details.open = expanded.has(details.closest<HTMLElement>('[data-row]')?.dataset.row); });
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
    busy = true; paint();
    try { report = await request(); failed = false; notice = '현재 설정과 서비스 상태를 확인했습니다.'; }
    catch (error) { failed = true; notice = errors[(error as Error).message] || '서비스에 연결하지 못했습니다. 이전 표시가 있으면 마지막 확인 상태입니다.'; }
    finally { busy = false; paint(); }
  }
  async function change(id: string, patch: object): Promise<void> {
    busy = true; notice = '변경을 적용하는 중...'; paint();
    let message = '변경을 저장하고 실제 상태를 확인했습니다.';
    try { await request('PATCH', id, patch); }
    catch (error) { message = errors[(error as Error).message] || '변경을 적용하지 못했습니다. 서비스 상태를 다시 확인해 주세요.'; }
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
