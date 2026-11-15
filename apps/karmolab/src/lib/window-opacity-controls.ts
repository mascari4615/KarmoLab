import { invoke, isDesktop, listen } from '../tauri-bridge';

type Target = { id: string; process_id: number; title: string };
type Status = { session_id: string | null; target: Target | null; opacity: number; changed: boolean };

export function buildWindowOpacity(container: HTMLElement, compact = false): () => void {
  if (!document.querySelector('link[data-window-opacity-style]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/apps/karmolab/css/window-opacity.css';
    style.dataset.windowOpacityStyle = '';
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.className = 'window-opacity-controls';
  root.toggleAttribute('data-compact', compact);
  root.innerHTML = `
    <div class="field-group">
      <label class="field-label">연결할 창 <select data-window aria-label="연결할 창"></select></label>
    </div>
    <div class="tool-actions tight">
      <button class="btn btn-primary" data-connect>연결</button>
      <button class="btn btn-ghost" data-refresh>새로고침</button>
      ${compact ? '' : '<button class="btn btn-ghost" data-panel>작은 조절창</button>'}
    </div>
    <div class="field-group">
      <label class="field-label">불투명도 <output data-value>100%</output>
        <input data-opacity type="range" min="20" max="100" step="1" value="100" aria-label="불투명도" aria-valuetext="100%, 불투명">
      </label>
      <span class="tool-hint">20% 많이 비침 / 100% 안 비침</span>
    </div>
    <div class="tool-actions tight"><button class="btn btn-outline" data-restore>원상복구</button></div>
    <p class="tool-status" data-status role="status" aria-live="polite"></p>
    ${compact ? '' : '<p class="tool-hint">게임을 창 모드로 놓고 영상 창을 뒤에 배치하세요. 연결할 때 Windows 관리자 승인이 필요합니다.</p>'}`;
  container.replaceChildren(root);
  const select = root.querySelector<HTMLSelectElement>('[data-window]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-opacity]')!;
  const value = root.querySelector<HTMLOutputElement>('[data-value]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const connect = root.querySelector<HTMLButtonElement>('[data-connect]')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-refresh]')!;
  const restore = root.querySelector<HTMLButtonElement>('[data-restore]')!;
  let disposed = false;
  let busy = false;
  let writing = false;
  let pending: { opacity: number; sessionId: string } | null = null;
  let current: Status = { session_id: null, target: null, opacity: 100, changed: false };
  let revision = 0;
  let fault = false;
  let unlisten = (): void => {};

  const message = (text: string, error = false): void => {
    if (disposed) return;
    status.textContent = text;
    fault = error;
    status.classList.toggle('error', error);
  };
  const showValue = (opacity: number): void => {
    value.value = `${opacity}%`;
    slider.value = String(opacity);
    slider.setAttribute('aria-valuetext', `${opacity}%${opacity === 100 ? ', 불투명' : ''}`);
  };
  const render = (next: Status): void => {
    if (disposed) return;
    current = next;
    if (!writing) showValue(next.opacity);
    slider.disabled = !next.target || busy;
    restore.disabled = !next.target || busy;
    connect.disabled = busy || !select.value;
    if (next.target) {
      if (!Array.from(select.options).some(option => option.value === next.target!.id)) {
        select.add(new Option(next.target.title, next.target.id));
      }
      if (!select.value) select.value = next.target.id;
      message(next.changed ? `${next.target.title}, ${next.opacity}% 적용됨` : `${next.target.title} 연결됨`);
    } else message('게임 창을 선택한 뒤 연결하세요.');
  };
  const fail = (error: unknown): void => {
    showValue(current.opacity);
    message(error instanceof Error ? error.message : String(error), true);
  };
  const resyncAfterFailure = async (error: unknown): Promise<void> => {
    try { render(await invoke<Status>('window_opacity_status')); }
    catch { render({ session_id: null, target: null, opacity: 100, changed: false }); }
    fail(error);
  };
  const loadWindows = async (): Promise<void> => {
    message('창 목록 조회 중');
    refresh.disabled = true;
    try {
      const windows = await invoke<Target[]>('window_opacity_list');
      if (disposed) return;
      const previous = current.target?.id || select.value;
      select.replaceChildren(new Option(windows.length ? '창 선택' : '실행 중인 창 없음', ''));
      for (const target of windows) select.add(new Option(target.title, target.id));
      if (windows.some(target => target.id === previous)) select.value = previous;
      connect.disabled = busy || !select.value;
      if (!windows.length) message('게임을 창 모드로 실행한 뒤 새로고침하세요.');
    } catch (error) { fail(error); }
    finally { refresh.disabled = false; }
  };
  const poll = async (): Promise<void> => {
    if (busy || writing || disposed || fault) return;
    const before = revision;
    try {
      const next = await invoke<Status>('window_opacity_status');
      if (before === revision && !busy && !writing) render(next);
    }
    catch (error) {
      if (before !== revision || busy || writing) return;
      current = { session_id: null, target: null, opacity: 100, changed: false };
      slider.disabled = true; restore.disabled = true;
      fail(error);
    }
  };
  select.addEventListener('change', () => { connect.disabled = busy || !select.value; });
  refresh.addEventListener('click', () => { void loadWindows(); });
  connect.addEventListener('click', async () => {
    if (busy || writing) return;
    revision++; busy = true; connect.disabled = true; restore.disabled = true;
    select.disabled = true; slider.disabled = true; refresh.disabled = true;
    message('Windows 관리자 승인 대기 중');
    try { render(await invoke<Status>('window_opacity_connect', { id: select.value })); }
    catch (error) { await resyncAfterFailure(error); }
    finally { busy = false; renderAfterBusy(); }
  });
  function renderAfterBusy(): void {
    slider.disabled = !current.target || busy;
    restore.disabled = !current.target || busy || writing;
    connect.disabled = !select.value || busy || writing;
    select.disabled = busy || writing;
    refresh.disabled = busy || writing;
  }
  slider.addEventListener('input', () => {
    if (!current.session_id || busy) return;
    revision++;
    pending = { opacity: Number(slider.value), sessionId: current.session_id };
    showValue(pending.opacity);
    if (!writing) void drain();
  });
  async function drain(): Promise<void> {
    message('투명도 적용 중');
    writing = true;
    renderAfterBusy();
    try {
      while (pending !== null && !disposed) {
        const request = pending; pending = null;
        current = await invoke<Status>('window_opacity_set', request);
      }
      writing = false;
      render(current);
    } catch (error) { pending = null; writing = false; await resyncAfterFailure(error); }
    finally { renderAfterBusy(); }
  }
  restore.addEventListener('click', async () => {
    if (busy || writing || !current.session_id) return;
    revision++;
    message('원래 화면으로 복구 중');
    pending = null;
    busy = true; renderAfterBusy();
    try { render(await invoke<Status>('window_opacity_restore', { sessionId: current.session_id })); }
    catch (error) { await resyncAfterFailure(error); }
    finally { busy = false; renderAfterBusy(); }
  });
  root.querySelector('[data-panel]')?.addEventListener('click', () => {
    void invoke('window_opacity_open_panel').catch(fail);
  });
  if (!isDesktop()) {
    for (const input of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) input.disabled = true;
    message('Windows용 KarmoLab 앱에서 사용할 수 있습니다.');
    return () => { disposed = true; };
  }
  slider.disabled = true; restore.disabled = true; connect.disabled = true;
  void loadWindows().then(poll);
  void listen('window-opacity:changed', event => {
    revision++;
    if (!busy && !writing) render(event.payload as Status);
  }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(fail);
  const timer = window.setInterval(() => { void poll(); }, 3000);
  return () => { disposed = true; pending = null; window.clearInterval(timer); unlisten(); };
}
