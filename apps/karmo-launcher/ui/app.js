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
const fmt = (a) => (a.install && a.install.format) || 'nsis';
let current = null;
/** 설치, 업데이트, 제거 중인 앱. id -> { got, total, phase }. 앱마다 따로라 한 앱을 받는 동안 다른 앱을 조작할 수 있음 */
const busy = new Map();

function phaseText(job) {
  const pct = job.total ? Math.round((job.got / job.total) * 100) : 0;
  const words = { verify: '파일 확인 중', wait: '설치 차례 기다리는 중', install: '설치 중', done: '마무리 중', uninstall: '제거 중' };
  return words[job.phase] || '받는 중 ' + pct + '%';
}

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
      const job = busy.get(a.id);
      const tag = job ? '<em class="run" data-job>' + esc(phaseText(job)) + '</em>' : a.soon ? '<em class="soon">준비 중</em>' : st && st.running ? '<em class="run">실행 중</em>' : hasUpdate(st) ? '<em>업데이트</em>' : a.access === 'private' ? '<em class="soon">비공개</em>' : '';
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
    if (fmt(app) === 'local') info.push(['위치', st.installed ? '이 PC' : '이 PC 에 없음']);
    else {
      info.push(['내 버전', st.installed ? st.version || '-' : '설치 안 됨']);
      info.push(['최신', st.latest || (st.error ? '못 읽음' : '-')]);
    }
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
  else if (fmt(app) === 'local') {
    start = st.installed
      ? '<button type="button" class="start" data-act="launch">실행</button>'
      : '<p class="note">이 PC 의 작업 폴더에 없습니다. 오른쪽 위 열쇠에서 작업 폴더를 바꿀 수 있습니다.</p>';
  } else {
    /* 실행 중이면 Steam 처럼 끄기가 주 버튼. 떠 있는 동안 설치 프로그램이 파일을 못 바꾸니 업데이트, 제거는 막음 */
    if (st.running) {
      start = '<button type="button" class="start running" data-act="stop">끄기<small>실행 중</small></button>';
      if (hasUpdate(st)) sub.push('<p class="note">끈 뒤에 업데이트할 수 있습니다</p>');
    } else if (!st.installed && st.download) start = '<button type="button" class="start" data-act="install">설치</button>';
    else if (hasUpdate(st) && st.download)
      start = '<button type="button" class="start" data-act="install">업데이트<small>' + esc(st.version) + ' → ' + esc(st.latest) + '</small></button>';
    else if (st.installed) start = '<button type="button" class="start" data-act="launch">실행</button>';
    if (!st.running && st.installed && hasUpdate(st)) sub.push('<button type="button" data-act="launch">실행</button>');
    if (!st.running && st.installed) sub.push('<button type="button" data-act="uninstall">제거</button>');
  }
  const job = busy.get(app.id);
  const pct = job && job.total ? Math.round((job.got / job.total) * 100) : 0;
  const bar = job ? '<div class="bar"><i style="width:' + pct + '%"></i></div><p class="note">' + esc(phaseText(job)) + '</p>' : '';
  actsEl.innerHTML = bar + (sub.length ? '<div class="sub">' + sub.join('') + '</div>' : '') + start;
  actsEl.querySelectorAll('button').forEach((b) => (b.disabled = !!job));
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
    msgEl.textContent = m.private && m.private.state === 'error' ? '비공개 목록을 못 받음: ' + m.private.error : '';
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
  if (!app || busy.has(app.id)) return;
  /* 런처 업데이트는 끝나면 다시 켜지므로 새 설치를 시작하지 않음 */
  if (selfBusy && (kind === 'install' || kind === 'uninstall')) {
    msgEl.textContent = '런처 업데이트 중. 다시 켜진 뒤에 해 주세요';
    return;
  }
  const st = status.get(app.id) || {};
  try {
    if (kind === 'open') return void (await invoke('open_url', { url: app.open }));
    if (kind === 'launch') {
      await invoke('launch_app', { app });
      /* 창이 뜨기까지 잠깐. 바로 한 번, 조금 뒤 한 번 다시 잼 */
      window.setTimeout(() => void pollRunning(), 1500);
      return;
    }
    if (kind === 'stop') {
      /* 누르는 즉시 꺼진 것으로 그림. stop_app 은 꺼진 뒤에 돌아오고, 그때 실제 상태로 다시 잼 (사용자 "끄기가 바로바로") */
      status.set(app.id, { ...st, running: false });
      paint();
      await invoke('stop_app', { app });
      await pollRunning();
      return;
    }
    if (kind === 'install') {
      busy.set(app.id, { got: 0, total: 0, phase: 'download' });
      paint();
      await invoke('install_app', { app, url: st.download, version: st.latest || '', signature: st.signature || '', sha256: st.sha256 || '' });
    } else if (kind === 'uninstall') {
      busy.set(app.id, { got: 0, total: 0, phase: 'uninstall' });
      paint();
      await invoke('uninstall_app', { app });
    }
  } catch (e) {
    status.set(app.id, { ...st, error: String(e) });
  } finally {
    busy.delete(app.id);
    await refreshStatus(app);
    paint();
  }
}

