/**
 * 주기 수집과 파일 내보내기. background.js 가 importScripts
 *
 * 왜 다운로드인가: MV3 워커에는 URL.createObjectURL 이 없고, 로컬 수신 서버는
 * 늘 떠 있지 않다. 다운로드 폴더는 늘 있다. 수확은 memo/scripts/harvest-browser-dumps.mjs
 * 정본: memo/systems/karmo-web-extension.md
 */

const DUMP_DIR = "karmo-taste";
const ALARM = "karmo.collect.daily";
const STATE_KEY = "karmo.lastCollect";

/** 갈래별 파일 이름과 열 순서. 기존 raw TSV 헤더와 같아야 한다 */
const SPECS = {
  "youtube-history": ["id", "day", "duration", "channel", "title"],
  "chzzk-follows": ["name", "id", "followers", "notify", "followedAt"],
  "soop-favorites": [
    ["name", "name"],
    ["fanclub", "fanclub"],
    ["subscribe", "subscribe"],
    ["last_broadcast", "lastBroadcast"],
  ],
  "x-accounts": ["handle", "name", "kind", "followedAt", "bio"],
};

/** 탭 문자와 줄바꿈은 칸을 깨뜨린다. 공백 하나로 */
function cell(v) {
  return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
}

function toTsv(kind, rows) {
  const spec = SPECS[kind].map((c) => (Array.isArray(c) ? c : [c, c]));
  const head = spec.map((c) => c[0]).join("\t");
  const body = (rows || []).map((r) => spec.map((c) => cell(r[c[1]])).join("\t"));
  return [head, ...body].join("\n") + "\n";
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * TSV 를 다운로드 폴더 하위로
 * @param {string} kind SPECS 의 갈래
 * @param {Array<object>} rows 수집 결과
 * @returns {Promise<{file:string,count:number}>}
 */
async function dumpTsv(kind, rows) {
  const text = toTsv(kind, rows);
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const url = "data:text/tab-separated-values;base64," + btoa(bin);
  const file = `${DUMP_DIR}/${today()}-${kind}.tsv`;
  await chrome.downloads.download({ url, filename: file, conflictAction: "overwrite", saveAs: false });
  return { file, count: (rows || []).length };
}

/**
 * 한 갈래가 실패해도 나머지는 받음
 * X 는 여기 없다. 653 중 11 만 나오고 바퀴를 잡는다 (2026-09-21)
 */
async function collectAll() {
  const jobs = [
    ["youtube-history", () => collectYoutubeHistory(200)],
    ["chzzk-follows", async () => (await runInTab("https://chzzk.naver.com/", "follows.js", "collectChzzkFollows")).rows],
    ["soop-favorites", () => runInTab("https://www.sooplive.com/my/favorite", "follows.js", "collectSoopFavorites")],
  ];
  const out = [];
  for (const [kind, run] of jobs) {
    try {
      const rows = await run();
      out.push({ kind, ...(await dumpTsv(kind, rows)) });
    } catch (e) {
      out.push({ kind, error: String(e && e.message ? e.message : e) });
    }
  }
  await chrome.storage.local.set({ [STATE_KEY]: { at: new Date().toISOString(), results: out } });
  return out;
}

chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: 360 });

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== ALARM) return;
  const st = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
  const last = st && st.at ? Date.parse(st.at) : 0;
  if (Date.now() - last < 20 * 60 * 60 * 1000) return; // 하루 한 번
  await collectAll();
});
