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
    if (mode === 'off') blocked[app.id] = 'off';
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
