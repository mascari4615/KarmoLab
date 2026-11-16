// 런처 화면 (시안 L3). 목록 받기, 왼쪽 목록, 고른 앱의 그림과 제목, 버전, 릴리스, 시작 버튼.
// 백엔드는 src-tauri/src/lib.rs, 판단은 updates.js. 창은 투명이고 틀이 없어 제목 줄의 끌기, 최소화, 닫기를 여기서
import { BLOCK_TEXT, MODES, accentOf, appPref, autoPlan, castLine, castState, fmtAgo, fmtDuration, hasUpdate, isPaused, logoSource, mascotSource, mergeSync, modeOf, nextPose, parseArgs, remoteOf, tickSeconds, trayApps, visibleApps } from './updates.js';

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
const dlBtn = $('dlBtn');

/** 화면 안 알림. 위 작은 글만으로는 실패와 저장 결과를 못 알아챔 (사용자 2026-11-16 "피드백이 없어").
 *  kind: ok, err, info. 오류는 오래 두고, 누르면 닫힘 */
function toast(text, kind = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  /* "제목: 이유" 는 두 줄로 */
  const cut = text.indexOf(': ');
  const tt = document.createElement('div');
  tt.className = 'tt';
  tt.textContent = cut > 0 ? text.slice(0, cut) : text;
  const wrap = document.createElement('div');
  wrap.append(tt);
  if (cut > 0) {
    const tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = text.slice(cut + 2);
    wrap.append(tx);
  }
  const x = document.createElement('span');
  x.className = 'x';
  x.textContent = '\u2715';
  el.append(wrap, x);
  el.addEventListener('click', () => el.remove());
  box.append(el);
  placeToasts();
  /* 자리가 제목 아래 한 칸뿐이라 하나만. 새 알림이 옛 알림을 바꿈 */
  while (box.children.length > 1) box.firstElementChild.remove();
  window.setTimeout(() => el.remove(), kind === 'err' ? 9000 : 4000);
}

/** 업데이터 플러그인이 주는 영어 오류를 읽히게. 백엔드 받기 오류는 이미 한국어 */
function friendly(e) {
  const t = String(e);
  const m = t.match(/error sending request for url \(https?:\/\/([^/)]+)/);
  return m ? m[1] + ' 에 연결 못 함. 인터넷 연결을 확인하고 잠시 뒤 다시' : t;
}

const ICON = { tauri: 'tool', web: 'dash', unity: 'play', tool: 'tool', bot: 'tool' };
const CHECK_EVERY_MS = 30 * 60 * 1000;
let apps = [];
const status = new Map();
const fmt = (a) => (a.install && a.install.format) || 'nsis';
const canDownload = (a) => !a.soon && a.kind !== 'web' && fmt(a) !== 'local';
let current = null;
const view = { q: '', filter: 'all', sort: 'list' };

/** 설치, 업데이트, 제거 중인 앱. id -> { got, total, phase, auto, thenLaunch }. 앱마다 따로라 한 앱을 받는 동안 다른 앱을 조작할 수 있음.
    손으로 누른 것은 바로 시작 (큰 WM zip 이 나머지를 막지 않게, 2026-11-04 앱별 동시 작업).
    자동 업데이트만 줄을 서서 AUTO_AT_ONCE 개씩 (Hub Concurrent downloads) */
const busy = new Map();
const queue = [];
const AUTO_AT_ONCE = 2;
let selfBusy = false;
let localStopArmed = null;
let blocked = {};
const failures = {};
let lastCheck = 0;