/** 설치된 앱들의 실행 여부만 다시. 3초마다, 창이 보일 때만 (최신 판은 다시 안 받음) */
async function pollRunning() {
  let changed = false;
  for (const app of apps) {
    const st = status.get(app.id);
    if (!st || !st.installed || fmt(app) === 'local') continue;
    try {
      const now = await invoke('running_status', { app });
      if (now !== st.running) {
        st.running = now;
        changed = true;
      }
    } catch {
      /* 다음 차례에 다시 */
    }
  }
  if (changed) paint();
}
/* 1초마다 (3초는 켜고 끈 뒤 표시가 늦다, 사용자 2026-09-25 "기다리는 텀이 너무 길지 않나") */
window.setInterval(() => {
  if (!document.hidden) void pollRunning();
}, 1000);

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

/* GitHub 로그인과 작업 폴더. 토큰은 백엔드가 자격 증명 관리자에 보관하고 화면은 이름만 받음 */
const keysEl = $('keys');
const ghStateEl = $('ghState');
async function paintKeys() {
  try {
    const login = await invoke('github_status');
    ghStateEl.textContent = login ? '로그인: ' + login + '. 비공개 항목이 목록에 나옵니다' : '로그인 안 됨. 공개 항목만 보입니다';
  } catch (e) {
    ghStateEl.textContent = '토큰 확인 실패: ' + e;
  }
  try {
    $('ws').value = (await invoke('get_settings')).workspace || '';
  } catch {
    /* 기본값 그대로 */
  }
}
async function keyAction(fn) {
  ghStateEl.textContent = '확인 중';
  try {
    await fn();
  } catch (e) {
    ghStateEl.textContent = String(e);
    return;
  }
  $('ghToken').value = '';
  await paintKeys();
  await load();
}
/* 설정 모달. 톱니로 열고, 닫기 버튼, 바깥 누르기, Esc 로 닫음 */
function openKeys() {
  keysEl.hidden = false;
  void paintKeys();
}
const closeKeys = () => (keysEl.hidden = true);
$('keyBtn').addEventListener('click', () => (keysEl.hidden ? openKeys() : closeKeys()));
$('keysClose').addEventListener('click', closeKeys);
keysEl.addEventListener('mousedown', (e) => {
  if (e.target === keysEl) closeKeys();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !keysEl.hidden) closeKeys();
});
$('ghSave').addEventListener('click', () => void keyAction(() => invoke('github_set_token', { token: $('ghToken').value })));
$('ghGit').addEventListener('click', () => void keyAction(() => invoke('github_use_git_login')));
$('ghClear').addEventListener('click', () => void keyAction(() => invoke('github_clear')));
$('wsSave').addEventListener('click', () => void keyAction(() => invoke('set_workspace', { path: $('ws').value })));
$('min').addEventListener('click', () => void appWindow.minimize());
/* 닫기는 트레이로 (Steam 처럼). 끝내기는 트레이 메뉴 */
$('close').addEventListener('click', () => void appWindow.hide());
/* 판 안 내용 배율. 1292x772 (기본 창 1340x820 에서 여백 24px 씩 뺀 판) 기준으로 그린 배치를
   창 크기에 맞춰 통째로 줄이고 키움. 기준에서도 0.88 배 (사용자 2026-11-03 "UI 들이 너무 크다") */
