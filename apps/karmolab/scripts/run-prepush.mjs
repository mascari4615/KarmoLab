#!/usr/bin/env node
/** push 전 빠른 검사. 목록은 `lib/gate-sets.mjs` 한 곳에 있다(두 벌이면 갈라진다). */
import { spawnSync } from 'node:child_process';
import { PREPUSH } from './lib/gate-sets.mjs';

// 훅의 상대 Git 경로가 하위 폴더를 새 저장소 루트로 만들지 않도록 자동 탐색 사용
const env = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[key];
const r = spawnSync(process.execPath, ['scripts/run-gates.mjs', ...PREPUSH], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