/* 설정. 저장은 settings.json 의 prefs 한 칸 */
let prefs = { autoUpdate: true, closeToTray: true, theme: 'system', apps: {}, log: [] };
let autostart = false;
let saveTimer = 0;
function savePrefs() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void invoke('save_prefs', { prefs }).catch((e) => (msgEl.textContent = '설정 저장 실패: ' + e)), 400);
}
function setAppPref(id, patch) {
  prefs.apps = prefs.apps || {};
  prefs.apps[id] = { ...prefs.apps[id], ...patch };
  savePrefs();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pctOf = (job) => (job && job.total ? Math.round((job.got / job.total) * 100) : 0);
function phaseText(job) {
  const words = { verify: '파일 확인 중', wait: '설치 차례 기다리는 중', install: '설치 중', done: '마무리 중', uninstall: '제거 중' };
  return words[job.phase] || '받는 중 ' + pctOf(job) + '%';
}
const isQueued = (id) => queue.some((j) => j.id === id);

function paintList() {
  const rows = visibleApps(apps, status, prefs, view);
  listEl.innerHTML = rows.length
    ? rows
        .map((a) => {
          const st = status.get(a.id);
          const tag =
            busy.has(a.id) ? '<em class="run" data-job>' + esc(phaseText(busy.get(a.id))) + '</em>'
            : a.soon ? '<em class="soon">준비 중</em>'
            : isQueued(a.id) ? '<em class="soon">대기</em>'
            : st && st.running ? '<em class="run">실행 중</em>'
            : hasUpdate(st) ? '<em>업데이트</em>'
            : a.access === 'private' ? '<em class="soon">비공개</em>'
            : '';
          const icon = (a.art && a.art.icon) || ICON[a.kind] || 'tool';
          const logo = logoUrl(a);
          const accent = accentOf(a);
          const star = appPref(prefs, a.id).favorite ? '<b class="star" title="즐겨찾기">&#9733;</b>' : '';
          return (
            '<button type="button" class="li' + (accent ? ' brand' : '') + (current === a.id ? ' on' : '') + '" data-id="' + esc(a.id) + '" title="' + esc(a.name + (tag ? ', ' + tag.replace(/<[^>]+>/g, '') : '')) + '"' + (accent ? ' style="--c:' + accent + '"' : '') + '>' +
            (logo ? '<i class="logo" style="' + esc('-webkit-mask-image:url("' + logo + '");mask-image:url("' + logo + '")') + '"></i>' : '<img class="ic" src="img/' + esc(icon) + '.png" alt="">') + '<span>' + esc(a.name) + '</span>' + star + tag + '</button>'
          );
        })
        .join('')
    : '<p class="empty">없음</p>';
  paintDlBtn();
}

function paintDlBtn() {
  const jobs = [...busy.values()];
  const waiting = queue.length;
  const now = jobs.length === 1 ? phaseText(jobs[0]) : jobs.length ? '작업 ' + jobs.length + '개' : '';
  dlBtn.textContent = now ? now + (waiting ? ', 대기 ' + waiting : '') : waiting ? '다운로드 대기 ' + waiting : '다운로드';
  dlBtn.classList.toggle('on', !!jobs.length || !!waiting);
  /* 접힌 목록 (72px) 에는 짧게 */
  dlBtn.dataset.short = jobs.length === 1 && jobs[0].phase === 'download' ? pctOf(jobs[0]) + '%' : jobs.length ? '작업 ' + jobs.length : waiting ? '대기 ' + waiting : '\u21e9';
  dlBtn.title = dlBtn.textContent;
}

/* 마스코트. 고른 앱의 그림으로 바꿈. 그림이 없거나 못 읽으면 아무도 안 섬. 빠르게 넘기면 마지막 앱만 남김 */
const mascotEl = $('mascot');
const privateImages = new Map();
const mascotHitEl = $('mascotHit');
let mascotKey = '';
let mascotTurn = 0;
function setFigure(on) {
  mascotEl.hidden = !on;
  mascotHitEl.hidden = !on;
  document.documentElement.dataset.figure = on ? 'on' : 'none';
}
setFigure(false);
function showMascot(url, turn) {
  const next = new Image();
  next.onload = () => {
    if (turn !== mascotTurn) return;
    mascotEl.style.opacity = '0';
    window.setTimeout(() => {
      if (turn !== mascotTurn) return;
      mascotEl.src = url;
      setFigure(true);
      mascotEl.style.opacity = '1';
      mascotEl.classList.remove('enter');
      void mascotEl.offsetWidth;
      mascotEl.classList.add('enter');
    }, 120);
  };
  next.onerror = () => {
    if (turn === mascotTurn) setFigure(false);
  };
  next.src = url;
}
/* MDD. 끄면 캐릭터 없는 일반 런처가 그대로 남음 (rules/mdd.md 계약). 대사와 표정은 목록 데이터에서 옴, 정본 characters/mascot-* */
const mddOn = () => prefs.mdd !== false;
const sayEl = $('say');
const fresh = new Map();
let sayKey = '';
let sayTurn = 0;
const POKE_MS = 6000;
let poke = null;
let pokeTimer = 0;
function applyMdd() {
  document.documentElement.dataset.mdd = mddOn() ? 'on' : 'off';
}
/* 대표색은 앱 정체라 캐릭터를 꺼도 유지 */
function applyAccent(app) {
  const art = (app && app.art) || {};
  const accent = accentOf(app);
  const root = document.documentElement.style;
  if (accent) {
    root.setProperty('--acc', accent);
    root.setProperty('--acc-ink', art.accent_ink || '#ffffff');
  } else {
    root.removeProperty('--acc');
    root.removeProperty('--acc-ink');
  }
}
function paintSay(app, state, st) {
  const line = mddOn() ? castLine(app, state, sayTurn, st) : '';
  sayEl.hidden = !line;
  if (!line) {
    sayKey = '';
    return;
  }
  const key = app.id + ':' + state + ':' + sayTurn + ':' + line;
  if (key === sayKey) return;
  sayKey = key;
  sayEl.innerHTML = '<b>' + esc(app.art.cast.name) + '</b><span>' + esc(line) + '</span>';
}
/** 로고 주소. 비공개 그림은 받은 뒤 다시 그림 */
const logoPending = new Set();
function logoUrl(app) {
  const src = logoSource(app);
  if (!src) return '';
  if (src.url) return src.url;
  if (privateImages.has(src.private)) return privateImages.get(src.private);
  if (!logoPending.has(src.private)) {
    logoPending.add(src.private);
    void invoke('private_image', { path: src.private })
      .then((url) => {
        privateImages.set(src.private, url);
        paintList();
      })
      .catch(() => {});
  }
  return '';
}
async function paintMascot(app, state) {
  const src = mascotSource(app, state);
  const key = src ? src.private || src.url : '';
  if (key === mascotKey) return;
  mascotKey = key;
  const turn = ++mascotTurn;
  if (!src) {
    setFigure(false);
    return;
  }
  let url = src.url;
  if (src.private) {
    url = privateImages.get(key);
    if (!url) {
      try {
        url = await invoke('private_image', { path: key });
        privateImages.set(key, url);
      } catch {
        if (turn === mascotTurn) setFigure(false);
        return;
      }
    }
    if (turn !== mascotTurn) return;
  }
  showMascot(url, turn);
}

let menuOpen = false;
/** 받는 중 숫자만 바꿈. 단추는 그대로 둬서 누르는 사이 사라지지 않게 */
function paintProgress(job) {
  const bar = actsEl.querySelector('.top i');
  if (bar) bar.style.width = pctOf(job) + '%';
  const small = actsEl.querySelector('.start small');
  if (small) small.textContent = small.textContent.replace(/\d+%$/, pctOf(job) + '%');
  const kv = actsEl.querySelectorAll('.stats .kv b');
  const vals = [job.total ? sizeText(job.got || 0) + ' / ' + sizeText(job.total) : pctOf(job) + '%'];
  if (job.speed > 0) vals.push(sizeText(job.speed) + '/s');
  if (job.speed > 0 && job.total) vals.push(fmtLeft((job.total - (job.got || 0)) / job.speed));
  if (kv.length !== vals.length) return paintMain();
  kv.forEach((b, i) => (b.textContent = vals[i]));
}
const relTab = new Map();
const fmtLeft = (sec) => (!isFinite(sec) || sec < 0 ? '-' : sec < 60 ? Math.ceil(sec) + '초' : sec < 3600 ? Math.ceil(sec / 60) + '분' : (sec / 3600).toFixed(1) + '시간');
const FORMAT_TEXT = { nsis: '설치 프로그램', zip: '압축 (런처 폴더)', local: '이 PC 작업 폴더' };

/** 아래 칸. 탭: 릴리스, 정보, 빌드 (노트북 빌드 고르기가 있는 앱만, 속성 창을 엶). 정보는 캐릭터 앞에서 멈추려고 탭 안 (V1) */
function paintRel(app, st, pref, played, last) {
  if (app.kind === 'web' || app.soon) {
    relEl.hidden = true;
    return;
  }
  relEl.hidden = false;
  const tabs = [];
  if (st.latest) tabs.push(['notes', '릴리스']);
  tabs.push(['info', '정보']);
  let tab = relTab.get(app.id) || tabs[0][0];
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  let body = '';
  if (tab === 'notes') {
    const day = st.pub_date ? String(st.pub_date).slice(5, 10).replace('-', '.') : '';
    body = '<div class="row"><span>' + esc(app.name + ' v' + st.latest) + '</span><span>' + esc(day) + '</span></div>' +
      (st.notes ? '<div class="notes">' + esc(st.notes) + '</div>' : '') +
      (st.page ? '<button type="button" class="more" data-page="' + esc(st.page) + '">전체 보기</button>' : '');
  } else {
    const rows = [];
    if (fmt(app) !== 'local') {
      rows.push(['내 버전', st.installed ? st.version || '-' : '설치 안 됨']);
      rows.push(['최신', st.latest || '-']);
      rows.push(['빌드', pref.build ? '노트북 빌드 (고정)' : '기본 (최신 릴리스)']);
      if (st.prev) rows.push(['되돌릴 판', st.prev]);
      rows.push(['자동 업데이트', MODES[modeOf(prefs, app.id)] || '-']);
    }
    rows.push(['형식', FORMAT_TEXT[fmt(app)] || fmt(app)]);
    if (last) rows.push(['마지막 실행', last]);
    if (played) rows.push(['실행 시간', played]);
    body = '<dl>' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>';
  }
  /* 빌드 고르기는 탭이 아니라 속성 창을 여는 동작 */
  const pick = app.builds === 'laptop' && st.installed ? '<button type="button" class="tablink" data-builds>빌드 고르기 &#8599;</button>' : '';
  relEl.innerHTML = '<div class="tabs" role="tablist">' + tabs.map(([k, label]) => '<button type="button" role="tab" data-tab="' + k + '"' + (k === tab ? ' class="on" aria-selected="true"' : '') + '>' + label + '</button>').join('') + pick + '</div><div class="body">' + body + '</div>';
}

/** 토스트는 플레이 바 바로 위, 같은 폭. 설정 화면이 덮였으면 오른쪽 위 */
function placeToasts() {
  const box = $('toasts');
  const stage = $('stage');
  if (stage.classList.contains('settings')) {
    box.style.left = '';
    box.style.right = '56px';
    box.style.width = '440px';
    box.style.top = '84px';
    box.style.bottom = 'auto';
    return;
  }
  const main = $('main');
  box.style.right = 'auto';
  const h1 = headEl.querySelector('h1');
  /* h1 과 플레이 바의 offsetTop 은 둘 다 .main 기준 */
  box.style.top = h1 ? main.offsetTop + h1.offsetTop + h1.offsetHeight + 6 + 'px' : 'auto';
  box.style.left = main.offsetLeft + 'px';
  box.style.width = main.offsetWidth + 'px';
  box.style.bottom = stage.offsetHeight - (main.offsetTop + actsEl.offsetTop) + 8 + 'px';
}
new ResizeObserver(() => placeToasts()).observe($('main'));

function paintMain() {
  const app = apps.find((a) => a.id === current);
  const castNow = castState(app, app && status.get(app.id), app && busy.get(app.id), app && fresh.get(app.id));
  void paintMascot(app, app && poke && poke.id === app.id ? poke.pose : castNow);
  applyAccent(app);
  paintSay(app, castNow, app && status.get(app.id));
  if (!app) {
    headEl.innerHTML = '';
    actsEl.innerHTML = '';
    relEl.hidden = true;
    return;
  }
  const bg = 'url(img/' + encodeURIComponent((app.art && app.art.bg) || 'sky-village') + '.webp)';
  heroEl.style.backgroundImage = bg;
  const st = status.get(app.id) || {};
  const pref = appPref(prefs, app.id);
  const played = fmtDuration(pref.total);
  const last = fmtAgo(pref.last, Date.now());
  const pin = pref.build;
  /* 제목 아래 한 줄: 버전 (Steam 의 기록 줄 자리는 플레이 바로) */
  const ver = [];
  if (app.kind !== 'web' && !app.soon) {
    if (fmt(app) === 'local') ver.push(['위치', st.installed ? '이 PC' : '이 PC 에 없음']);
    else {
      ver.push(['내 버전', st.installed ? st.version || '-' : '설치 안 됨']);
      if (!pin) ver.push(['최신', st.latest || (st.error ? '못 읽음' : '-')]);
      else ver.push(['빌드', '노트북 빌드 고정']);
    }
  }
  headEl.innerHTML =
    '<h1>' + esc(app.name) + '</h1><p>' + esc(app.summary) + '</p>' +
    (ver.length ? '<p class="ver">' + ver.map(([k, v]) => '<span>' + esc(k) + '<b>' + esc(v) + '</b></span>').join('') + '</p>' : '') +
    (st.error ? '<p class="err">' + esc(st.error) + '</p>' : '');

  paintRel(app, st, pref, played, last);

  const sub = [];
  const tools = [];
  const notes = [];
  let start = '';
  const job = busy.get(app.id);
  const waiting = isQueued(app.id);
  const mode = modeOf(prefs, app.id);
  if (app.soon) notes.push('아직 받을 수 있는 판이 없습니다.');
  else if (app.kind === 'web') start = '<button type="button" class="start" data-act="open">브라우저로 열기</button>';
  else if (fmt(app) === 'local') {
    const remote = remoteOf(app);
    if (st.installed) {
      start = '<button type="button" class="start' + (st.running ? ' running' : '') + '" data-act="launch">' + (st.running ? '브라우저로 열기<small>실행 중</small>' : '이 PC 에서 실행') + '</button>';
      if (st.running && app.local && Array.isArray(app.local.stop)) {
        /* 진행 중인 작업이 끊길 수 있어 두 번 누름 */
        sub.push(localStopArmed === app.id ? '<button type="button" data-act="stop">한 번 더 누르면 서버 끄기</button>' : '<button type="button" data-act="stop-arm">서버 끄기</button>');
      }
      if (remote) sub.push('<button type="button" data-act="remote">원격으로 열기</button>');
    } else if (remote) {
      start = '<button type="button" class="start" data-act="remote">원격으로 열기<small>로그인 필요</small></button>';
    } else {
      notes.push('이 PC 의 작업 폴더에 없습니다. 설정에서 작업 폴더를 바꿀 수 있습니다.');
    }
  } else if (job) {
    const word = job.phase === 'uninstall' ? '제거' : job.auto ? '자동 업데이트' : st.installed ? '업데이트' : '설치';
    /* 받는 동안 큰 버튼은 일시정지, 취소는 오른쪽 작은 단추. 설치 프로그램이 돌기 시작하면 못 멈춤 */
    if (job.phase === 'download') {
      start = '<button type="button" class="start" data-act="pause">일시정지<small>' + esc(word + ' ' + pctOf(job) + '%') + '</small></button>';
      tools.push('<button type="button" class="tool" data-act="cancel" title="취소" aria-label="취소">&#10005;</button>');
    } else start = '<button type="button" class="start" disabled>' + esc(word) + '<small>' + esc(phaseText(job)) + '</small></button>';
  } else if (waiting) {
    start = '<button type="button" class="start" disabled>대기 중</button>';
    sub.push('<button type="button" data-act="dequeue">빼기</button>');
  } else if (st.running) {
    /* 실행 중이면 Steam 처럼 끄기가 주 버튼. 떠 있는 동안 파일을 못 바꾸니 업데이트, 제거는 막음 */
    start = '<button type="button" class="start running" data-act="stop">끄기<small>실행 중</small></button>';
    /* 캐릭터가 대사로 말하면 안내를 또 쓰지 않음 */
    if (hasUpdate(st) && sayEl.hidden) notes.push('끄면 ' + esc(st.latest) + ' 받음');
  } else if (st.download && isPaused(prefs, app.id, st.latest)) {
    start = '<button type="button" class="start" data-act="install">이어 받기<small>' + esc(pausedText(app.id)) + '</small></button>';
    sub.push('<button type="button" data-act="discard">받은 것 버리기</button>');
    if (st.installed) sub.push('<button type="button" data-act="launch">업데이트 없이 실행</button>');
  } else if (!st.installed && st.download) {
    start = '<button type="button" class="start" data-act="install">설치</button>';
  } else if (hasUpdate(st) && st.download && mode === 'launch') {
    start = '<button type="button" class="start" data-act="update-launch">실행<small>먼저 ' + esc(st.latest) + ' 받음</small></button>';
    sub.push('<button type="button" data-act="launch">업데이트 없이 실행</button>');
  } else if (hasUpdate(st) && st.download) {
    start = '<button type="button" class="start" data-act="install">업데이트<small>' + esc(st.version) + ' → ' + esc(st.latest) + '</small></button>';
    sub.push('<button type="button" data-act="launch">업데이트 없이 실행</button>');
  } else if (st.installed) {
    start = '<button type="button" class="start" data-act="launch">실행</button>';
  }
  if (st.installed && !job && !app.soon && app.kind !== 'web') sub.push('<button type="button" data-act="props">속성</button>');
  const why = blocked[app.id] && blocked[app.id] !== 'paused' && !job && !waiting ? BLOCK_TEXT[blocked[app.id]] : '';
  if (why && !st.running) notes.push(esc(why));
  /* 가운데: 받는 중이면 진행, 아니면 기록 */
  const kv = (k, v) => '<div class="kv">' + esc(k) + '<b>' + esc(v) + '</b></div>';
  let stats = '';
  if (job && job.phase === 'download') {
    stats += kv('받는 중', job.total ? sizeText(job.got || 0) + ' / ' + sizeText(job.total) : pctOf(job) + '%');
    if (job.speed > 0) stats += kv('속도', sizeText(job.speed) + '/s');
    if (job.speed > 0 && job.total) stats += kv('남음', fmtLeft((job.total - (job.got || 0)) / job.speed));
  } else if (!job) {
    if (last) stats += kv('마지막 실행', last);
    if (played) stats += kv('실행 시간', played);
  }
  stats += notes.map((n) => '<p class="note">' + n + '</p>').join('');
  const more = sub.length
    ? '<span class="morewrap"><button type="button" class="tool" data-menu title="더 보기" aria-label="더 보기" aria-expanded="' + menuOpen + '">&#8943;</button>' + (menuOpen ? '<div class="menu" role="menu">' + sub.join('') + '</div>' : '') + '</span>'
    : '';
  if (!sub.length) menuOpen = false;
  const top = job ? '<div class="top"><i style="width:' + pctOf(job) + '%"></i></div>' : '';
  actsEl.innerHTML = top + start + '<div class="stats">' + stats + '</div>' + tools.join('') + more;
  placeToasts();
}

/** 트레이 실행 목록. 바뀔 때만 메뉴를 다시 만듦 */
let trayKey = '';
function syncTray() {
  const list = trayApps(apps, status);
  const key = JSON.stringify(list);
  if (key === trayKey) return;
  trayKey = key;
  void invoke('set_tray_apps', { apps: list }).catch((e) => void invoke('log_event', { text: 'tray menu failed: ' + e }));
}

function paint() {
  syncTray();
  paintList();
  paintMain();
  if (!$('dl').hidden) paintDownloads();
}

async function refreshStatus(app) {
  if (app.soon || app.kind === 'web') return;
  try {
    const st = await invoke('app_status', { app });
    /* 노트북 빌드를 고른 동안은 최신 릴리스로 덮지 않음 (Steam 베타 고정). 기본으로 돌리면 풀림 */
    const pin = appPref(prefs, app.id).build;
    if (pin && st.installed) {
      st.pinned = pin;
      st.latest = st.version;
    }
    status.set(app.id, st);
  } catch (e) {
    status.set(app.id, { error: String(e) });
  }
}

async function checkAll() {
  await Promise.all(apps.map(refreshStatus));
  lastCheck = Date.now();
  planAuto();
  paint();
}

async function load() {
  msgEl.textContent = '목록 받는 중';
  try {
    const m = await invoke('fetch_manifest');
    apps = Array.isArray(m.apps) ? m.apps : [];
    launcherCast = (m.launcher && m.launcher.cast) || null;
    msgEl.textContent = m.private && m.private.state === 'error' ? '비공개 목록을 못 받음: ' + m.private.error : '';
  } catch (e) {
    msgEl.textContent = '목록을 못 받음: ' + e;
    apps = [];
  }
  if (!current && apps[0]) current = apps[0].id;
  paint();
  await checkAll();
}

/* ---------- PC 간 설정 맞추기. 즐겨찾기와 앱별 업데이트 방식만, 기기 현황은 Dash 몫 ---------- */

let syncBusy = false;
let syncTimer = 0;
function setSyncState(text) {
  const el = document.getElementById('syncState');
  if (el) el.textContent = text;
}
/** 받아서 합치고 달라졌으면 올림. 다른 PC 와 겹쳐 409 면 한 번 더 */
async function syncPrefs(retry = true) {
  if (prefs.sync === false || syncBusy) return;
  syncBusy = true;
  try {
    const got = await invoke('sync_pull');
    const remote = (got.data && got.data.apps) || {};
    const m = mergeSync(prefs.apps, remote);
    if (m.localChanged) {
      prefs.apps = m.apps;
      savePrefs();
      planAuto();
      paint();
    }
    if (m.remoteChanged) await invoke('sync_push', { data: { schema: 1, apps: m.remote }, sha: got.sha || null });
    setSyncState('맞춤 ' + new Date().toTimeString().slice(0, 5));
  } catch (e) {
    const text = String(e);
    syncBusy = false;
    if (text === '409' && retry) return void (await syncPrefs(false));
    setSyncState(text === '403' ? '쓰기 권한 없음. 토큰 권한 확인 필요' : '맞추기 실패: ' + text);
    void invoke('log_event', { text: 'sync failed: ' + text });
  }
  syncBusy = false;
}
function scheduleSync() {
  window.clearTimeout(syncTimer);
  /* 연달아 바꿔도 커밋 하나 */
  syncTimer = window.setTimeout(() => void syncPrefs(), 20 * 1000);
}
window.setInterval(() => void syncPrefs(), CHECK_EVERY_MS);

/* ---------- 자동 업데이트 ---------- */

/** 받을 수 있는 앱을 대기에 넣고, 못 받는 이유를 기록 */
function planAuto() {
  const plan = autoPlan(apps, status, prefs, new Date(), failures);
  blocked = plan.blocked;
  for (const id of plan.ready) if (!isQueued(id) && !busy.has(id)) queue.push({ id, auto: true });
  /* 먼저 받기 앱은 줄 앞으로 */
  const rank = (j) => (modeOf(prefs, j.id) === 'priority' ? 0 : 1);
  queue.sort((a, b) => rank(a) - rank(b));
  pump();
}

function addLog(entry) {
  prefs.log = [entry, ...(prefs.log || [])].slice(0, 20);
  savePrefs();
}

/** 창을 보고 있으면 화면으로 충분. 숨었거나 다른 창을 볼 때만 알림 */
function notifyUser(title, body, always = false) {
  if (prefs.notify === false && !always) return;
  if (document.hasFocus() && !always) return;
  void invoke('notify_user', { title, body }).catch((e) => void invoke('log_event', { text: 'notify failed: ' + e }));
}

const PAUSED_TEXT = '일시정지함';
const sizeText = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + 'GB' : Math.round(n / 1024 ** 2) + 'MB');
function pausedText(id) {
  const p = (prefs.paused && prefs.paused[id]) || {};
  return p.total ? sizeText(p.got || 0) + ' / ' + sizeText(p.total) : '일시정지';
}
function clearPaused(id) {
  if (prefs.paused && prefs.paused[id]) {
    delete prefs.paused[id];
    savePrefs();
  }
}
async function discardPaused(id) {
  const app = apps.find((a) => a.id === id);
  clearPaused(id);
  if (app) await invoke('discard_partial', { app }).catch((e) => (msgEl.textContent = String(e)));
  /* 버린 판을 바로 다시 받지 않게 실패와 같은 대기를 줌 */
  const st = status.get(id) || {};
  failures[id] = { at: Date.now(), count: 1, version: st.latest };
  planAuto();
  paint();
}

