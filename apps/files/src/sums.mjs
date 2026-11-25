/**
 * 암호문 MD5 장부. 올릴 때 기록하면 Drive 의 MD5 목록과 본문 없이 대조 가능
 *
 * 자리는 `sums/<시각>-<난수>`. 한 조각은 한 번만 쓰고 수정 없음. 그래서 작업끼리 덮어쓰기 없음
 * 색인(`idx`)에 안 넣는 이유: 화면이 매번 받는 파일 크기와 전송 중 다시 쓰는 양 증가
 * MD5 는 Drive 대조용. 내용 보호는 AES-GCM 담당
 */
import { createHash, randomBytes } from 'node:crypto';
import { openSums, sealSums } from './vault.mjs';

export const SUMS_DIR = 'sums';
const EVERY_MS = 10 * 60_000;
const EVERY_ROWS = 2000;

export function md5Hex(bytes) {
  return createHash('md5').update(bytes).digest('hex');
}

function segmentKey(now) {
  return `${SUMS_DIR}/${String(now).padStart(14, '0')}-${randomBytes(6).toString('hex')}`;
}

/**
 * 세션에 장부를 단다. `store` 는 장부를 둘 정본 저장소 (열람 저장에는 안 보낸다).
 * 장부를 못 써도 올리기는 계속. 남은 줄은 다음 번에 재시도, 끝까지 실패하면 `pending` 에 남음
 */
export function attachSums(session, store, opts = {}) {
  const everyMs = opts.everyMs ?? EVERY_MS;
  const everyRows = opts.everyRows ?? EVERY_ROWS;
  let pending = new Map();
  let last = Date.now();
  let error = null;
  let queue = Promise.resolve();

  async function flushOnce() {
    if (!pending.size) return true;
    const rows = pending;
    pending = new Map();
    last = Date.now();
    const body = JSON.stringify({ v: 1, at: last, md5: Object.fromEntries(rows) });
    try {
      await store.put(segmentKey(last), await sealSums(session, new TextEncoder().encode(body)));
      error = null;
      return true;
    } catch (e) {
      /* 그 사이 새로 온 값이 더 새것이다 */
      pending = new Map([...rows, ...pending]);
      error = e;
      return false;
    }
  }
  /** 한 번에 하나씩. 실패는 false 로만 알린다 */
  function flush() {
    queue = queue.then(flushOnce);
    return queue;
  }
  const due = () => pending.size >= everyRows || Date.now() - last >= everyMs;
  const ledger = {
    record(key, md5) {
      pending.set(key, md5);
    },
    flush,
    async flushIfDue() {
      if (due()) await flush();
    },
    get pending() {
      return pending.size;
    },
    get error() {
      return error;
    },
  };
  session.onSealed = (key, sealed) => ledger.record(key, md5Hex(sealed));
  session.beforeIndex = ledger.flushIfDue;
  return ledger;
}

/**
 * 조각들을 시각 순으로 합친다. 같은 키는 나중 것이 이긴다 (미리보기를 다시 구운 경우).
 * 못 받은 조각은 예외. 못 연 조각은 `bad` 목록. 둘을 섞으면 통신 장애가 손상으로 보임
 */
export async function readSums(session, store, keys, opts = {}) {
  const parallel = opts.parallel ?? 8;
  const parts = [];
  const bad = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, keys.length) }, async () => {
      while (next < keys.length) {
        const key = keys[next++];
        const packed = await store.get(key);
        if (!packed) throw new Error(`장부 조각을 못 받았다: ${key}`);
        try {
          const raw = JSON.parse(new TextDecoder().decode(await openSums(session, packed)));
          if (raw.v !== 1 || typeof raw.at !== 'number' || !raw.md5) throw new Error('shape');
          parts.push(raw);
        } catch {
          bad.push(key);
        }
      }
    }),
  );
  parts.sort((a, b) => a.at - b.at);
  const sums = new Map();
  for (const p of parts) for (const [k, v] of Object.entries(p.md5)) sums.set(k, v);
  return { sums, bad };
}
