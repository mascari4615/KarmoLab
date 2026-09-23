/**
 * 지어 놓은 사이트 하나 (`apps/blog/_site`) 를 배포 셋으로 가른다 (memo change.site-split, 2026-09-23)
 *
 * 왜: Pages 한 채는 뿌리가 하나. 주소마다 첫 화면이 다르려면 배포도 그만큼
 * 지금까지는 Worker 가 뿌리를 가려 줌. 그건 임시, 이게 근본
 *
 * 무엇을 하나: `_site` 를 그대로 셋으로 복사하고 **뿌리 한 장만** 교체
 *   dist/lab 의 뿌리는 KarmoLab 셸 (`_site/index.html`)
 *   dist/blog 의 뿌리는 글 목록 (`_site/posts/index.html`)
 *   dist/dash 의 뿌리는 대시보드 front (`_site/dash/index.html`)
 * 공용 자산 (`apps/`, `t/`, `assets/`, `posts/`) 은 셋 다 그대로 들고 간다. 한 벌씩 더 나가지만
 * 주소가 안 깨짐 (`/t/<도구>/` 를 blog 에서 열어도 뜸). 가르는 규칙은 뿌리 한 줄뿐
 * 사용: node scripts/split-outputs.mjs [--site ../blog/_site] [--out ../blog/dist]

 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const SITE = argOf('--site', path.join(APP_ROOT, '..', 'blog', '_site'));
const OUT = argOf('--out', path.join(APP_ROOT, '..', 'blog', 'dist'));

/** 앱마다 뿌리로 쓸 장. 없으면 그 앱은 안 만든다 (배포가 빈 채로 나가지 않게) */
const APPS = [
  { id: 'lab', root: 'index.html' },
  { id: 'blog', root: path.join('posts', 'index.html') },
  { id: 'dash', root: path.join('dash', 'index.html') },
];

/** 한 앱에만 속한 장. 다른 앱에서 열면 제 주인에게 넘긴다 (Cloudflare Pages `_redirects`). 소개는 blog 소속 (2026-09-23) */
const OWNED = [{ path: '/about/', owner: 'blog', to: 'https://blog.mascari4615.com/about/' }];

if (!fs.existsSync(SITE)) {
  console.error(`[split-outputs] 지어 놓은 사이트가 없다: ${SITE}. 먼저 assemble-site.mjs`);
  process.exit(2);
}

fs.rmSync(OUT, { recursive: true, force: true });
const made = [];
for (const app of APPS) {
  const rootFile = path.join(SITE, app.root);
  if (!fs.existsSync(rootFile)) {
    console.error(`[split-outputs] ${app.id}: 뿌리로 쓸 장이 없다 (${app.root})`);
    process.exit(1);
  }
  const dest = path.join(OUT, app.id);
  fs.cpSync(SITE, dest, { recursive: true });
  fs.copyFileSync(rootFile, path.join(dest, 'index.html'));
  /* 남의 장은 파일도 뺀다. 정적 파일이 있으면 넘김보다 먼저 나갈 수 있어 한쪽만 믿지 않는다 */
  const foreign = OWNED.filter((o) => o.owner !== app.id);
  for (const o of foreign) fs.rmSync(path.join(dest, o.path), { recursive: true, force: true });
  const moves = foreign.flatMap((o) => [
    `${o.path} ${o.to} 301`,
    `${o.path.replace(/\/$/, '')} ${o.to} 301`,
  ]);
  if (moves.length) fs.appendFileSync(path.join(dest, '_redirects'), moves.join('\n') + '\n');
  const files = fs.readdirSync(dest).length;
  made.push(`${app.id} (뿌리 ${app.root}, 첫 단 ${files}개)`);
}
console.log(`[split-outputs] 배포 ${made.length}벌 → ${OUT}\n  - ${made.join('\n  - ')}`);
