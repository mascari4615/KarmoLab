/**
 * 차단, 좋아요 목록과 설정, 취향 통계를 다운로드 폴더의 파일로 내보냄. background.js 가 importScripts, 설정 창도 로드
 *
 * 왜 다운로드: MV3 확장은 임의 경로에 못 쓰고, 로컬 수신 서버는 늘 떠 있지 않다 (schedule.js 와 같은 이유)
 * 파일: 다운로드/karmo-userlists/userlists.json (목록, 설정), stats.json (유저별 본 글, 연 글), 같은 이름으로 덮어씀
 * 시점: 목록이나 설정이 바뀐 뒤 잠시 (알람) 한 번, 변경이 잇따르면 마지막 한 번. 통계는 하루 한 번 알람
 * 옮기는 쪽: memo/scripts/userlists/publish.mjs (작업 스케줄러)
 * 정본: memo/systems/karmo-dev-extension.md
 */

const UL_DIR = "karmo-userlists";
const UL_FILE = `${UL_DIR}/userlists.json`;
const UL_STATS_FILE = `${UL_DIR}/stats.json`;
const UL_ALARM = "karmo.userlists";
const UL_STATS_ALARM = "karmo.userlists.stats";
const UL_STATE = "karmo.userlistsExport";
const UL_STATS_USERS = 500;

/** 파일 내용 형태. 가져오기도 이 형태를 읽음 */
async function userlistsSnapshot() {
  const i = await chrome.storage.local.get({ blocklist: {}, likelist: {}, karmoSettings: {} });
  return { version: 1, exportedAt: new Date().toISOString(), block: i.blocklist, like: i.likelist, settings: i.karmoSettings };
}

function countUsers(map) {
  return Object.values(map || {}).reduce((n, users) => n + Object.keys(users || {}).length, 0);
}

/** JSON 을 다운로드 폴더 하위 파일로 (MV3 워커에는 createObjectURL 이 없어 데이터 주소) */
async function downloadJson(file, obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 2) + String.fromCharCode(10));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  await chrome.downloads.download({ url: "data:application/json;base64," + btoa(bin), filename: file, conflictAction: "overwrite", saveAs: false });
}

/** 목록 파일로 내보내고 결과를 storage 에 남김 */
async function exportUserlists() {
  const snap = await userlistsSnapshot();
  const state = { at: snap.exportedAt, block: countUsers(snap.block), like: countUsers(snap.like), file: UL_FILE };
  try {
    await downloadJson(UL_FILE, snap);
  } catch (e) {
    state.error = String(e && e.message ? e.message : e);
  }
  await chrome.storage.local.set({ [UL_STATE]: state });
  return state;
}

/** 취향 통계 파일. 본 글과 연 글이 많은 유저 상위만 */
async function exportStats() {
  const i = await chrome.storage.local.get({ karmoStats: null });
  const all = (i.karmoStats && i.karmoStats.users) || {};
  const top = Object.entries(all)
    .sort((a, b) => b[1].seen + b[1].opened - (a[1].seen + a[1].opened))
    .slice(0, UL_STATS_USERS);
  if (!top.length) return { skipped: true };
  await downloadJson(UL_STATS_FILE, { version: 1, exportedAt: new Date().toISOString(), users: Object.fromEntries(top) });
  return { users: top.length };
}

/* 워커에서만 구독. 설정 창은 export 함수만 씀 */
if (typeof importScripts === "function") {
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.blocklist || ch.likelist || ch.karmoSettings)) chrome.alarms.create(UL_ALARM, { delayInMinutes: 0.1 });
  });
  chrome.alarms.get(UL_STATS_ALARM, (a) => {
    if (!a) chrome.alarms.create(UL_STATS_ALARM, { delayInMinutes: 5, periodInMinutes: 1440 });
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === UL_ALARM) exportUserlists();
    if (a.name === UL_STATS_ALARM) exportStats();
  });
}
