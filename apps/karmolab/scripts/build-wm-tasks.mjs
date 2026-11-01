/**
 * build-wm-tasks: memo/wm/{apps,features}/*.md 머리말 stage → apps/karmolab/data/wm-tasks.json (TASK-KL-171)
 *
 * 왜: 지금 뭘 만들고 있나를 웹에 두면, 보러 온 사람이 이 게임이 어디쯤 왔는지 안다.
 * 소식(devlog)은 **끝난 것**만 보여 준다. 이쪽은 **하는 중 / 할 것**을 보여 준다.
 * 개발 보드를 따로 쓰면 밀림. 이미 쓰는 정본 문서의 머리말을 그대로 읽음
 *
 * 2026-11-02: 수집원을 사라진 `memo/wm/tasks` 에서 지금 문서 모델의 App, Feature 로 바꿈.
 * 옛 수집원이 없어 산출이 옛 TASK 목록에 굳어 있었음 (정본 wm-hub 공백). System 은 개발 내부라 뺌
 *
 * 무엇이 나가나: 머리말에 `web: private` 이 붙은 문서만 뺀다(문서가 정한다).
 * 본문 제외. 제목, 단계만. 본문의 스포일러가 나갈 길 없음
 *
 * memo 가 없으면(다른 컴퓨터, CI) 커밋된 산출을 그대로 쓴다.
 *
 * 사용: node scripts/build-wm-tasks.mjs
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const KARMOLAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(KARMOLAB_ROOT, '../..');
const MEMO_PATH = process.env.KARMODDRINE_MEMO_PATH || path.resolve(REPO_ROOT, '../memo');
const SOURCE_DIRS = ['apps', 'features'];
const OUT_PATH = path.join(KARMOLAB_ROOT, 'data/wm-tasks.json');

/** 사람이 읽는 단계 이름. 모르는 단계는 그대로. 단계 집합은 열려 있다. */
const STATUS_LABEL = {
  building: '만드는 중',
  live: '나와 있음',
  proposed: '구상',
  paused: '멈춤',
  retired: '접음',
};
/** 화면에 세우는 순서. 만드는 중이 맨 위. */
const ORDER = ['building', 'live', 'proposed', 'paused', 'retired'];

function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') break;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(t);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** 파일 첫 H1 = 사람이 읽는 제목. 없으면 파일명에서 만든다. */
function titleOf(text, file) {
  const m = text.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(file, '.md').replace(/-/g, ' ');
}

async function main() {
  const roots = SOURCE_DIRS.map((d) => path.join(MEMO_PATH, 'wm', d)).filter((d) => fs.existsSync(d));
  if (roots.length === 0) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`[wm-tasks] memo 도 없고 커밋된 산출도 없다: ${OUT_PATH}`);
      process.exit(1);
    }
    const prev = JSON.parse(await fsp.readFile(OUT_PATH, 'utf8'));
    /* 바닥 (2026-08-14). 아래 갈래에는 보여 줄 항목 0건이면 실패가 있는데 이 갈래엔 없었다.
     * CI 는 언제나 이 갈래로 온다(memo 는 비공개). 비면 배포는 초록, 화면은 백지다. */
    const kept = prev.counts?.shown;
    if (typeof kept !== 'number' || kept < 1) {
      console.error(`[wm-tasks] ❌ 커밋된 산출에 보여 줄 항목이 ${kept ?? '?'}건이다. memo 가 없다가 아니라 **산출이 비었다**.`);
      console.error('[wm-tasks]   memo 가 있는 기계에서 `npm run build:wm-tasks` 를 돌려 다시 커밋할 것.');
      process.exit(1);
    }
    console.log(`[wm-tasks] memo 없음. 커밋된 산출 사용 (${kept}건)`);
    return;
  }

  const files = [];
  for (const root of roots) {
    for (const name of await fsp.readdir(root)) {
      if (name.endsWith('.md') && name.toLowerCase() !== 'readme.md') files.push(path.join(root, name));
    }
  }

  const groups = new Map();
  let skipped = 0;
  let total = 0;
  for (const f of files) {
    const text = await fsp.readFile(f, 'utf8');
    const meta = frontmatter(text);
    total++;
    if (String(meta.web || '').trim() === 'private') { skipped++; continue; }
    const status = String(meta.stage || 'proposed').trim();
    const item = {
      id: String(meta.id || path.basename(f, '.md')),
      title: titleOf(text, f),
      status,
      statusLabel: STATUS_LABEL[status] || status,
      priority: '',
      updated: '',
    };
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(item);
  }

  const ordered = [...groups.entries()]
    .sort((a, b) => {
      const ia = ORDER.indexOf(a[0]);
      const ib = ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([status, items]) => {
      items.sort((x, y) => x.id.localeCompare(y.id));
      return { status, label: STATUS_LABEL[status] || status, count: items.length, items };
    });

  const shown = ordered.reduce((n, g) => n + g.items.length, 0);
  if (shown === 0) {
    console.error(`[wm-tasks] 보여 줄 항목이 0건. 수집이 깨진 것 아닌지 확인 (문서 ${total}개 읽음)`);
    process.exit(1);
  }

  const out = {
    source: 'memo/wm/apps, memo/wm/features',
    counts: { docs: total, groups: ordered.length, shown, hidden: skipped },
    groups: ordered,
  };
  const next = JSON.stringify(out, null, 2) + '\n';
  const prevText = fs.existsSync(OUT_PATH) ? await fsp.readFile(OUT_PATH, 'utf8') : '';
  if (prevText === next) {
    console.log(`[wm-tasks] 그대로. ${shown}건 / 무리 ${ordered.length}개`);
    return;
  }
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, next, 'utf8');
  console.log(`[wm-tasks] 씀: data/wm-tasks.json. ${shown}건 / 무리 ${ordered.length}개 (문서 ${total}, 숨김 ${skipped})`);
}

main().catch((err) => {
  console.error('[wm-tasks] 실패:', err);
  process.exit(1);
});
