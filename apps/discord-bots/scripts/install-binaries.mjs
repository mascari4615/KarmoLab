#!/usr/bin/env node
/**
 * 봇 음성용 실행 파일 둘 (ffmpeg, yt-dlp) 받기
 *
 * - .npmrc 의 ignore-scripts 설정으로 npm 설치 때 패키지 설치 스크립트 안 돎 (공급망 방어, 정본 memo systems/security.md)
 * - 두 패키지만 여기서 명시 실행. 이미 있으면 건너뜀, --force 면 다시 받음
 * - 종료 코드: 0 둘 다 있음, 1 받기 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
const force = process.argv.includes('--force');

function binaryOf(name) {
  try {
    if (name === 'ffmpeg-static') return require('ffmpeg-static');
    if (name === 'youtube-dl-exec') return require('youtube-dl-exec/src/constants.js').YOUTUBE_DL_PATH;
  } catch {
    return null;
  }
  return null;
}

const ALLOWED = ['ffmpeg-static', 'youtube-dl-exec'];
const missing = ALLOWED.filter((name) => {
  const bin = binaryOf(name);
  return force || !bin || !fs.existsSync(bin);
});

if (missing.length === 0) {
  console.log('[binaries] ffmpeg, yt-dlp 이미 있음');
  process.exit(0);
}

console.log(`[binaries] 설치 스크립트 명시 실행: ${missing.join(', ')}`);
const args = ['rebuild', '--ignore-scripts=false', ...missing];
const opts = { cwd: root, stdio: 'inherit', env: { ...process.env, YOUTUBE_DL_SKIP_PYTHON_CHECK: '1' } };
/* npm run 으로 불리면 npm_execpath 가 npm-cli.js 다. 셸 없이 node 로 직접 부른다. */
const cli = process.env.npm_execpath;
const r = cli && cli.endsWith('.js')
  ? spawnSync(process.execPath, [cli, ...args], opts)
  : spawnSync(`npm ${args.join(' ')}`, { ...opts, shell: true });
const still = missing.filter((name) => {
  const bin = binaryOf(name);
  return !bin || !fs.existsSync(bin);
});
if (r.status !== 0 || still.length > 0) {
  console.error(`[binaries] 실패: ${still.join(', ') || `npm rebuild exit ${r.status}`}`);
  process.exit(1);
}
console.log('[binaries] 완료');
