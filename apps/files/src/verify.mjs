#!/usr/bin/env node
/**
 * 본문을 안 받고 전체를 맞춘다. 색인 한 번, 원격 목록 한 판, MD5 장부.
 *
 * 쓰기: node src/verify.mjs [--verbose]
 * 종료 0 전부 MD5 같음, 1 어긋남 (못 연 장부 조각 포함), 2 못 돌림,
 * 3 어긋남은 없으나 MD5 기록이 없는 청크가 남음 (있는지와 크기까지만 확인).
 */
import { openForCheck } from './open-session.mjs';
import { checkRemote, failed, partial, summary } from './remote-check.mjs';

const verbose = process.argv.includes('--verbose');
const t0 = performance.now();
let got;
try {
  got = await openForCheck();
} catch (e) {
  console.error('[verify] 못 돌림.', String(e?.message ?? e).slice(0, 200));
  process.exit(2);
}
const r = checkRemote(got.session.index.files, got.sums, got.listing);
for (const line of summary(r)) console.log('[verify]', line);
console.log(`[verify] 장부 조각 ${got.segments}, 못 연 조각 ${got.badSegments.length}`);
const sec = (ms) => (ms / 1000).toFixed(1);
console.log(`[verify] 목록 ${sec(got.listMs)}초, 전체 ${sec(performance.now() - t0)}초. 본문 다운로드 없음`);
if (verbose) {
  const groups = { 없음: r.missing, '크기 다름': r.size, 'MD5 다름': r.md5, 미리보기: r.thumbs.bad };
  for (const [name, rows] of Object.entries(groups)) {
    for (const x of rows.slice(0, 50)) console.log(`  ${name} ${x.key} ${x.path}`);
  }
}
if (r.orphans) console.log('[verify] 색인 밖 객체는 실패로 안 친다. 색인 줄이 사라진 사고도 여기로 온다. 직전 값과 비교');
process.exit(failed(r) || got.badSegments.length ? 1 : partial(r) ? 3 : 0);