/** 줄의 앞에서부터 자리가 나는 만큼 시작. 런처 자체 업데이트 중에는 새로 안 시작 */
function pump() {
  const running = () => [...busy.values()].filter((j) => j.auto).length;
  while (!selfBusy && queue.length && running() < AUTO_AT_ONCE) {
    const next = queue.shift();
    const app = apps.find((a) => a.id === next.id);
    const st = app && status.get(app.id);
    if (app && st && st.download && !st.running && !busy.has(app.id)) void runInstall(app, { auto: true });
  }
}

async function runInstall(app, opts = {}) {
  const st = status.get(app.id) || {};
  busy.set(app.id, { got: 0, total: 0, phase: 'download', ...opts });
  paint();
  let error = null;
  /* opts.pick: 속성의 빌드 목록에서 고른 노트북 빌드 { url, version, sha256 } */
  const pick = opts.pick;
  const version = pick ? pick.version : st.latest;
  try {
    await invoke('install_app', pick
      ? { app, url: pick.url, version: pick.version, signature: '', sha256: pick.sha256 }
      : { app, url: st.download, version: st.latest || '', signature: st.signature || '', sha256: st.sha256 || '' });
  } catch (e) {
    error = String(e);
  }
  const lastJob = busy.get(app.id) || {};
  busy.delete(app.id);
  if (error === PAUSED_TEXT) {
    prefs.paused = { ...prefs.paused, [app.id]: { version, got: lastJob.got || 0, total: lastJob.total || 0 } };
    savePrefs();
    await refreshStatus(app);
    planAuto();
    paint();
    return;
  }
  clearPaused(app.id);
  addLog({ id: app.id, name: app.name, version, at: Date.now(), ok: !error, error, auto: !!opts.auto });
  if (error) {
    const old = failures[app.id];
    const count = old && old.version === version ? old.count + 1 : 1;
    failures[app.id] = { at: Date.now(), count, version };
    /* 재시도마다 울리지 않게 판마다 첫 실패만 */
    if (count === 1 && error !== '취소함') notifyUser(app.name + ' 업데이트 실패', error);
    if (error !== '취소함' && (!opts.auto || count === 1)) toast(app.name + ' ' + (st.installed ? '업데이트' : '설치') + ' 실패: ' + error, 'err');
  } else {
    delete failures[app.id];
    notifyUser(app.name + ' ' + version, opts.auto ? '자동 업데이트 끝' : '설치 끝');
    msgEl.textContent = app.name + ' ' + version + (opts.auto ? ' 자동 업데이트' : ' 설치') + ' 끝';
    toast(msgEl.textContent, 'ok');
    fresh.set(app.id, 'done');
    window.setTimeout(() => {
      fresh.delete(app.id);
      paint();
    }, 6000);
  }
  await refreshStatus(app);
  if (error) status.set(app.id, { ...status.get(app.id), error });
  else if (opts.thenLaunch) await launch(app);
  planAuto();
  paint();
}

