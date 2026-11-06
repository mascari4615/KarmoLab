// 자동 업데이트와 목록 판단. 화면과 Tauri 에 안 기대는 순수 함수만 (node --test ui/updates.test.mjs)
// 근거: memo notes/launcher/benchmark-steam-hub-2026-11-04.md

/** 앱별 업데이트 방식. Steam 속성 Updates 탭의 셋에 "끔" 을 더함 */
export const MODES = {
  auto: '항상 최신으로',
  priority: '항상 최신으로, 다른 앱보다 먼저',
  launch: '실행할 때만',
  off: '끔',
};

/** 버전 비교. 점 단위 숫자만 (0.1.112 < 0.1.116) */
export function newer(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export const hasUpdate = (st) => !!(st && st.installed && st.latest && newer(st.latest, st.version));
export const appPref = (prefs, id) => (prefs && prefs.apps && prefs.apps[id]) || {};
export const modeOf = (prefs, id) => appPref(prefs, id).update || 'auto';

/** 이 판을 일시정지했나. 새 판이 나오면 풀림 */
export const isPaused = (prefs, id, latest) => !!(prefs && prefs.paused && prefs.paused[id] && prefs.paused[id].version === latest);

/**
 * PC 간 설정 합치기. 맞추는 값은 즐겨찾기와 업데이트 방식뿐, 앱별로 syncAt 이 큰 쪽이 이김.
 * 결과: apps 는 합친 뒤 로컬 prefs.apps, remote 는 올릴 내용, localChanged 와 remoteChanged 는 변경 여부
 */
export function mergeSync(localApps = {}, remote = {}) {
  const pick = (p = {}) => ({ favorite: !!p.favorite, update: p.update || 'auto', syncAt: p.syncAt || 0 });
  const same = (a, b) => a.favorite === b.favorite && a.update === b.update;
  const blank = (p) => !p.favorite && p.update === 'auto';
  const apps = { ...localApps };
  const out = {};
  let localChanged = false;
  let remoteChanged = false;
  for (const id of new Set([...Object.keys(localApps), ...Object.keys(remote)])) {
    const l = pick(localApps[id]);
    const r = remote[id] ? pick(remote[id]) : null;
    if (r && r.syncAt > l.syncAt) {
      out[id] = r;
      if (!same(l, r) || r.syncAt !== l.syncAt) {
        apps[id] = { ...localApps[id], ...r };
        localChanged = localChanged || !same(l, r);
      }
    } else {
      /* 실행 시간만 있는 앱은 안 올림 */
      if (r || !blank(l)) out[id] = l;
      if (out[id] && (!r || !same(l, r) || r.syncAt !== l.syncAt)) remoteChanged = true;
    }
  }
  return { apps, remote: out, localChanged, remoteChanged };
}

/** 로컬 항목의 원격 주소 (`local.remote`). 이 PC 에 없어도 https 로 엶. 없으면 빈 값 */
export const remoteOf = (app) => {
  const url = app && app.local && app.local.remote;
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
};

/** 트레이 실행 목록. 준비 중이 아니고 실행할 수 있는 앱만 */
export function trayApps(apps, status) {
  return apps
    .filter((a) => !a.soon && (a.kind === 'web' || remoteOf(a) || status.get(a.id)?.installed))
    .map((a) => ({ id: a.id, name: a.name }));
}

const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 허용 시간대 안인가. 값이 없거나 잘못되면 언제나 허용. 자정을 넘는 구간 (23:00 ~ 07:00) 도 됨 */
export function inWindow(win, date) {
  const a = minutes(win && win.start);
  const b = minutes(win && win.end);
  if (a === null || b === null || a === b) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  return a < b ? now >= a && now < b : now >= a || now < b;
}

const RETRY_BASE_MS = 30 * 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/** 실패 뒤 다시 시도할 수 있는 시각. 30분, 1시간, 2시간 ... 최대 6시간. 판이 바뀌면 바로 다시 */
export function retryAt(failure, latest) {
  if (!failure || failure.version !== latest) return 0;
  return failure.at + Math.min(RETRY_BASE_MS * 2 ** (failure.count - 1), RETRY_MAX_MS);
}

/**
 * 지금 자동으로 받을 앱과, 받을 판이 있는데 못 받는 이유.
 * 받기 형식 (nsis, zip) 이고 설치돼 있는 앱만. 앱이 떠 있으면 파일을 못 바꾸니 끌 때까지 미룸.
 * 게임 (kind unity) 이 떠 있으면 Steam 의 기본처럼 전부 미룸. 설정으로 허용 가능
 */
export function autoPlan(apps, status, prefs, date, failures = {}) {
  const ready = [];
  const blocked = {};
  const gaming = apps.some((a) => a.kind === 'unity' && status.get(a.id)?.running);
  for (const app of apps) {
    const st = status.get(app.id);
    const format = (app.install && app.install.format) || 'nsis';
    if (app.soon || app.kind === 'web' || format === 'local') continue;
    if (!hasUpdate(st) || !st.download) continue;
    const mode = modeOf(prefs, app.id);
    if (isPaused(prefs, app.id, st.latest)) blocked[app.id] = 'paused';
    else if (appPref(prefs, app.id).skip === st.latest) blocked[app.id] = 'skipped';
    else if (mode === 'off') blocked[app.id] = 'off';
    else if (mode === 'launch') blocked[app.id] = 'launch';
    else if (prefs.autoUpdate === false) blocked[app.id] = 'global-off';
    else if (st.running) blocked[app.id] = 'running';
    else if (gaming && !prefs.duringGame) blocked[app.id] = 'game';
    else if (!inWindow(prefs.window, date)) blocked[app.id] = 'window';
    else if (date.getTime() < retryAt(failures[app.id], st.latest)) blocked[app.id] = 'retry';
    else ready.push({ id: app.id, priority: mode === 'priority' });
  }
  ready.sort((a, b) => Number(b.priority) - Number(a.priority));
  return { ready: ready.map((r) => r.id), blocked };
}

/** 미루는 이유를 화면 글로 */
export const BLOCK_TEXT = {
  off: '자동 업데이트 끔',
  launch: '실행할 때 받음',
  'global-off': '자동 업데이트 꺼 둠',
  running: '끈 뒤에 받음',
  game: '게임을 끈 뒤에 받음',
  window: '허용 시간대에 받음',
  retry: '실패, 잠시 뒤 다시',
  paused: '일시정지',
  skipped: '되돌린 판, 다음 새 판까지 안 받음',
};

/** 목록에 보일 앱. 검색 (이름과 설명), 거르기, 정렬. 즐겨찾기는 늘 위로 */
export function visibleApps(apps, status, prefs, view) {
  const q = String(view.q || '').trim().toLowerCase();
  const rows = apps.filter((a) => {
    const st = status.get(a.id);
    if (q && !(a.name + ' ' + (a.summary || '')).toLowerCase().includes(q)) return false;
    if (view.filter === 'installed') return !!(st && st.installed);
    if (view.filter === 'updates') return hasUpdate(st);
    return true;
  });
  const order = new Map(apps.map((a, i) => [a.id, i]));
  return rows.sort((a, b) => {
    const pa = appPref(prefs, a.id);
    const pb = appPref(prefs, b.id);
    if (!!pa.favorite !== !!pb.favorite) return pa.favorite ? -1 : 1;
    if (view.sort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (view.sort === 'recent' && (pa.last || 0) !== (pb.last || 0)) return (pb.last || 0) - (pa.last || 0);
    return order.get(a.id) - order.get(b.id);
  });
}

/** 설치본에 든 그림 주소 */
export const bundledImage = (name) => 'img/' + name + '.webp';

/** 없는 표정 그림은 이 순서로 대신함 */
const POSE_OF = { done: 'running', waiting: 'running', update: 'idle', missing: 'idle' };

/** 앱의 지금 상태를 캐릭터 상태로. fresh 는 방금 끝난 일 (done) */
export function castState(app, st, job, fresh) {
  if (fresh) return fresh;
  if (job) return 'busy';
  if (st && st.error) return 'error';
  if (st && st.running) return hasUpdate(st) ? 'waiting' : 'running';
  if (hasUpdate(st)) return 'update';
  if (app && !app.soon && app.kind !== 'web' && !remoteOf(app) && st && !st.installed) return 'missing';
  return 'idle';
}

/** 상태의 대사. 여러 줄이면 turn 번째, 없으면 평소 대사. {latest}, {version} 은 판 번호로 */
export function castLine(app, state, turn, st) {
  const cast = app && app.art && app.art.cast;
  if (!cast || !cast.lines) return '';
  const raw = cast.lines[state] || cast.lines.idle;
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  const line = list[Math.abs(turn) % list.length];
  return line.replace('{latest}', (st && st.latest) || '').replace('{version}', (st && st.version) || '');
}

/** 앱 로고 (단색 마스크). 공개는 설치본, 비공개는 memo. 없으면 null. 마스코트와 별개 */
export function logoSource(app) {
  const art = (app && app.art) || {};
  if (art.logo_private) return { private: art.logo_private };
  if (/^[a-z0-9-]+$/.test(art.logo || '')) return { url: bundledImage('logo-' + art.logo) };
  return null;
}

/** 대표색. 목록 데이터가 화면 스타일로 들어가므로 6자리 색만 받음 */
export const accentOf = (app) => {
  const c = app && app.art && app.art.accent;
  return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '';
};

/**
 * 앱의 마스코트 자리. `art.mascot` 은 설치본에 든 그림 이름 (공개 항목),
 * `art.mascot_private` 는 memo 저장소 경로 (비공개 항목. 공개 저장소에 그림과 이름을 안 남김). 그림 없는 앱은 null
 */
export function mascotSource(app, state = 'idle') {
  const art = (app && app.art) || {};
  const pose = POSE_OF[state] || state;
  const suffix = pose !== 'idle' && Array.isArray(art.poses) && art.poses.includes(pose) ? '-' + pose : '';
  if (art.mascot_private) return { private: art.mascot_private.replace(/\.webp$/, suffix + '.webp') };
  if (/^[a-z0-9-]+$/.test(art.mascot || '')) return { url: bundledImage('mascot-' + art.mascot + suffix) };
  return null;
}

/** 캐릭터를 누를 때 다음 표정. 평소, 실행 중, 받는 중, 실패 순으로 있는 그림만 돌고, 그림이 없으면 평소 */
export function nextPose(app, shown = 'idle') {
  const poses = (app && app.art && app.art.poses) || [];
  const order = ['idle', ...['running', 'busy', 'error'].filter((p) => Array.isArray(poses) && poses.includes(p))];
  const at = order.indexOf(POSE_OF[shown] || shown);
  return order[(at + 1) % order.length];
}

/** 지난 확인 뒤 지난 초. 첫 확인은 0 (켜자마자 시간이 더해지지 않게), 오래 멈췄으면 상한까지만 */
export function tickSeconds(now, last, max = 120) {
  return last ? Math.min((now - last) / 1000, max) : 0;
}

/** 실행 옵션 칸을 인자 배열로. 큰따옴표로 공백을 묶음 */
export function parseArgs(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/"([^"]*)"|(\S+)/g)) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/** 초를 "3시간 20분" 으로. 1분 미만은 빈 값 */
export function fmtDuration(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 1) return '';
  const h = Math.floor(m / 60);
  return h ? h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분';
}

/** 시각을 "오늘", "어제", "3일 전", 오래되면 날짜로 */
export function fmtAgo(ms, now) {
  if (!ms) return '';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day(new Date(now)) - day(new Date(ms))) / 86400000);
  if (n <= 0) return '오늘';
  if (n === 1) return '어제';
  if (n < 30) return n + '일 전';
  const d = new Date(ms);
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}
