// 런처 화면 (시안 L3). 목록 받기, 왼쪽 목록, 고른 앱의 그림과 제목, 버전, 릴리스, 시작 버튼.
// 백엔드는 src-tauri/src/lib.rs. 창은 투명이고 틀이 없어 제목 줄의 끌기, 최소화, 닫기를 여기서
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const headEl = $('head');
const relEl = $('rel');
const actsEl = $('acts');
const heroEl = $('hero');
const msgEl = $('msg');

const ICON = { tauri: 'tool', web: 'dash', unity: 'play', tool: 'tool', bot: 'tool' };
let apps = [];
const status = new Map();
let current = null;
let busy = null;
let progress = { got: 0, total: 0, phase: '' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 버전 비교. 점 단위 숫자만 (0.1.112 < 0.1.116) */
function newer(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

const hasUpdate = (st) => !!(st && st.installed && st.latest && newer(st.latest, st.version));

function paintList() {
  listEl.innerHTML = apps
    .map((a) => {
      const st = status.get(a.id);
      const tag = a.soon ? '<em class="soon">준비 중</em>' : st && st.running ? '<em class="run">실행 중</em>' : hasUpdate(st) ? '<em>업데이트</em>' : '';
      const icon = (a.art && a.art.icon) || ICON[a.kind] || 'tool';
      return (
        '<button type="button" class="li' + (current === a.id ? ' on' : '') + '" data-id="' + esc(a.id) + '">' +
        '<img class="ic" src="img/' + esc(icon) + '.png" alt=""><span>' + esc(a.name) + '</span>' + tag + '</button>'
      );
    })
    .join('');
}

function paintMain() {
  const app = apps.find((a) => a.id === current);
  if (!app) {
    headEl.innerHTML = '';
    actsEl.innerHTML = '';
    relEl.hidden = true;
    return;
  }
  const bg = (app.art && app.art.bg) || 'sky-village';
  heroEl.style.backgroundImage = 'url(img/' + encodeURIComponent(bg) + '.webp)';
  const st = status.get(app.id) || {};
  const info = [];
  if (app.kind !== 'web' && !app.soon) {
    info.push(['내 버전', st.installed ? st.version || '-' : '설치 안 됨']);
    info.push(['최신', st.latest || (st.error ? '못 읽음' : '-')]);
  }
  headEl.innerHTML =
    '<h1>' + esc(app.name) + '</h1><p>' + esc(app.summary) + '</p>' +
    (info.length ? '<dl class="info">' + info.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd><b>' + esc(v) + '</b></dd>').join('') + '</dl>' : '') +
    (st.error ? '<p class="err">' + esc(st.error) + '</p>' : '');

  if (st.latest) {
    relEl.hidden = false;
    const day = st.pub_date ? String(st.pub_date).slice(5, 10).replace('-', '.') : '';
    relEl.innerHTML = '<div class="t">릴리스</div><div class="row"><span>' + esc(app.name + ' v' + st.latest) + '</span><span>' + esc(day) + '</span></div>';
  } else relEl.hidden = true;

  const sub = [];
  let start = '';
  if (app.soon) start = '<p class="note">아직 받을 수 있는 판이 없습니다.</p>';
  else if (app.kind === 'web') start = '<button type="button" class="start" data-act="open">브라우저로 열기</button>';
  else {
    const key = app.install && app.install.registry;
    /* 실행 중이면 Steam 처럼 끄기가 주 버튼. 떠 있는 동안 설치 프로그램이 파일을 못 바꾸니 업데이트, 제거는 막음 */
    if (st.running) {
      start = '<button type="button" class="start running" data-act="stop">끄기<small>실행 중</small></button>';
      if (hasUpdate(st)) sub.push('<p class="note">끈 뒤에 업데이트할 수 있습니다</p>');
    } else if (!st.installed && st.download) start = '<button type="button" class="start" data-act="install">설치</button>';
    else if (hasUpdate(st) && st.download)
      start = '<button type="button" class="start" data-act="install">업데이트<small>' + esc(st.version) + ' → ' + esc(st.latest) + '</small></button>';
    else if (st.installed) start = '<button type="button" class="start" data-act="launch">실행</button>';
    if (!st.running && st.installed && hasUpdate(st)) sub.push('<button type="button" data-act="launch">실행</button>');
    if (!st.running && st.installed && key) sub.push('<button type="button" data-act="uninstall">제거</button>');
  }
  const pct = progress.total ? Math.round((progress.got / progress.total) * 100) : 0;
  const bar =
    busy === app.id
      ? '<div class="bar"><i style="width:' + pct + '%"></i></div><p class="note">' +
        esc(progress.phase === 'install' ? '설치 중' : progress.phase === 'uninstall' ? '제거 중' : '받는 중 ' + pct + '%') + '</p>'
      : '';
  actsEl.innerHTML = bar + (sub.length ? '<div class="sub">' + sub.join('') + '</div>' : '') + start;
  actsEl.querySelectorAll('button').forEach((b) => (b.disabled = !!busy));
}

function paint() {
  paintList();
  paintMain();
}

async function refreshStatus(app) {
  if (app.soon || app.kind === 'web') return;
  try {
    status.set(app.id, await invoke('app_status', { app }));
  } catch (e) {
    status.set(app.id, { error: String(e) });
  }
}

async function load() {
  msgEl.textContent = '목록 받는 중';
  try {
    const m = await invoke('fetch_manifest');
    apps = Array.isArray(m.apps) ? m.apps : [];
    msgEl.textContent = '';
  } catch (e) {
    msgEl.textContent = '목록을 못 받음: ' + e;
    apps = [];
  }
  if (!current && apps[0]) current = apps[0].id;
  paint();
  await Promise.all(apps.map(refreshStatus));
  paint();
}

async function act(kind) {
  const app = apps.find((a) => a.id === current);
  if (!app || busy) return;
  const st = status.get(app.id) || {};
  try {
    if (kind === 'open') return void (await invoke('open_url', { url: app.open }));
    if (kind === 'launch') {
      await invoke('launch_app', { registryKey: app.install.registry });
      /* 창이 뜨기까지 잠깐. 바로 한 번, 조금 뒤 한 번 다시 잼 */
      window.setTimeout(() => void pollRunning(), 1500);
      return;
    }
    if (kind === 'stop') {
      await invoke('stop_app', { registryKey: app.install.registry });
      window.setTimeout(() => void pollRunning(), 1500);
      return;
    }
    busy = app.id;
    if (kind === 'install') {
      progress = { got: 0, total: 0, phase: 'download' };
      paintMain();
      await invoke('install_app', { id: app.id, url: st.download, args: (app.install && app.install.args) || [] });
    } else if (kind === 'uninstall') {
      progress = { got: 0, total: 0, phase: 'uninstall' };
      paintMain();
      await invoke('uninstall_app', { registryKey: app.install.registry });
    }
  } catch (e) {
    status.set(app.id, { ...st, error: String(e) });
  } finally {
    busy = null;
    await refreshStatus(app);
    paint();
  }
}

/** 설치된 앱들의 실행 여부만 다시. 3초마다, 창이 보일 때만 (최신 판은 다시 안 받음) */
async function pollRunning() {
  let changed = false;
  for (const app of apps) {
    const st = status.get(app.id);
    const key = app.install && app.install.registry;
    if (!st || !st.installed || !key) continue;
    try {
      const now = await invoke('running_status', { registryKey: key });
      if (now !== st.running) {
        st.running = now;
        changed = true;
      }
    } catch {
      /* 다음 차례에 다시 */
    }
  }
  if (changed && !busy) paint();
}
window.setInterval(() => {
  if (!document.hidden) void pollRunning();
}, 3000);

listEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  current = b.dataset.id;
  paint();
});
actsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) void act(b.dataset.act);
});
$('reload').addEventListener('click', () => void load());
$('min').addEventListener('click', () => void appWindow.minimize());
/* 닫기는 트레이로 (Steam 처럼). 끝내기는 트레이 메뉴 */
$('close').addEventListener('click', () => void appWindow.hide());

/* 런처 자신의 업데이트. 켜진 뒤 한 번 묻고, 새 판이면 제목 줄 아래 버튼 하나 */
const selfEl = $('selfup');
async function checkSelf() {
  try {
    const v = await invoke('self_update_check');
    if (!v) return;
    selfEl.hidden = false;
    selfEl.textContent = '런처 새 판 ' + v + ' 받기';
  } catch {
    /* 오프라인이거나 아직 릴리스가 없음. 조용히 넘어감 */
  }
}
selfEl.addEventListener('click', async () => {
  selfEl.disabled = true;
  selfEl.textContent = '런처 받는 중';
  try {
    await invoke('self_update_install');
  } catch (e) {
    selfEl.disabled = false;
    selfEl.textContent = '런처 업데이트 실패: ' + e;
  }
});
void listen('self-update-progress', (ev) => {
  const [got, total] = ev.payload;
  if (total) selfEl.textContent = '런처 받는 중 ' + Math.round((got / total) * 100) + '%';
});
window.setTimeout(() => void checkSelf(), 3000);
void listen('install-progress', (ev) => {
  progress = ev.payload;
  paintMain();
});
void load();