async function launch(app) {
  const st = status.get(app.id) || {};
  try {
    await invoke('launch_app', { app, args: fmt(app) === 'local' ? [] : parseArgs(appPref(prefs, app.id).args) });
    if (fmt(app) !== 'web') setAppPref(app.id, { last: Date.now() });
  } catch (e) {
    status.set(app.id, { ...st, error: String(e) });
    paint();
    return;
  }
  /* 창이 뜨기까지 잠깐. 바로 한 번, 조금 뒤 한 번 다시 잼 */
  window.setTimeout(() => void pollRunning(true), 1500);
}

/** 손으로 누른 설치와 업데이트. 줄을 안 서고 바로 시작 */
function installNow(id, opts = {}) {
  const app = apps.find((a) => a.id === id);
  if (!app || busy.has(id)) return;
  if (selfBusy) {
    msgEl.textContent = '런처 업데이트 중. 다시 켜진 뒤에 해 주세요';
    return;
  }
  const at = queue.findIndex((j) => j.id === id);
  if (at >= 0) queue.splice(at, 1);
  delete failures[id];
  if (appPref(prefs, id).skip) setAppPref(id, { skip: null });
  void runInstall(app, opts);
}

async function act(kind) {
  const app = apps.find((a) => a.id === current);
  if (!app) return;
  const st = status.get(app.id) || {};
  if (kind === 'open') return void (await invoke('open_url', { url: app.open }));
  if (kind === 'launch') return void (await launch(app));
  if (kind === 'stop-arm') {
    localStopArmed = app.id;
    paintMain();
    window.setTimeout(() => {
      if (localStopArmed === app.id) {
        localStopArmed = null;
        paintMain();
      }
    }, 4000);
    return;
  }
  if (kind === 'remote') return void (await invoke('open_url', { url: remoteOf(app) }));
  if (kind === 'install') return installNow(app.id);
  if (kind === 'update-launch') return installNow(app.id, { thenLaunch: true });
  if (kind === 'cancel') return void (await invoke('cancel_install', { id: app.id }));
  if (kind === 'pause') return void (await invoke('pause_install', { id: app.id }));
  if (kind === 'discard') return void (await discardPaused(app.id));
  if (kind === 'props') return openProps(app);
  if (kind === 'dequeue') {
    queue.splice(queue.findIndex((j) => j.id === app.id), 1);
    /* 빼 둔 판을 바로 다시 넣지 않게 실패와 같은 대기를 줌 */
    failures[app.id] = { at: Date.now(), count: 1, version: st.latest };
    planAuto();
    return paint();
  }
  if (kind === 'stop') {
    localStopArmed = null;
    /* 누르는 즉시 꺼진 것으로 그림. stop_app 은 꺼진 뒤에 돌아오고, 그때 실제 상태로 다시 잼 (사용자 "끄기가 바로바로") */
    status.set(app.id, { ...st, running: false });
    paint();
    try {
      await invoke('stop_app', { app });
    } catch (e) {
      status.set(app.id, { ...st, error: String(e) });
    }
    await pollRunning(true);
  }
}

/* ---------- 실행 중과 실행 시간 ---------- */

/* 트레이로 숨겨도 document.hidden 은 false (WebView2 실측). 창 상태를 직접 물음 */
let shown = true;
window.setInterval(() => void appWindow.isVisible().then((v) => (shown = v)).catch(() => {}), 2000);
let polling = false;
let lastPoll = 0;
let lastSave = 0;
let dirty = false;

