import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INPUTS, contract, normalize } from '../scripts/release-contract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const launch = JSON.parse(readFileSync(join(root, 'karmo-launch.json'), 'utf8'));

/**
 * 실행 설정은 묶음과 같이 나감 (2026-11-21)
 *
 * - 런처 목록 (manifest.json) 은 main 에서 바로 읽혀 이미 깔린 옛 묶음에도 적용
 * - 사고: 터미널 숨김이 목록에만 있어, 숨김을 모르는 옛 start.cmd 가 안 보이는 창에서 멈춰 설치 폴더를 쥠. 업데이트 막힘
 * - 고침: 설정을 아는 묶음이 karmo-launch.json 으로 설정을 들고 다님. 런처는 설치된 묶음의 그 파일만 믿음
 */
test('실행 설정 파일이 런처가 읽는 모양이다', () => {
  assert.equal(launch.schema, 1);
  assert.equal(typeof launch.entry, 'string');
  assert.equal(typeof launch.exe, 'string');
  assert.ok(existsSync(join(root, launch.entry)), `시작 파일이 없다: ${launch.entry}`);
  for (const [k, v] of Object.entries(launch.env ?? {})) assert.equal(typeof v, 'string', `env.${k} 는 글자여야 한다`);
});

test('터미널을 숨기는 묶음은 시작 파일에도 숨김을 알린다', () => {
  if (launch.console !== 'hidden') return;
  // 숨긴 창의 pause 는 아무도 못 닫음. start.cmd 가 이 값을 보고 알림 창으로 바꿈
  assert.equal(launch.env?.COMPANION_CONSOLE, 'hidden');
  assert.match(readFileSync(join(root, launch.entry), 'utf8'), /COMPANION_CONSOLE/);
});

test('구운 묶음에 실행 설정과 릴리스 판 번호가 들어간다', () => {
  const out = mkdtempSync(join(tmpdir(), 'companion-pack-'));
  try {
    execFileSync(process.execPath, [join(root, 'scripts', 'pack.mjs'), out], {
      env: { ...process.env, COMPANION_PACK_VERSION: '9.8.7' },
      stdio: 'pipe',
      windowsHide: true,
    });
    const packed = JSON.parse(readFileSync(join(out, 'karmo-launch.json'), 'utf8'));
    assert.deepEqual(packed, launch);
    assert.ok(existsSync(join(out, packed.entry)), '묶음 안에 시작 파일이 있다');
    assert.equal(JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).version, '9.8.7');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('릴리스 계약: 판 번호만 바뀌면 같은 값, 내용이 바뀌면 다른 값', () => {
  const a = normalize('packages/companion/package.json', Buffer.from('{\n  "name": "companion",\n  "version": "0.2.0",\n  "x": 1\n}\n'));
  const b = normalize('packages/companion/package.json', Buffer.from('{\r\n  "name": "companion",\r\n  "version": "0.3.5",\r\n  "x": 1\r\n}\r\n'));
  const c = normalize('packages/companion/package.json', Buffer.from('{\n  "name": "companion",\n  "version": "0.2.0",\n  "x": 2\n}\n'));
  assert.ok(a.equals(b), '판 번호와 줄 끝은 값에 안 들어간다');
  assert.ok(!a.equals(c));

  const lockA = 'name = "karmolab-desktop"\nversion = "0.1.149"\n\nname = "companion-window"\nversion = "0.1.0"\n\nname = "serde"\nversion = "1.0.0"\n';
  const lockB = lockA.replace('0.1.149', '0.1.150');
  const lockC = lockA.replace('1.0.0', '1.0.1');
  const lock = (s) => normalize('apps/karmolab-tauri/Cargo.lock', Buffer.from(s)).toString();
  assert.equal(lock(lockA), lock(lockB), 'KarmoLab 판이 올라도 KarmoMaid 는 그대로');
  assert.notEqual(lock(lockA), lock(lockC), '다른 패키지 판이 바뀌면 다른 묶음');
});

test('릴리스 계약: 시험 파일은 입력이 아니고, 적힌 입력은 다 있다', () => {
  assert.ok(!INPUTS.some((p) => p.startsWith('packages/companion/test')), '시험만 고친 push 로 판이 나가면 안 된다');
  assert.ok(INPUTS.includes('packages/companion/karmo-launch.json'));
  assert.ok(INPUTS.includes('apps/karmolab-tauri/src-tauri-companion'));
  const one = contract();
  assert.match(one.hash, /^[0-9a-f]{64}$/);
  assert.equal(contract().hash, one.hash);
});
