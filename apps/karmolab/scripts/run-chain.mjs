/**
 * `npm run a && npm run b && ...` 사슬을 npm 없이 차례로 (2026-09-25)
 *
 * 왜: `build` 는 38단계 사슬. 단계마다 npm.cmd 와 셸 기동이 붙는다 (2026-08-29 실측 한 번에 약 2.7초,
 *   run-gates.mjs 의 directCommand 머리말). 35단계가 `node scripts/x.mjs` 한 줄이라 node 직접 호출
 * 지키는 것: `&&` 의미 그대로. 첫 실패에서 멈추고 그 종료 코드로 끝냄. 순서도 그대로
 * 못 가르는 모양 (따옴표, 파이프, 셸 문법) 은 npm 길 그대로
 *
 *   node scripts/run-chain.mjs build            package.json 의 build 사슬
 *   node scripts/run-chain.mjs build --times    단계별 시간 표
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')).scripts ?? {};
const SIMPLE_NODE = /^node((?: +[^\s&|<>;"'`$()]+)+)$/;
const NPM_RUN = /^npm run ([\w:.-]+)$/;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tscBin = path.join(appRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const target = process.argv[2];
const showTimes = process.argv.includes('--times');
if (!target || !scripts[target]) {
  console.error(`[run-chain] package.json 에 없는 이름: ${target ?? '(없음)'}`);
  process.exit(2);
}

const times = [];

/** 한 줄 명령을 가능한 한 node 로 바로. 못 가르면 셸 */
function runStep(step, label) {
  const started = Date.now();
  let r;
  const node = SIMPLE_NODE.exec(step);
  if (node) {
    r = spawnSync(process.execPath, node[1].trim().split(/ +/), { cwd: appRoot, stdio: 'inherit' });
  } else if (step === 'tsc --noEmit' && existsSync(tscBin)) {
    r = spawnSync(process.execPath, [tscBin, '--noEmit'], { cwd: appRoot, stdio: 'inherit' });
  } else {
    r = spawnSync(step, { cwd: appRoot, stdio: 'inherit', shell: true });
  }
  times.push({ label, ms: Date.now() - started });
  return r.status ?? 1;
}

/** 이름 하나를 펼쳐 돈다. 몸이 사슬이면 다시 펼친다 */
function runScript(name, depth = 0) {
  const body = (scripts[name] ?? '').trim();
  if (depth > 6) return runStep(`${npm} run --silent ${name}`, name);
  if (!body.includes('&&')) {
    console.log(`\n> ${name}`);
    return runStep(body, name);
  }
  for (const part of body.split('&&').map((x) => x.trim())) {
    const m = NPM_RUN.exec(part);
    const status = m && scripts[m[1]] !== undefined ? runScript(m[1], depth + 1) : (console.log(`\n> ${part}`), runStep(part, part));
    if (status !== 0) return status;
  }
  return 0;
}

const started = Date.now();
const status = runScript(target);
if (showTimes) {
  console.log(`\n[run-chain] ${target} ${Math.round((Date.now() - started) / 1000)}초, ${times.length}단계. 긴 것:`);
  for (const t of [...times].sort((a, b) => b.ms - a.ms).slice(0, 12)) console.log(`  ${String(Math.round(t.ms / 100) / 10).padStart(6)}s  ${t.label}`);
}
process.exit(status);