/** 설치된 앱들의 실행 여부만 다시 (최신 판은 다시 안 받음). 꺼지는 순간 미룬 업데이트를 바로 받음 */
async function pollRunning(force) {
  const now = Date.now();
  /* 창이 보일 때 1초 (사용자 2026-09-25 "기다리는 텀이 너무 길지 않나"), 트레이에 있으면 15초 */
  if (polling || (!force && now - lastPoll < 15000 && !shown)) return;
  polling = true;
  const elapsed = tickSeconds(now, lastPoll);
  lastPoll = now;
  let changed = false;
  let stopped = false;
  for (const app of apps) {
    const st = status.get(app.id);
    if (!st || !st.installed) continue;
    try {
      const running = await invoke('running_status', { app });
      if (running && st.running) {
        /* 1초마다 파일에 쓰지 않게 메모리만 고치고, 저장은 아래에서 1분에 한 번 */
        prefs.apps = prefs.apps || {};
        const p = (prefs.apps[app.id] = prefs.apps[app.id] || {});
        p.total = (p.total || 0) + elapsed;
        p.last = now;
        dirty = true;
      }
      if (running !== st.running) {
        if (!running) stopped = true;
        st.running = running;
        changed = true;
      }
    } catch {
      /* 다음 차례에 다시 */
    }
  }
  polling = false;
  if (stopped) planAuto();
  if (changed) paint();
  if (dirty && (stopped || now - lastSave > 60000)) {
    lastSave = now;
    dirty = false;
    savePrefs();
  }
}
window.setInterval(() => void pollRunning(false), 1000);
window.setInterval(() => void checkAll(), CHECK_EVERY_MS);
/* 허용 시간대가 열리는 때와 실패 대기가 끝나는 때를 놓치지 않게 (네트워크 없음) */
window.setInterval(() => {
  planAuto();
  if (shown) paintList();
}, 60 * 1000);

/* 캐릭터를 누르면 다음 대사와 표정, 반응 (벽람항로 비서함의 터치). 표정은 잠깐만, 대사는 실제 상태를 따름 */
mascotHitEl.addEventListener('click', () => {
  sayTurn++;
  const app = apps.find((a) => a.id === current);
  if (app) {
    const shown = poke && poke.id === app.id ? poke.pose : castState(app, status.get(app.id), busy.get(app.id), fresh.get(app.id));
    poke = { id: app.id, pose: nextPose(app, shown) };
    window.clearTimeout(pokeTimer);
    pokeTimer = window.setTimeout(() => {
      poke = null;
      paintMain();
    }, POKE_MS);
  }
  paintMain();
  mascotEl.classList.remove('hop', 'enter');
  void mascotEl.offsetWidth;
  mascotEl.classList.add('hop');
});

/* ---------- 왼쪽 목록 ---------- */

listEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  current = b.dataset.id;
  menuOpen = false;
  paint();
});
/* 목록 접기 (아이콘만). 사용자 2026-11-16 "L2 처럼 아이콘만 보이는 모드 토글" */
function applySide() {
  const slim = prefs.sideSlim === true;
  document.documentElement.dataset.side = slim ? 'slim' : 'wide';
  const tg = $('sideTg');
  tg.innerHTML = slim ? '&#187;' : '&#171;';
  tg.title = slim ? '목록 펼치기' : '목록 접기';
  tg.setAttribute('aria-label', tg.title);
}
$('sideTg').addEventListener('click', () => {
  prefs.sideSlim = prefs.sideSlim !== true;
  /* 접으면 검색과 필터가 안 보이므로 풀어 둠. 안 그러면 숨은 조건이 앱을 계속 가림 */
  if (prefs.sideSlim && (view.q || view.filter !== 'all')) {
    view.q = '';
    $('q').value = '';
    view.filter = 'all';
    $('filters').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.filter === 'all'));
    paintList();
  }
  savePrefs();
  applySide();
  placeToasts();
});
listEl.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  e.preventDefault();
  current = b.dataset.id;
  paint();
  const app = apps.find((a) => a.id === current);
  if (app && !app.soon && app.kind !== 'web') openProps(app);
});
actsEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-menu]')) {
    menuOpen = !menuOpen;
    paintMain();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  menuOpen = false;
  void act(b.dataset.act);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) {
    menuOpen = false;
    paintMain();
  }
});
/* 메뉴 밖을 누르면 닫음 */
document.addEventListener('click', (e) => {
  /* 메뉴 단추를 눌러 다시 그린 경우 눌린 요소는 이미 떨어져 나감 */
  if (menuOpen && e.target.isConnected && !actsEl.contains(e.target)) {
    menuOpen = false;
    paintMain();
  }
});
relEl.addEventListener('click', (e) => {
  menuOpen = false;
  const app = apps.find((a) => a.id === current);
  if (app && e.target.closest('[data-builds]')) {
    openProps(app);
    paintMain();
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t) {
    if (!app) return;
    relTab.set(app.id, t.dataset.tab);
    paintMain();
    return;
  }
  const b = e.target.closest('[data-page]');
  if (b) void invoke('open_url', { url: b.dataset.page });
});
$('q').addEventListener('input', (e) => {
  view.q = e.target.value;
  paintList();
});
$('filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  view.filter = b.dataset.filter;
  $('filters').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  paintList();
});
$('sort').addEventListener('change', (e) => {
  view.sort = e.target.value;
  paintList();
});
$('reload').addEventListener('click', () => void load());

/* ---------- 모달 공통 ---------- */

const modals = [$('keys'), $('dl'), $('props')];
const closeModal = (el) => (el.hidden = true);
modals.forEach((el) => {
  el.addEventListener('mousedown', (e) => {
    /* 설정은 전체 화면이라 바깥이 없음 */
    if (e.target === el && el !== $('keys')) closeModal(el);
  });
  el.querySelector('[data-close]').addEventListener('click', () => closeModal(el));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modals.forEach(closeModal);
});
new MutationObserver(() => {
  const open = modals.some((el) => !el.hidden);
  const full = !$('keys').hidden;
  $('dim').hidden = !open;
  $('dim').classList.toggle('solid', full);
  $('stage').classList.toggle('dimmed', open && !full);
  $('stage').classList.toggle('settings', full);
  placeToasts();
}).observe($('stage'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });

/* ---------- 다운로드 ---------- */

function paintDownloads() {
  const row = (app, right, extra = '') => '<div class="drow"><span class="dn">' + esc(app) + '</span><span class="dx">' + extra + '</span>' + right + '</div>';
  const name = (id) => (apps.find((a) => a.id === id) || { name: id }).name;
  const parts = [];
  if (busy.size) {
    parts.push(
      '<section><h3>작업 중</h3>' +
        [...busy].map(([id, job]) =>
          row(name(id), job.phase === 'download' ? '<button type="button" data-dl="pause" data-id="' + esc(id) + '">일시정지</button><button type="button" data-dl="cancel" data-id="' + esc(id) + '">취소</button>' : '', esc(phaseText(job))) +
          '<div class="bar wide"><i style="width:' + pctOf(job) + '%"></i></div>').join('') +
        '</section>',
    );
  }
  if (queue.length) {
    parts.push('<section><h3>대기</h3>' + queue.map((j) => row(name(j.id), '<button type="button" data-dl="remove" data-id="' + esc(j.id) + '">빼기</button>')).join('') + '</section>');
  }
  const pausedIds = apps.filter((a) => !busy.has(a.id) && status.get(a.id)?.download && isPaused(prefs, a.id, status.get(a.id).latest)).map((a) => a.id);
  if (pausedIds.length) {
    parts.push(
      '<section><h3>일시정지</h3>' +
        pausedIds.map((id) =>
          row(name(id), '<button type="button" data-dl="now" data-id="' + esc(id) + '">이어 받기</button><button type="button" data-dl="discard" data-id="' + esc(id) + '">버리기</button>', esc(pausedText(id)))).join('') +
        '</section>',
    );
  }
  const later = Object.keys(blocked).filter((id) => !isQueued(id) && !busy.has(id) && blocked[id] !== 'paused');
  if (later.length) {
    parts.push(
      '<section><h3>새 판 있음</h3>' +
        later.map((id) => {
          const st = status.get(id) || {};
          return row(name(id) + ' ' + (st.latest || ''), st.running ? '' : '<button type="button" data-dl="now" data-id="' + esc(id) + '">지금 받기</button>', esc(BLOCK_TEXT[blocked[id]]));
        }).join('') +
        '</section>',
    );
  }
  const log = prefs.log || [];
  parts.push(
    '<section><h3>최근</h3>' +
      (log.length
        ? log.slice(0, 8).map((l) => row(l.name + ' ' + (l.version || ''), '', esc(l.ok ? (l.auto ? '자동, ' : '') + fmtAgo(l.at, Date.now()) : l.error || '실패'))).join('')
        : '<p class="note">기록 없음</p>') +
      '</section>',
  );
  $('dlBody').innerHTML = parts.join('');
  $('dlChecked').textContent = lastCheck ? '마지막 확인 ' + new Date(lastCheck).toTimeString().slice(0, 5) : '';
}
dlBtn.addEventListener('click', () => {
  $('dl').hidden = false;
  paintDownloads();
});
$('dlCheck').addEventListener('click', () => {
  void checkAll();
  void checkSelf();
});
$('dlBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dl]');
  if (!b) return;
  const kind = b.dataset.dl;
  if (kind === 'cancel') void invoke('cancel_install', { id: b.dataset.id });
  if (kind === 'pause') void invoke('pause_install', { id: b.dataset.id });
  if (kind === 'discard') void discardPaused(b.dataset.id);
  if (kind === 'now') installNow(b.dataset.id);
  if (kind === 'remove') {
    queue.splice(queue.findIndex((j) => j.id === b.dataset.id), 1);
    const st = status.get(b.dataset.id) || {};
    failures[b.dataset.id] = { at: Date.now(), count: 1, version: st.latest };
    planAuto();
    paint();
  }
});

