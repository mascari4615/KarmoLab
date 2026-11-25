/**
 * 상주 읽기. 청크마다 `rclone cat` 을 띄우면 매번 폴더를 처음부터 찾는다 (11번 왕복, 4~5초).
 * 한 프로세스가 찾은 폴더를 기억하면 순차 읽기가 절반 아래다 (2026-11-26 실측 5.3초, 2.2초).
 *
 * 쓰기용 데몬(5572)과 공유 안 함. 빈 포트, 매번 새 비밀번호, 부모 종료 때 같이 종료
 * 비밀번호는 명령줄이 아니라 자식 환경 변수로 전달
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export function serveUrl(url, remote, key) {
  return `${url}/${encodeURIComponent(`[${remote}]`)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** 요청과 검사만. 시험은 fetchFn 을 바꿔 낀다 */
export function readerOver(url, remote, { headers = {}, fetchFn = fetch } = {}) {
  const base = String(remote).replace(/\/+$/, '');
  async function ask(key, status, extra = {}) {
    const r = await fetchFn(serveUrl(url, base, key), {
      headers: { 'accept-encoding': 'identity', ...headers, ...extra },
    });
    if (r.status !== status) {
      await r.body?.cancel();
      throw new Error(`serve ${r.status}`);
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const want = r.headers.get('content-length');
    if (want !== null && bytes.length !== Number(want)) throw new Error('serve short');
    return bytes;
  }
  return {
    /** 통째로. 없음인지 고장인지는 여기서 안 가른다. 부르는 쪽이 cat 으로 되물어 정한다 */
    get: (key) => ask(key, 200),
    /** 앞 n 바이트만 */
    async head(key, n) {
      const bytes = await ask(key, 206, { range: `bytes=0-${n - 1}` });
      if (bytes.length !== n) throw new Error('serve short');
      return bytes;
    },
  };
}

export async function startReader(remote) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const pass = randomBytes(24).toString('base64url');
  const headers = { authorization: 'Basic ' + Buffer.from(`reader:${pass}`).toString('base64') };
  const child = spawn(
    'rclone',
    ['rcd', '--rc-addr', `127.0.0.1:${port}`, '--rc-serve', '--drive-pacer-min-sleep', '10ms'],
    {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, RCLONE_RC_USER: 'reader', RCLONE_RC_PASS: pass },
    },
  );
  let dead = false;
  child.on('error', () => (dead = true));
  child.on('exit', () => (dead = true));
  const bye = () => child.kill();
  process.once('exit', bye);
  const stop = () => {
    process.off('exit', bye);
    child.kill();
  };
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (dead || Date.now() > deadline) {
      stop();
      throw new Error('상주 읽기를 못 띄웠다');
    }
    try {
      if ((await fetch(`${url}/core/version`, { method: 'POST', headers })).ok) break;
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(100);
  }
  return { ...readerOver(url, remote, { headers }), url, stop };
}

/**
 * 여러 개를 돌아가며 사용. 한 프로세스 안에서는 폴더 찾기가 순서대로만 처리됨
 * 동시 8 과 32 모두 2.48청크/초 (2026-11-26). 프로세스 수를 늘려야 빨라짐
 */
export async function startReaderPool(remote, size) {
  const all = await Promise.all(Array.from({ length: size }, () => startReader(remote).catch(() => null)));
  const live = all.filter(Boolean);
  if (!live.length) throw new Error('상주 읽기를 못 띄웠다');
  let turn = 0;
  const pick = () => live[turn++ % live.length];
  return {
    size: live.length,
    get: (key) => pick().get(key),
    head: (key, n) => pick().head(key, n),
    stop: () => live.forEach((r) => r.stop()),
  };
}
