/**
 * 차단, 좋아요 목록과 설정을 다운로드 폴더의 파일로 내보냄. background.js 가 importScripts, 설정 창도 로드
 *
 * 왜 다운로드: MV3 확장은 임의 경로에 못 쓰고, 로컬 수신 서버는 늘 떠 있지 않다 (schedule.js 와 같은 이유)
 * 파일: 다운로드/karmo-userlists/userlists.json, 같은 이름으로 덮어씀. memo 로 옮기는 쪽은 memo/scripts/userlists-harvest.mjs
 * 시점: 목록이나 설정이 바뀐 뒤 잠시 (알람) 한 번. 변경이 잇따르면 마지막 한 번만
 * 정본: memo/systems/karmo-dev-extension.md
 */

const UL_DIR = "karmo-userlists";
const UL_FILE = `${UL_DIR}/userlists.json`;
const UL_ALARM = "karmo.userlists";
const UL_STATE = "karmo.userlistsExport";

/** 파일 내용 형태. 가져오기도 이 형태를 읽음 */
async function userlistsSnapshot() {
  const i = await chrome.storage.local.get({ blocklist: {}, likelist: {}, karmoSettings: {} });
  return { version: 1, exportedAt: new Date().toISOString(), block: i.blocklist, like: i.likelist, settings: i.karmoSettings };
}

function countUsers(map) {
  return Object.values(map || {}).reduce((n, users) => n + Object.keys(users || {}).length, 0);
}

/** 파일로 내보내고 결과를 storage 에 남김 */
async function exportUserlists() {
  const snap = await userlistsSnapshot();
  const bytes = new TextEncoder().encode(JSON.stringify(snap, null, 2) + String.fromCharCode(10));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const url = "data:application/json;base64," + btoa(bin);
  const state = { at: snap.exportedAt, block: countUsers(snap.block), like: countUsers(snap.like), file: UL_FILE };
  try {
    await chrome.downloads.download({ url, filename: UL_FILE, conflictAction: "overwrite", saveAs: false });
  } catch (e) {
    state.error = String(e && e.message ? e.message : e);
  }
  await chrome.storage.local.set({ [UL_STATE]: state });
  return state;
}

/* 워커에서만 구독. 설정 창은 exportUserlists 만 씀 */
if (typeof importScripts === "function") {
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.blocklist || ch.likelist || ch.karmoSettings)) chrome.alarms.create(UL_ALARM, { delayInMinutes: 0.1 });
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === UL_ALARM) exportUserlists();
  });
}