/* ---------- 앱 속성 (Steam 속성, Hub 줄 메뉴). 오른쪽 클릭 또는 속성 버튼 ---------- */

let propsApp = null;
function openProps(app) {
  propsApp = app;
  const st = status.get(app.id) || {};
  const pref = appPref(prefs, app.id);
  $('propsTitle').textContent = app.name;
  $('pFav').checked = !!pref.favorite;
  const dl = canDownload(app);
  $('pUpdateRow').hidden = !dl;
  $('pArgsRow').hidden = !dl;
  $('pMode').innerHTML = Object.entries(MODES).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('');
  $('pMode').value = modeOf(prefs, app.id);
  $('pArgs').value = pref.args || '';
  $('pWhere').textContent = st.location || '';
  $('pOpen').hidden = !st.installed;
  $('pReinstall').hidden = !dl || !st.installed || !st.download || st.running;
  void paintBuilds(app);
  const rb = $('pRollback');
  rb.hidden = !st.prev || st.running || busy.has(app.id);
  rb.textContent = st.prev ? 'v' + st.prev + ' 로 되돌리기' : '';
  delete rb.dataset.sure;
  const rm = $('pRemove');
  rm.hidden = !dl || !st.installed || st.running;
  rm.textContent = '제거';
  delete rm.dataset.sure;
  $('props').hidden = false;
}
$('pFav').addEventListener('change', (e) => {
  setAppPref(propsApp.id, { favorite: e.target.checked, syncAt: Date.now() });
  scheduleSync();
  paintList();
});
$('pMode').addEventListener('change', (e) => {
  setAppPref(propsApp.id, { update: e.target.value, syncAt: Date.now() });
  scheduleSync();
  planAuto();
  paint();
});
$('pArgs').addEventListener('change', (e) => setAppPref(propsApp.id, { args: e.target.value }));

/* ---------- 빌드 고르기 (Steam 속성 베타 탭). 첫 줄 기본 = 최신 릴리스, 아래는 노트북에 남은 빌드 ---------- */

let buildRows = [];
let buildPick = null;
/** 설치 판 이름. 노트북 빌드는 버전 + 실행 번호 (같은 버전 여러 판 구분) */
const buildVersion = (r) => (r.version || '0.0.0') + '+' + (r.runNumber || 0);
const kstShort = (ms) => {
  const d = new Date(ms + 9 * 3600000);
  const two = (n) => String(n).padStart(2, '0');
  return two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes());
};
async function paintBuilds(app) {
  const row = $('pBuildRow');
  row.hidden = app.builds !== 'laptop';
  if (row.hidden) return;
  buildPick = null;
  $('pBuildGet').disabled = true;
  $('pBuildGet').textContent = '이 빌드 받기';
  $('pBuildNote').textContent = '노트북 빌드 목록 받는 중';
  $('pBuilds').innerHTML = '';
  $('pDlPw').value = '';
  paintPropsPw();
  /* 저장된 비밀번호를 아직 확인 안 했으면 열 때 확인. 틀린 값이 '저장됨' 으로만 보이지 않게 */
  if (dlPwSaved && dlPwVerdict === null) void checkDlPw();
  let failed = '';
  try {
    buildRows = await invoke('laptop_builds');
  } catch (e) {
    buildRows = [];
    failed = String(e);
  }
  if (propsApp !== app) return;
  const st = status.get(app.id) || {};
  const pin = appPref(prefs, app.id).build || '';
  $('pBuildNote').textContent = failed
    ? '노트북 빌드 목록을 못 받음: ' + failed
    : '노트북에 남은 최근 빌드. 고르면 그 빌드에 머물고, 기본으로 돌리면 최신 릴리스를 따라감';
  const items = [{ key: '', name: '기본', tag: '', meta: '최신 릴리스' + (!st.pinned && st.latest ? ' v' + st.latest : ''), side: '', ok: true }];
  for (const r of buildRows) {
    const ready = r.state === 'done' && r.artifact && r.artifact.sha256;
    items.push({
      key: r.name,
      name: 'v' + (r.version || '?') + ' #' + (r.runNumber || '?'),
      tag: r.buildType || '',
      meta: [r.ref, r.commit, kstShort(r.builtAt)].filter(Boolean).join('  '),
      side: r.state === 'running' || r.state === 'stalling' ? '굽는 중' : !r.artifact ? '산출물 없음' : ready ? sizeText(r.artifact.size) : '확인 중',
      ok: !!ready,
    });
  }
  $('pBuilds').innerHTML = items.map((it) => '<label class="' + (it.ok ? '' : 'off') + (it.key === pin ? ' on' : '') + '">' +
    '<input type="radio" name="pb" value="' + esc(it.key) + '"' + (it.key === pin ? ' checked' : '') + (it.ok ? '' : ' disabled') + '>' +
    '<span class="bn">' + esc(it.name) + (it.tag ? '<span class="bt' + (it.tag === 'development' ? ' dev' : '') + '">' + esc(it.tag) + '</span>' : '') +
    (it.key === pin && st.installed ? '<span class="bt">설치됨</span>' : '') + '</span>' +
    '<span class="bs">' + esc(it.side) + '</span><span class="bm">' + esc(it.meta) + '</span></label>').join('');
}
$('pBuilds').addEventListener('change', (e) => {
  const key = e.target.value;
  buildPick = key;
  for (const l of $('pBuilds').querySelectorAll('label')) l.classList.toggle('on', l.querySelector('input').value === key);
  const pin = appPref(prefs, propsApp.id).build || '';
  $('pBuildGet').disabled = key === pin;
  $('pBuildGet').textContent = key ? '이 빌드 받기' : '기본으로 돌리기';
});
$('pBuildGet').addEventListener('click', async () => {
  const app = propsApp;
  if (buildPick === null) return;
  if (busy.has(app.id) || selfBusy) {
    $('pBuildNote').textContent = '받는 중인 작업이 끝난 뒤에 다시';
    return;
  }
  /* 받기 전에 비밀번호를 노트북에 확인. 틀리면 창을 닫지 않고 이 자리에서 다시 넣게. 닫은 뒤 실패하면 오류가 안 보임 */
  if (buildPick) {
    const typed = $('pDlPw').value;
    const btn = $('pBuildGet');
    btn.disabled = true;
    btn.textContent = '비밀번호 확인 중';
    let ok;
    try {
      if (typed.trim()) await invoke('laptop_dl_set', { password: typed });
      dlPwSaved = await invoke('laptop_dl_status');
      ok = dlPwSaved ? await checkDlPw() : false;
    } catch (e) {
      ok = String(e);
    }
    btn.disabled = false;
    btn.textContent = '이 빌드 받기';
    /* 확인 못 함 (목록 없음, 연결 실패) 은 받기에서 다시 드러나니 막지 않음. 틀림과 없음만 막음 */
    if (ok === false) {
      const why = dlPwSaved ? '다운로드 비밀번호가 틀림. 다시 넣어 주세요' : '다운로드 비밀번호를 넣고 다시 받기 (설정에도 저장됨)';
      paintPropsPw(true);
      $('pBuildNote').textContent = why;
      if (dlPwSaved) toast(why, 'err');
      $('pDlPw').focus();
      return;
    }
    if (typed.trim()) toast(ok === true ? '다운로드 비밀번호 저장, 노트북에서 확인됨' : '다운로드 비밀번호 저장함', 'ok');
    $('pDlPw').value = '';
  }
  closeModal($('props'));
  if (!buildPick) {
    setAppPref(app.id, { build: null });
    await refreshStatus(app);
    if ((status.get(app.id) || {}).download) installNow(app.id);
    else paint();
    return;
  }
  const r = buildRows.find((x) => x.name === buildPick);
  if (!r) return;
  const version = buildVersion(r);
  /* 고정을 먼저. 설치 끝에 도는 자동 업데이트 계획이 방금 깐 빌드를 릴리스로 덮지 않게. 실패하면 되돌림 */
  const before = appPref(prefs, app.id).build || null;
  setAppPref(app.id, { build: r.name });
  await runInstall(app, { pick: { url: r.download, version, sha256: r.artifact.sha256 } });
  const after = status.get(app.id) || {};
  if (after.version !== version) {
    msgEl.textContent = app.name + ' 빌드 받기 실패: ' + (after.error || '설치된 판이 다름');
    if (!after.error) toast(msgEl.textContent, 'err');
    setAppPref(app.id, { build: before });
    await refreshStatus(app);
    planAuto();
    paint();
  }
});

