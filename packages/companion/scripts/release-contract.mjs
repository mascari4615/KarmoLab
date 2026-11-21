#!/usr/bin/env node
/**
 * KarmoMaid 묶음 (companion-<판>.zip) 입력의 해시
 *
 * - 쓰는 곳: 릴리스 워크플로 .github/workflows/companion-release.yml. 지난 판과 값이 같으면 굽지 않음
 * - 시험 파일이나 문서만 바뀐 push, KarmoLab 판 번호만 오른 Cargo.lock 은 새 판 없음
 * - KarmoLab 쪽 짝: apps/karmolab-tauri/scripts/contract-hash.mjs
 * - 창 프로그램 (src-tauri-companion) 은 이 묶음 전용이라 여기서만 잼
 *
 *   node scripts/release-contract.mjs          해시 한 줄
 *   node scripts/release-contract.mjs --list   파일별 해시
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 저장소 뿌리 기준. pack.mjs 가 담는 것과 창 프로그램을 굽는 데 쓰는 것 */
export const INPUTS = [
  'packages/companion/src',
  'packages/companion/demo',
  'packages/companion/characters',
  'packages/companion/assets',
  'packages/companion/scripts/pack.mjs',
  'packages/companion/scripts/live.mjs',
  'packages/companion/scripts/get-voice.mjs',
  'packages/companion/scripts/check-node.mjs',
  'packages/companion/scripts/start.cmd',
  'packages/companion/karmo-launch.json',
  'packages/companion/package.json',
  'packages/companion/package-lock.json',
  'packages/companion/tsconfig.json',
  'packages/companion/README.md',
  'packages/ai/dist',
  'packages/ai/package.json',
  'apps/karmolab-tauri/Cargo.toml',
  'apps/karmolab-tauri/Cargo.lock',
  'apps/karmolab-tauri/src-tauri-companion',
  'vendor/glib-0.18.5/Cargo.toml',
  'vendor/glib-0.18.5/src',
  'vendor/rand-0.7.3/Cargo.toml',
  'vendor/rand-0.7.3/src',
];

const SKIP_DIR = new Set(['target', 'node_modules', 'gen', '_generated']);

function walk(abs, out) {
  if (statSync(abs).isFile()) {
    out.push(abs);
    return;
  }
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIR.has(name)) continue;
    walk(join(abs, name), out);
  }
}

/** 판 번호와 줄 끝을 지움. 판 번호가 남으면 같은 내용이 매번 다른 해시가 됨 */
export function normalize(rel, buf) {
  if (buf.includes(0)) return buf; // 바이너리 (동작 파일, 아이콘) 는 그대로
  let text = buf.toString('utf8').replace(/\r\n/g, '\n');
  if (rel === 'apps/karmolab-tauri/Cargo.lock') {
    text = text.replace(/(name = "(?:karmolab[\w-]*|companion[\w-]*)"\nversion = )"[^"]*"/g, '$1"<판>"');
  } else if (rel === 'packages/companion/package.json') {
    text = text.replace(/("version"\s*:\s*)"[^"]*"/, '$1"<판>"');
  } else if (rel === 'packages/companion/package-lock.json') {
    // 맨 위와 packages[""] 의 판 번호 둘. 다른 패키지 판은 그대로
    text = text.replace(/^(\{\n\s*"name": "companion",\n\s*"version": )"[^"]*"/, '$1"<판>"');
    text = text.replace(/("": \{\n\s*"name": "companion",\n\s*"version": )"[^"]*"/, '$1"<판>"');
  }
  return Buffer.from(text, 'utf8');
}

export function contract(repo = REPO) {
  const files = [];
  for (const entry of INPUTS) {
    const abs = join(repo, entry);
    if (!existsSync(abs)) throw new Error(`묶음 입력이 없음: ${entry}`);
    walk(abs, files);
  }
  const total = createHash('sha256');
  const rows = [];
  for (const abs of files) {
    const rel = relative(repo, abs).split(sep).join('/');
    const one = createHash('sha256').update(normalize(rel, readFileSync(abs))).digest('hex');
    total.update(`${rel}\n${one}\n`);
    rows.push(`${one.slice(0, 12)}  ${rel}`);
  }
  return { hash: total.digest('hex'), rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { hash, rows } = contract();
  if (process.argv.includes('--list')) {
    for (const row of rows) console.log(row);
    console.log(`--- ${rows.length}개 파일`);
  }
  console.log(hash);
}
