// 런처 화면. 목록 받기, 카드 격자, 옆판 (설치, 업데이트, 실행, 제거). 백엔드는 src-tauri/src/lib.rs
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const gridEl = document.getElementById('grid');
const detailEl = document.getElementById('detail');
const msgEl = document.getElementById('msg');

const KIND = { tauri: '데스크톱 앱', web: '웹', unity: '게임', tool: '도구', bot: '봇' };
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

function badge(app) {
  if (app.soon) return '<span class="badge">준비 중</span>';
  const st = status.get(app.id);
  if (!st) return '';
  if (st.installed && st.latest && newer(st.latest, st.version)) return '<span class="badge up">업데이트</span>';
  if (st.installed) return '<span class="badge ok">설치됨</span>';
  return '';
}

function paintGrid() {
  gridEl.innerHTML = apps
    .map(
      (a) =>
        '<button type="button" class="card' + (current === a.id ? ' on' : '') + '" data-id="' + esc(a.id) + '">' +
        badge(a) + '<b>' + esc(a.name) + '</b><span class="kind">' + esc(KIND[a.kind] || a.kind) + '</span></button>'
    )
    .join('');
}

function paintDetail() {
  const app = apps.find((a) => a.id === current);
  if (!app) {
    detailEl.hidden = true;
    return;
  }
  detailEl.hidden = false;
  const st = status.get(app.id) || {};
  const rows = [];
  if (app.kind !== 'web' && !app.soon) {
    rows.push(['설치', st.installed ? '설치됨' : '안 됨']);
    rows.push(['내 버전', st.version || '-']);
    rows.push(['최신', st.latest || (st.error ? '못 읽음' : '-')]);
    if (st.location) rows.push(['자리', st.location]);
  }
  const acts = [];
  const key = app.install && app.install.registry;
  if (app.soon) acts.push('<p class="note">아직 받을 수 있는 판이 없습니다.</p>');
  else if (app.kind === 'web') acts.push('<button type="button" class="btn primary" data-act="open">브라우저로 열기</button>');
  else {
    if (st.installed) acts.push('<button type="button" class="btn primary" data-act="launch">실행</button>');
    if (st.download && (!st.installed || newer(st.latest, st.version))) {
      acts.push('<button type="button" class="btn' + (st.installed ? '' : ' primary') + '" data-act="install">' + (st.installed ? '업데이트' : '설치') + '</button>');
    }
    if (st.installed && key) acts.push('<button type="button" class="btn" data-act="uninstall">제거</button>');
  }
  const pct = progress.total ? Math.round((progress.got / progress.total) * 100) : 0;
  const bar =
    busy === app.id
      ? '<div class="bar"><i style="width:' + pct + '%"></i></div><p class="note">' +
        esc(progress.phase === 'install' ? '설치 중' : progress.phase === 'uninstall' ? '제거 중' : '받는 중 ' + pct + '%') + '</p>'
      : '';
  detailEl.innerHTML =
    '<h2>' + esc(app.name) + '</h2><p class="sum">' + esc(app.summary) + '</p>' +
    (rows.length ? '<dl class="rows">' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' : '') +
    '<div class="acts">' + acts.join('') + '</div>' + bar +
    (st.error ? '<p class="err">' + esc(st.error) + '</p>' : '');
  detailEl.querySelectorAll('button').forEach((b) => (b.disabled = !!busy));
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
    msgEl.textContent = '목록 ' + (m.updated || '');
  } catch (e) {
    msgEl.textContent = '목록을 못 받음: ' + e;
    apps = [];
  }
  if (!current && apps[0]) current = apps[0].id;
  paintGrid();
  paintDetail();
  await Promise.all(apps.map(refreshStatus));
  paintGrid();
  paintDetail();
}

async function act(kind) {
  const app = apps.find((a) => a.id === current);
  if (!app || busy) return;
  const st = status.get(app.id) || {};
  try {
    if (kind === 'open') return void (await invoke('open_url', { url: app.open }));
    if (kind === 'launch') return void (await invoke('launch_app', { registryKey: app.install.registry }));
    busy = app.id;
    if (kind === 'install') {
      progress = { got: 0, total: 0, phase: 'download' };
      paintDetail();
      await invoke('install_app', { id: app.id, url: st.download, args: (app.install && app.install.args) || [] });
    } else if (kind === 'uninstall') {
      progress = { got: 0, total: 0, phase: 'uninstall' };
      paintDetail();
      await invoke('uninstall_app', { registryKey: app.install.registry });
    }
  } catch (e) {
    status.set(app.id, { ...st, error: String(e) });
  } finally {
    busy = null;
    await refreshStatus(app);
    paintGrid();
    paintDetail();
  }
}

gridEl.addEventListener('click', (e) => {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  current = card.dataset.id;
  paintGrid();
  paintDetail();
});
detailEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) void act(b.dataset.act);
});
document.getElementById('reload').addEventListener('click', () => void load());
void listen('install-progress', (ev) => {
  progress = ev.payload;
  paintDetail();
});
void load();