/* 다운로드 비밀번호. 저장 여부와 노트북 확인 결과를 같이 보임. 저장돼 있으면 입력칸 대신 바꾸기 (사용자 2026-11-16) */
let dlPwVerdict = null; /* null 모름, true 맞음, false 틀림, 문자열은 확인 못 한 이유 */
let dlPwSaved = false;
async function checkDlPw() {
  try {
    dlPwVerdict = await invoke('laptop_dl_check');
  } catch (e) {
    dlPwVerdict = String(e);
  }
  await paintDlPw();
  return dlPwVerdict;
}
async function paintDlPw() {
  try {
    dlPwSaved = await invoke('laptop_dl_status');
  } catch (e) {
    $('dlPwState').textContent = '저장 상태를 못 읽음: ' + e;
    return;
  }
  const st = $('dlPwState');
  st.className = 'state';
  if (!dlPwSaved) st.textContent = '저장된 비밀번호 없음';
  else if (dlPwVerdict === true) st.textContent = '저장됨, 노트북에서 확인됨';
  else if (dlPwVerdict === false) {
    st.textContent = '저장됨, 그런데 노트북이 거절함 (틀림)';
    st.className = 'state bad';
  } else if (typeof dlPwVerdict === 'string') st.textContent = '저장됨, 맞는지 확인 못 함: ' + dlPwVerdict;
  else st.textContent = '저장됨';
  const edit = !dlPwSaved || dlPwVerdict === false || $('dlPwForm').dataset.open === '1';
  $('dlPwForm').hidden = !edit;
  $('dlPwEdit').hidden = edit;
  $('dlPwCheck').hidden = !dlPwSaved;
  $('dlPwClear').hidden = !dlPwSaved;
  if (!$('props').hidden) paintPropsPw();
}
/** 속성의 빌드 칸. 저장돼 있고 틀리지 않았으면 입력칸 대신 한 줄 */
function paintPropsPw(force = false) {
  const need = force || !dlPwSaved || dlPwVerdict === false;
  $('pDlRow').hidden = !need;
  $('pDlSaved').hidden = need;
}
$('dlPwSave').addEventListener('click', async () => {
  const v = $('dlPw').value;
  if (!v.trim()) {
    toast('비밀번호를 넣어 주세요', 'err');
    return;
  }
  const btn = $('dlPwSave');
  btn.disabled = true;
  try {
    await invoke('laptop_dl_set', { password: v });
  } catch (e) {
    btn.disabled = false;
    toast('저장 실패: ' + e, 'err');
    return;
  }
  $('dlPw').value = '';
  delete $('dlPwForm').dataset.open;
  $('dlPwState').textContent = '저장함, 노트북에 확인 중';
  const r = await checkDlPw();
  btn.disabled = false;
  if (r === true) toast('다운로드 비밀번호 저장, 노트북에서 확인됨', 'ok');
  else if (r === false) toast('저장했지만 노트북이 거절함. 비밀번호가 틀림', 'err');
  else toast('저장함. 맞는지는 확인 못 함: ' + r, 'info');
});
$('dlPw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('dlPwSave').click();
});
$('dlPwEdit').addEventListener('click', () => {
  $('dlPwForm').dataset.open = '1';
  void paintDlPw().then(() => $('dlPw').focus());
});
$('dlPwCheck').addEventListener('click', async () => {
  $('dlPwState').textContent = '노트북에 확인 중';
  const r = await checkDlPw();
  toast(r === true ? '다운로드 비밀번호 맞음' : r === false ? '다운로드 비밀번호 틀림' : '확인 못 함: ' + r, r === true ? 'ok' : r === false ? 'err' : 'info');
});
$('dlPwClear').addEventListener('click', async () => {
  try {
    await invoke('laptop_dl_set', { password: '' });
  } catch (e) {
    toast('지우기 실패: ' + e, 'err');
    return;
  }
  dlPwVerdict = null;
  delete $('dlPwForm').dataset.open;
  await paintDlPw();
  toast('다운로드 비밀번호 지움', 'info');
});
paintDlPw();
$('pOpen').addEventListener('click', () => void invoke('open_location', { app: propsApp }).catch((e) => ($('pWhere').textContent = String(e))));
$('pReinstall').addEventListener('click', () => {
  closeModal($('props'));
  installNow(propsApp.id);
});
$('pRollback').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!b.dataset.sure) {
    b.dataset.sure = '1';
    b.textContent = '정말 되돌리기';
    return;
  }
  const app = propsApp;
  const st = status.get(app.id) || {};
  try {
    await invoke('rollback_app', { app });
    /* 되돌린 판을 자동 업데이트가 바로 덮지 않게 */
    if (st.latest) setAppPref(app.id, { skip: st.latest });
    closeModal($('props'));
    msgEl.textContent = app.name + ' v' + st.prev + ' 로 되돌림';
    toast(msgEl.textContent, 'ok');
    await refreshStatus(app);
    planAuto();
    paint();
  } catch (err) {
    $('pWhere').textContent = String(err);
  }
});
$('pRemove').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  /* 두 번 눌러야 지움 (Hub 의 확인 창 자리) */
  if (!b.dataset.sure) {
    b.dataset.sure = '1';
    b.textContent = '정말 제거';
    return;
  }
  const app = propsApp;
  closeModal($('props'));
  if (selfBusy) {
    msgEl.textContent = '런처 업데이트 중. 다시 켜진 뒤에 해 주세요';
    return;
  }
  busy.set(app.id, { got: 0, total: 0, phase: 'uninstall' });
  paint();
  try {
    await invoke('uninstall_app', { app });
  } catch (err) {
    status.set(app.id, { ...status.get(app.id), error: String(err) });
  }
  busy.delete(app.id);
  await refreshStatus(app);
  paint();
});

/* ---------- 설정 ---------- */

