#!/usr/bin/env node
/** push 전 빠른 검사. 목록은 `lib/gate-sets.mjs` 한 곳에 있다(두 벌이면 갈라진다). */
import { spawnSync } from 'node:child_process';
import { PREPUSH } from './lib/gate-sets.mjs';

// 훅의 상대 Git 경로가 하위 폴더를 새 저장소 루트로 만들지 않도록 자동 탐색 사용
const env = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[key];
// 새 lane의 생성물 누락과 이전 빌드 잔존 방지, 실패 시 검사 실행 중단
const built = spawnSync(process.execPath, ['build.mjs'], { stdio: 'pipe', env, encoding: 'utf8' });
if (built.status !== 0) {
  console.error('[prepush] 검사 생성물 빌드 실패');
  console.error(built.error?.message || built.stderr || built.stdout);
  process.exit(built.status || 1);
}
console.log('[prepush] 검사 생성물 빌드 완료');
const r = spawnSync(process.execPath, ['scripts/run-gates.mjs', ...PREPUSH], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
