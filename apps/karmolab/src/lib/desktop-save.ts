/**
 * 데스크톱 앱의 내려받기. 앱이 다운로드 폴더에 쓰고, 알림에 폴더 열기와 파일 열기
 *
 * - WebView2 의 `<a download>` 는 표시 없이 끝남. 사용자가 저장 여부를 모르고 같은 버튼 세 번 (2026-09-25, 같은 PNG 세 벌)
 * - 쓰기는 Tauri `download_save` (본문은 바이트 그대로, 이름은 `x-file-name` 머리글). 경로를 돌려받아 알림에
 * - 옛 앱(명령 없음)이나 거부면 `false` 가 아니라 `fallback` 호출. 부르는 쪽은 한 줄
 * - 정본: apps/karmolab-tauri/src-tauri/src/downloads.rs
 */

type Invoke = (cmd: string, args?: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown>;

function desktopInvoke(): Invoke | null {
  const w = globalThis as unknown as { __KARMOLAB_DESKTOP__?: boolean; __TAURI__?: { core?: { invoke?: Invoke } } };
  return w.__KARMOLAB_DESKTOP__ && typeof w.__TAURI__?.core?.invoke === 'function' ? w.__TAURI__.core.invoke : null;
}

/** 앱이면 앱이 저장하고 `true`. 웹이면 아무것도 안 하고 `false` */
export function saveInDesktop(blob: Blob, filename: string, fallback: () => void): boolean {
  const invoke = desktopInvoke();
  if (!invoke) return false;
  void blob.arrayBuffer()
    .then(buf => invoke('download_save', new Uint8Array(buf), { headers: { 'x-file-name': encodeURIComponent(filename) } }))
    .then(path => showSaved(invoke, String(path)))
    .catch(() => {
      /* 명령이 없는 옛 앱 또는 거부. 예전 길로 내려주고, 적어도 어디 봐야 하는지는 알림 */
      fallback();
      showSaved(invoke, null, filename);
    });
  return true;
}

/** `#statusToast` 에 저장 알림. 경로를 알면 버튼 둘, 모르면 폴더 안내만 */
function showSaved(invoke: Invoke, path: string | null, fallbackName = ''): void {
  const toast = document.getElementById('statusToast') as (HTMLElement & { _toastHide?: number }) | null;
  if (!toast) return;
  const name = path ? path.split(/[\\/]/).pop() || path : fallbackName;
  toast.replaceChildren();
  const msg = document.createElement('span');
  msg.className = 'status-toast-msg';
  msg.textContent = path ? `저장됨  ${name}` : `다운로드 폴더를 확인하세요  ${name}`;
  toast.append(msg);
  if (path) {
    const action = (label: string, cmd: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'status-toast-action';
      b.textContent = label;
      b.onclick = ev => { ev.stopPropagation(); void invoke(cmd, { path }).catch(() => {}); };
      toast.append(b);
    };
    action('폴더 열기', 'download_reveal');
    if (/\.(png|jpe?g|gif|webp|bmp|svg|apng|avif|ico|mp3|wav|ogg|flac|m4a|mp4|webm|mov|txt|md|csv|json|pdf)$/i.test(name)) action('파일 열기', 'download_open');
  }
  toast.className = 'status-toast visible has-detail success';
  toast.onclick = null;
  toast.style.pointerEvents = 'auto';
  clearTimeout(toast._toastHide);
  toast._toastHide = window.setTimeout(() => {
    toast.classList.remove('visible');
    toast.style.pointerEvents = '';
  }, 7000);
}
