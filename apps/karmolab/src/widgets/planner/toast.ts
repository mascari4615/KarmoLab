/**
 * 플래너 알림 한 줄. lab 셸에는 `Toolbox.showToast` 가 있지만 dash 장에는 없다 (2026-09-23 플래너를 dash 로).
 * 전역 `Toolbox` 를 이름으로 부르면 없는 장에서 ReferenceError 라 window 에서 찾는다. 없으면 화면 아래 한 줄
 */
type ToastKind = 'success' | 'error' | 'info';

export function toast(message: string, kind: ToastKind = 'info'): void {
  const tb = (window as unknown as { Toolbox?: { showToast?: (m: string, k: string) => void } }).Toolbox;
  if (tb && tb.showToast) {
    tb.showToast(message, kind);
    return;
  }
  const el = document.createElement('div');
  el.className = 'pl-toast pl-toast--' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}
