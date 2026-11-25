/**
 * 색인 쓰기 잠금. 이 PC 의 전송기, 미리보기 백필, 휴지통 비우기, 보고서 전송이 같은 `idx` 를 씀
 * Drive 에 조건부 쓰기 없음. 읽고 합쳐 쓰는 동안을 파일 하나로 막음
 * 다른 PC 의 동시 쓰기는 대상 밖. 쓰는 PC 는 한 대
 *
 * 잡은 쪽이 수정 시각을 계속 갱신. 주인 프로세스가 없거나 그 시각이 묵으면 버려진 잠금
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, utimes } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BEAT_MS = 20_000;

export function defaultLockPath() {
  const base = process.env.LOCALAPPDATA || join(homedir(), '.cache');
  return join(base, 'karmo-files', 'index.lock');
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function abandoned(path, staleMs) {
  try {
    const age = Date.now() - (await stat(path)).mtimeMs;
    if (age > staleMs) return true;
    const { pid } = JSON.parse(await readFile(path, 'utf8'));
    return Number.isInteger(pid) && !alive(pid);
  } catch {
    /* 없어졌거나, 막 만들어 아직 비어 있다. 살아 있는 것으로 친다 */
    return false;
  }
}

/** 파일을 처음 만든 쪽만 fh 를 얻는다. 윈도우에서 지워지는 중인 파일은 EPERM, EBUSY */
async function create(path) {
  try {
    return await open(path, 'wx');
  } catch (e) {
    if (e.code === 'EEXIST' || e.code === 'EPERM' || e.code === 'EBUSY') return null;
    throw e;
  }
}

/**
 * 버려진 잠금 치우기. 둘이 동시에 치우면 뒤의 것이 새 주인의 잠금을 지우는 문제
 * 그래서 치우기도 한 번에 하나만, 치우기 직전 재확인
 */
async function reap(path, staleMs) {
  const guard = path + '.reap';
  const fh = await create(guard);
  if (!fh) {
    const age = await stat(guard).then((s) => Date.now() - s.mtimeMs, () => 0);
    if (age > staleMs) await rm(guard, { force: true });
    return;
  }
  try {
    await fh.close();
    if (await abandoned(path, staleMs)) await rm(path, { force: true });
  } finally {
    await rm(guard, { force: true });
  }
}

export function indexLock(opts = {}) {
  const path = opts.path ?? defaultLockPath();
  const waitMs = opts.waitMs ?? 5 * 60_000;
  const stepMs = opts.stepMs ?? 250;
  const staleMs = opts.staleMs ?? 3 * 60_000;
  return async (fn) => {
    await mkdir(dirname(path), { recursive: true });
    const deadline = Date.now() + waitMs;
    const mine = JSON.stringify({ pid: process.pid, token: randomBytes(8).toString('hex') });
    for (;;) {
      const fh = await create(path);
      if (!fh) {
        if (await abandoned(path, staleMs)) await reap(path, staleMs);
        if (Date.now() > deadline) throw new Error('색인 잠금을 못 얻었다');
        await sleep(stepMs);
        continue;
      }
      try {
        await fh.writeFile(mine);
      } finally {
        await fh.close();
      }
      const beat = setInterval(() => {
        const now = new Date();
        utimes(path, now, now).catch(() => {});
      }, BEAT_MS);
      beat.unref();
      const stillHeld = async () => {
        if ((await readFile(path, 'utf8').catch(() => '')) !== mine) throw new Error('색인 잠금을 잃었다');
      };
      try {
        return await fn(stillHeld);
      } finally {
        clearInterval(beat);
        /* 묵었다고 남이 가져갔으면 그 잠금은 내 것이 아니다 */
        const now = await readFile(path, 'utf8').catch(() => '');
        if (now === mine) await rm(path, { force: true });
      }
    }
  };
}
