/**
 * 플래너 알림 한 줄. dash 장은 KarmoLab 셸 알림 없음, 화면 아래 한 줄 직접
 */
type ToastKind = 'success' | 'error' | 'info';

export function toast(message: string, kind: ToastKind = 'info'): void {
  const el = document.createElement('div');
  el.className = 'pl-toast pl-toast--' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}