const stageEl = $('stage');
function fitStage() {
  const w = Math.max(1, window.innerWidth - 48);
  const h = Math.max(1, window.innerHeight - 48);
  const z = Math.min(1.2, Math.max(0.45, Math.min(w / 1292, h / 772) * 0.88));
  stageEl.style.setProperty('--z', z.toFixed(3));
}
window.addEventListener('resize', fitStage);
fitStage();

/* 크기 조절. 틀 없는 투명 창이라 손잡이에서 OS 크기 조절을 직접 시작 */
document.querySelectorAll('[data-rz]').forEach((el) => {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    void appWindow.startResizeDragging(el.dataset.rz);
  });
});

/* 런처 자신의 업데이트. 새 판이 있으면 묻지 않고 받아 설치하고 다시 켬 (Steam 처럼, 사용자 2026-09-25 "런처는 그래야지").
   버튼으로만 받게 했더니 0.1.3 이 그대로 남아 끄기 수정이 안 들어왔다. 켜자마자 한 번, 트레이에 오래 있으니 30분마다.
   앱을 설치하는 중이면 다시 켜면 끊기니 다음 차례로 */
const selfEl = $('selfup');
const SELF_EVERY_MS = 30 * 60 * 1000;
let selfBusy = false;
async function installSelf() {
  selfBusy = true;
  selfEl.hidden = false;
  selfEl.disabled = true;
  selfEl.textContent = '런처 받는 중';
  try {
    await invoke('self_update_install');
  } catch (e) {
    selfBusy = false;
    selfEl.disabled = false;
    selfEl.textContent = '런처 업데이트 실패: ' + e;
  }
}
async function checkSelf() {
  if (selfBusy) return;
  try {
    const v = await invoke('self_update_check');
    if (!v) return;
    if (busy.size) {
      window.setTimeout(() => void checkSelf(), 60 * 1000);
      return;
    }
    await installSelf();
  } catch {
    /* 오프라인이거나 아직 릴리스가 없음. 다음 차례에 다시 */
  }
}
selfEl.addEventListener('click', () => {
  if (busy.size) {
    selfEl.textContent = '앱 작업이 끝난 뒤에 눌러 주세요';
    return;
  }
  void installSelf();
});
window.setInterval(() => void checkSelf(), SELF_EVERY_MS);
void listen('self-update-progress', (ev) => {
  const [got, total] = ev.payload;
  if (total) selfEl.textContent = '런처 받는 중 ' + Math.round((got / total) * 100) + '%';
});
void checkSelf();
void window.__TAURI__.app.getVersion().then((v) => ($('ver').textContent = 'v' + v));
void listen('install-progress', (ev) => {
  const job = ev.payload;
  if (!busy.has(job.id)) return;
  busy.set(job.id, job);
  /* 목록은 글자만 바꿈. 통째로 다시 그리면 누르는 사이 단추가 바뀌어 클릭이 사라짐 */
  const tag = listEl.querySelector('[data-id="' + CSS.escape(job.id) + '"] [data-job]');
  if (tag) tag.textContent = phaseText(job);
  if (job.id === current) paintMain();
});
void load();
