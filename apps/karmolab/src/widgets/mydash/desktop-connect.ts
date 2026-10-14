/* PC 앱의 일회성 loopback 연결. 토큰은 URL과 서버에 저장하지 않음 */
const KEYS = [
  'karmolab.mydash.gh', 'karmolab_google_token', 'karmolab_google_refresh',
  'karmolab_planner_events', 'karmolab_planner_tasks', 'toolbox_theme', 'toolbox_home_bg',
];

export function desktopConnect(mount: HTMLElement): boolean {
  const params = new URLSearchParams(location.search);
  const port = params.get('desktop_port') || '';
  const nonce = params.get('desktop_nonce') || '';
  if (!port && !nonce) return false;
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || !/^[a-f0-9]{64}$/.test(nonce)) {
    mount.textContent = 'PC 앱 연결 주소가 잘못되었습니다. 앱에서 다시 연결하세요.';
    return true;
  }
  const box = document.createElement('section');
  box.className = 'desktop-connect';
  const title = document.createElement('h1');
  title.textContent = 'KarmoDash PC 앱 연결';
  const copy = document.createElement('p');
  copy.textContent = '이 브라우저의 Dash 로그인, 구글 연결, 로컬 일정과 할 일을 이 PC의 앱에 복사합니다. 브라우저 원본은 유지됩니다. 앱과 브라우저의 로컬 일정은 이후 각각 저장됩니다.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '이 PC 앱으로 연결 가져오기';
  button.addEventListener('click', () => {
    try {
      if (!localStorage.getItem('karmolab.mydash.gh')) {
        status.textContent = '이 브라우저에서 Dash에 먼저 로그인하세요. 아래 링크에서 로그인한 뒤 이 창으로 돌아오세요.';
        return;
      }
      const data: Record<string, string> = {};
      for (const key of KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `http://127.0.0.1:${port}/${nonce}`;
      const payload = document.createElement('input');
      payload.type = 'hidden';
      payload.name = 'payload';
      payload.value = JSON.stringify(data);
      form.appendChild(payload);
      document.body.appendChild(form);
      button.disabled = true;
      status.textContent = 'PC 앱에 연결 전달 중';
      form.submit();
    } catch {
      button.disabled = false;
      status.textContent = '브라우저 저장소를 읽지 못했습니다. 저장소 설정을 확인하세요.';
    }
  });
  const login = document.createElement('a');
  login.href = '/#planner';
  login.target = '_blank';
  login.rel = 'noopener';
  login.textContent = '브라우저 Dash에서 로그인과 구글 연결';
  const line = document.createElement('p');
  line.appendChild(login);
  box.append(title, copy, button, status, line);
  mount.replaceChildren(box);
  return true;
}
