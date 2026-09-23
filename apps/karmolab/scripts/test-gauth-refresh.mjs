/**
 * Google 연결 토큰 (`src/widgets/planner/gauth.ts`). 한 시간 토큰이 끝나도 갱신 토큰으로 창 없이 이어지는가.
 *
 * 옛 `test-mydash-calendar` (dash 캘린더 패널) 가 들고 있던 갱신 두 경우를 옮겼다. 그 패널은
 * 2026-09-23 플래너로 대체돼 지워졌다 (사용자 "플래너로 합쳐줘").
 *
 * 사용: node scripts/test-gauth-refresh.mjs   (npm run test:gauth)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
function check(label, ok, detail) {
  if (ok) console.log('  ok   ' + label);
  else {
    failed++;
    console.log('  FAIL ' + label + (detail ? '  ' + detail : ''));
  }
}

async function load(rel) {
  const stamp = 'gauth-' + Date.now();
  const entry = path.join(os.tmpdir(), stamp + '.ts');
  fs.writeFileSync(entry, 'export * from ' + JSON.stringify(path.join(root, rel)) + ';\n');
  const out = path.join(os.tmpdir(), stamp + '.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const box = new Map();
globalThis.localStorage = {
  getItem: (k) => (box.has(k) ? box.get(k) : null),
  setItem: (k, v) => box.set(k, String(v)),
  removeItem: (k) => box.delete(k),
  clear: () => box.clear(),
};
globalThis.window = globalThis;

const G = await load('src/widgets/planner/gauth.ts');

/* ── 갱신 토큰만 있으면 릴레이를 한 번 불러 새 접근 토큰 ── */
{
  box.clear();
  box.set('karmolab_google_refresh', 'rt-1');
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ access_token: 'fresh', expires_in: 3599 }) };
  };
  const tok = await G.ensureToken();
  check('갱신 토큰으로 새 접근 토큰', tok === 'fresh', String(tok));
  check('릴레이 /google/refresh 한 번, 갱신 토큰 실음', calls.length === 1 && calls[0].url.endsWith('/google/refresh') && calls[0].body.refresh_token === 'rt-1', JSON.stringify(calls));
  check('새 접근 토큰을 저장', JSON.parse(box.get('karmolab_google_token') || '{}').access_token === 'fresh');
  check('갱신 토큰은 그대로', box.get('karmolab_google_refresh') === 'rt-1');
  const again = await G.ensureToken();
  check('살아 있는 토큰이면 릴레이를 다시 안 부른다', again === 'fresh' && calls.length === 1);
}

/* ── invalid_grant 면 갱신 토큰을 버리고 null ── */
{
  box.clear();
  box.set('karmolab_google_refresh', 'rt-dead');
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
  const tok = await G.ensureToken();
  check('invalid_grant 면 null', tok === null);
  check('죽은 갱신 토큰은 지운다', !box.has('karmolab_google_refresh'));
}

/* ── 둘 다 없으면 릴레이를 부르지 않는다 ── */
{
  box.clear();
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    throw new Error('부르면 안 됨');
  };
  check('토큰 없으면 null, 요청 0', (await G.ensureToken()) === null && n === 0);
}

console.log(failed ? '[gauth] ' + failed + '개 어긋남' : '[gauth] 통과');
process.exit(failed ? 1 : 0);