const ghStateEl = $('ghState');
function applyTheme() {
  const t = prefs.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
async function paintKeys() {
  try {
    const login = await invoke('github_status');
    ghStateEl.textContent = login ? '로그인: ' + login + '. 비공개 항목이 목록에 나옵니다' : '로그인 안 됨. 공개 항목만 보입니다';
  } catch (e) {
    ghStateEl.textContent = '토큰 확인 실패: ' + e;
  }
  $('sAuto').checked = prefs.autoUpdate !== false;
  $('sNotify').checked = prefs.notify !== false;
  $('sSync').checked = prefs.sync !== false;
  $('sGame').checked = !!prefs.duringGame;
  $('sWinOn').checked = !!prefs.window;
  $('sWinA').value = (prefs.window && prefs.window.start) || '02:00';
  $('sWinB').value = (prefs.window && prefs.window.end) || '07:00';
  $('sTray').checked = prefs.closeToTray !== false;
  $('sBoot').checked = autostart;
  $('sTheme').value = prefs.theme || 'system';
  $('sMdd').checked = mddOn();
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
/* 관리인 대사. 설정을 열 때마다 다음 줄. 원본 characters/mascot-launcher/launcher.json, 목록의 launcher.cast */
let launcherCast = null;
let setSayTurn = 0;
function paintSetSay() {
  const lines = (launcherCast && launcherCast.lines && launcherCast.lines.settings) || [];
  const line = mddOn() && lines.length ? lines[setSayTurn++ % lines.length] : '';
  $('setSay').textContent = line;
  $('setSay').hidden = !line;
}
$('keyBtn').addEventListener('click', () => {
  $('keys').hidden = false;
  paintSetSay();
  void paintDlPw().then(() => dlPwSaved && dlPwVerdict === null && checkDlPw());
  void paintKeys();
  void invoke('get_settings').then((s) => ($('ws').value = s.workspace || '')).catch(() => {});
});
$('ghSave').addEventListener('click', () => void keyAction(() => invoke('github_set_token', { token: $('ghToken').value })));
$('ghGit').addEventListener('click', () => void keyAction(() => invoke('github_use_git_login')));
$('ghClear').addEventListener('click', () => void keyAction(() => invoke('github_clear')));
$('wsSave').addEventListener('click', () => void keyAction(() => invoke('set_workspace', { path: $('ws').value })));
function onPrefChange() {
  prefs.autoUpdate = $('sAuto').checked;
  prefs.notify = $('sNotify').checked;
  const syncWasOff = prefs.sync === false;
  prefs.sync = $('sSync').checked;
  if (syncWasOff && prefs.sync) void syncPrefs();
  prefs.duringGame = $('sGame').checked;
  prefs.window = $('sWinOn').checked ? { start: $('sWinA').value, end: $('sWinB').value } : null;
  prefs.closeToTray = $('sTray').checked;
  prefs.theme = $('sTheme').value;
  prefs.mdd = $('sMdd').checked;
  applyTheme();
  applyMdd();
  $('setSay').hidden = !mddOn() || !$('setSay').textContent;
  savePrefs();
  planAuto();
  paint();
}
['sAuto', 'sNotify', 'sSync', 'sGame', 'sWinOn', 'sWinA', 'sWinB', 'sTray', 'sTheme', 'sMdd'].forEach((id) => $(id).addEventListener('change', onPrefChange));
$('sBoot').addEventListener('change', async (e) => {
  try {
    await invoke('set_autostart', { enabled: e.target.checked });
    autostart = e.target.checked;
  } catch (err) {
    e.target.checked = autostart;
    ghStateEl.textContent = '시작 프로그램 등록 실패: ' + err;
  }
});
$('min').addEventListener('click', () => void appWindow.minimize());
/* 닫기는 기본 트레이로 (Steam 처럼). 설정에서 끝내기로 바꿀 수 있음 */
$('close').addEventListener('click', () => void (prefs.closeToTray === false ? invoke('quit_app') : appWindow.hide()));

/* ---------- 배치와 가장자리 ---------- */

/* 판 안 내용 배율. 1292x772 (기본 창 1340x820 에서 여백 24px 씩 뺀 판) 기준으로 그린 배치를
   창 크기에 맞춰 통째로 줄이고 키움. 기준에서도 0.88 배 (사용자 2026-11-03 "UI 들이 너무 크다") */
const stageEl = $('stage');
const panelEl = $('panel');
const rimEl = $('rim');
const MARGIN = 24;

/** 가장자리가 부드럽게 사라지는 마스크. 진짜 흐림 (가우시안) 이라 네 모서리에 사선이 안 생김.
    예전 방식은 가로 띠와 세로 띠의 교집합이라 모서리에 사선 경계가 보였음 */
function softMask(w, h, inset, blur) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><filter id="f" x="-10%" y="-10%" width="120%" height="120%">' +
    '<feGaussianBlur stdDeviation="' + blur + '"/></filter><rect x="' + inset + '" y="' + inset + '" width="' + (w - inset * 2) + '" height="' + (h - inset * 2) +
    '" fill="#fff" filter="url(#f)"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

/* 판 가장자리. 짧게 번지고 끝에 얇은 선과 모서리 괄호 (사용자 2026-11-05 A 선택, 비교판 notes/launcher/edge-2026-11-04) */
function applyEdge(z) {
  const w = Math.max(1, window.innerWidth - MARGIN * 2);
  const h = Math.max(1, window.innerHeight - MARGIN * 2);
  const s = Math.max(z, 0.5);
  const inset = Math.round(24 * s);
  const mask = softMask(w, h, inset, Math.round(11 * s));
  panelEl.style.webkitMaskImage = mask;
  panelEl.style.maskImage = mask;
  rimEl.style.inset = inset + 'px';
  /* 크기 조절 손잡이는 흐린 띠 전체 (사용자 2026-11-03 "정말 흐리멍텅해지는 곳에서 조절") */
  document.documentElement.style.setProperty('--band', MARGIN + inset + Math.round(20 * s) + 'px');
}

let edgeFrame = 0;
function fitStage() {
  const w = Math.max(1, window.innerWidth - MARGIN * 2);
  const h = Math.max(1, window.innerHeight - MARGIN * 2);
  const z = Math.min(1.2, Math.max(0.45, Math.min(w / 1292, h / 772) * 0.88));
  stageEl.style.setProperty('--z', z.toFixed(3));
  /* 마스크 다시 그리기는 끌기 중 프레임마다 한 번만 */
  window.cancelAnimationFrame(edgeFrame);
  edgeFrame = window.requestAnimationFrame(() => applyEdge(z));
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

/* ---------- 런처 자신의 업데이트 ---------- */

/* 새 판이 있으면 묻지 않고 받아 설치하고 다시 켬 (Steam 처럼, 사용자 2026-09-25 "런처는 그래야지").
   버튼으로만 받게 했더니 0.1.3 이 그대로 남아 끄기 수정이 안 들어왔다. 켜자마자 한 번, 트레이에 오래 있으니 30분마다.
   앱을 받는 중이면 다시 켜면 끊기니 다음 차례로 */
const selfEl = $('selfup');
/** 실패하면 오류 글, 아니면 null (성공하면 앱이 다시 켜져 돌아오지 않음) */
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
    selfEl.textContent = '런처 업데이트 실패: ' + friendly(e);
    toast(selfEl.textContent, 'err');
    return selfEl.textContent;
  }
  return null;
}
async function checkSelf() {
  if (selfBusy) return;
  try {
    const v = await invoke('self_update_check');
    if (!v) return;
    if (busy.size || queue.length) {
      window.setTimeout(() => void checkSelf(), 60 * 1000);
      return;
    }
    await installSelf();
  } catch {
    /* 오프라인이거나 아직 릴리스가 없음. 다음 차례에 다시. 원인은 백엔드 로그 */
  }
}
selfEl.addEventListener('click', () => {
  if (busy.size) {
    selfEl.textContent = '앱 작업이 끝난 뒤에 눌러 주세요';
    return;
  }
  void installSelf();
});
window.setInterval(() => void checkSelf(), CHECK_EVERY_MS);
/* 창을 열 때도 확인, 1분에 한 번까지. 30분 주기만 두면 릴리스 직후 연 창에 옛 판이 최대 30분 남음 (사용자 2026-11-05) */
let selfFocusAt = 0;
window.addEventListener('focus', () => {
  if (Date.now() - selfFocusAt < 60 * 1000) return;
  selfFocusAt = Date.now();
  void checkSelf();
});
/* 손으로 확인. 자동 확인과 달리 최신, 실패를 화면에 표시. 자동이 있어도 사용자가 바로 확인 가능 (사용자 2026-11-05) */
const selfStateEl = $('selfState');
const selfCheckEl = $('selfCheck');
/** 결과 글을 돌려줌. 설정의 버튼과 트레이 메뉴가 같이 씀 */
async function manualSelfCheck() {
  if (selfBusy) return '런처 받는 중';
  selfCheckEl.disabled = true;
  selfStateEl.textContent = '확인 중';
  let text;
  try {
    const v = await invoke('self_update_check');
    if (!v) {
      text = '최신 판입니다 (' + $('ver').textContent + ')';
    } else if (busy.size) {
      text = 'v' + v + ' 있음. 앱 작업이 끝난 뒤 설치';
      window.setTimeout(() => void checkSelf(), 60 * 1000);
    } else {
      text = 'v' + v + ' 받는 중';
      selfStateEl.textContent = text;
      const fail = await installSelf();
      if (fail) {
        /* installSelf 가 이미 토스트를 띄움 */
        selfStateEl.textContent = fail;
        selfCheckEl.disabled = false;
        return fail;
      }
    }
  } catch (e) {
    text = '확인 실패: ' + friendly(e);
  }
  selfStateEl.textContent = text;
  selfCheckEl.disabled = false;
  toast('런처 ' + text, text.startsWith('확인 실패') ? 'err' : 'info');
  return text;
}
selfCheckEl.addEventListener('click', () => void manualSelfCheck());
$('openLogs').addEventListener('click', () => void invoke('open_logs').catch((e) => (selfStateEl.textContent = String(e))));
void listen('tray-check', async () => {
  void checkAll();
  notifyUser('Karmo Launcher', await manualSelfCheck(), true);
});
void listen('tray-run', (ev) => {
  const app = apps.find((a) => a.id === ev.payload);
  if (!app) return;
  if (app.kind === 'web') void invoke('open_url', { url: app.open });
  else if (remoteOf(app) && !status.get(app.id)?.installed) void invoke('open_url', { url: remoteOf(app) });
  else void launch(app);
});
void listen('self-update-progress', (ev) => {
  const [got, total] = ev.payload;
  if (total) selfEl.textContent = '런처 받는 중 ' + Math.round((got / total) * 100) + '%';
});
void window.__TAURI__.app.getVersion().then((v) => ($('ver').textContent = 'v' + v));
void listen('install-progress', (ev) => {
  const old = busy.get(ev.payload.id);
  /* 끝난 뒤 늦게 온 이벤트는 무시 */
  if (!old) return;
  const job = { ...old, ...ev.payload };
  /* 속도: 1초 넘게 벌어진 표본끼리, 지수 평균 */
  const now = Date.now();
  if (old.at && job.got >= (old.got || 0) && now - old.at >= 1000) {
    const v = ((job.got - (old.sampleGot || 0)) * 1000) / (now - old.at);
    job.speed = old.speed ? old.speed * 0.7 + v * 0.3 : v;
    job.at = now;
    job.sampleGot = job.got;
  } else if (!old.at) {
    job.at = now;
    job.sampleGot = job.got || 0;
  }
  busy.set(job.id, job);
  /* 목록은 글자만 바꿈. 통째로 다시 그리면 누르는 사이 단추가 바뀌어 클릭이 사라짐 */
  const tag = listEl.querySelector('[data-id="' + CSS.escape(job.id) + '"] [data-job]');
  if (tag) tag.textContent = phaseText(job);
  paintDlBtn();
  if (job.id === current) {
    if (old.phase === job.phase && job.phase === 'download' && actsEl.querySelector('.top')) paintProgress(job);
    else paintMain();
  }
  if (!$('dl').hidden) paintDownloads();
});

async function boot() {
  try {
    const s = await invoke('get_settings');
    prefs = { ...prefs, ...s.prefs };
    autostart = !!s.autostart;
  } catch {
    /* 기본값으로 */
  }
  applyTheme();
  applyMdd();
  applySide();
  fitStage();
  await load();
  void checkSelf();
  void syncPrefs();
}
void boot();
