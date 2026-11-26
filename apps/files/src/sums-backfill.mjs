#!/usr/bin/env node
/**
 * 장부 이전에 올라간 것 소급. 길 셋, 운영 `hdr`, `idx` 는 안 씀. `sums/` 에만 추가. 중간에 멈춰도 이어서 실행 가능
 *
 * - 원본 (기본): 원격 청크 앞 IV 12바이트만 받아 디스크 원본을 같은 IV 로 다시 쌈. 원격과 같은 암호문이
 *   나오면 MD5 가 Drive 값과 같음 (2026-11-26 표본 8/8 일치). 본문 다운로드 없음. 원본 sha256 이 색인과
 *   다르면 대조 대상 아님 (디스크에서 고친 파일)
 * - 기준선 `--adopt <jsonl>`: 이미 내려받아 대조한 목록 (sums-modes.mjs)
 * - 내려받기 `--download`, 미리보기만 `--thumbs`: 받아서 AES-GCM 인증 확인 (sums-modes.mjs)
 *
 * 쓰기: node src/sums-backfill.mjs [--adopt <jsonl> | --download | --thumbs] [--only <앞 경로>] [--limit N]
 *       [--parallel 32] [--readers 8] [--dry-run]
 */
import { createHash } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { openForCheck } from './open-session.mjs';
import { startReaderPool } from './reader-rclone.mjs';
import { chunkKeysOf, SEAL_OVERHEAD } from './remote-check.mjs';
import { attachSums, md5Hex } from './sums.mjs';
import { adoptRows, downloadKeys, proveSealed, remoteWithTime } from './sums-modes.mjs';
import { resealChunk } from './vault.mjs';

const IV_LEN = 12;

/**
 * 파일 하나를 원본으로 확인. verdict: same, diff, changed, unclear
 * 청크 크기는 색인에 없음 (8MB 와 1MB 혼재). 원격 크기에서 계산
 */
export async function proveFile(session, f, fh, remote, readIv) {
  const hash = createHash('sha256');
  const rows = [];
  let off = 0;
  let same = true;
  for (const [i, key] of chunkKeysOf(f).entries()) {
    const there = remote.get(key);
    const len = (there?.size ?? 0) - SEAL_OVERHEAD;
    if (!there?.md5 || len <= 0) return { verdict: 'unclear' };
    const buf = new Uint8Array(len);
    const { bytesRead } = await fh.read(buf, 0, len, off);
    if (bytesRead !== len) return { verdict: 'changed' };
    off += len;
    hash.update(buf);
    const md5 = md5Hex(await resealChunk(session, f.id, i, buf, await readIv(key)));
    if (md5 !== there.md5) same = false;
    rows.push([key, md5]);
  }
  if (off !== f.size || hash.digest('hex') !== f.sha256) return { verdict: 'changed' };
  return { verdict: same ? 'same' : 'diff', rows };
}

/** 목록을 키로. 같은 이름 둘은 판단 보류 (null) */
export function remoteByKey(listing) {
  const m = new Map();
  for (const o of listing) {
    m.set(o.Path, m.has(o.Path) ? null : { size: o.Size, md5: o.Hashes?.md5 ?? '' });
  }
  return m;
}

/** 같은 일꾼 수로 목록 처리. fn 의 둘째 인자는 처리 순번 (1부터) */
async function each(items, parallel, fn) {
  let at = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, items.length) }, async () => {
      while (at < items.length) {
        const i = at++;
        await fn(items[i], i + 1);
      }
    }),
  );
}

function args() {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? dflt : process.argv[i + 1];
  };
  const adoptFrom = arg('--adopt', '');
  const thumbsOnly = process.argv.includes('--thumbs');
  const download = process.argv.includes('--download') || thumbsOnly;
  return {
    dry: process.argv.includes('--dry-run'),
    only: arg('--only', ''),
    limit: Number(arg('--limit', 'Infinity')),
    parallel: Math.max(1, Number(arg('--parallel', '32')) || 32),
    readers: Math.max(1, Number(arg('--readers', '8')) || 8),
    adoptFrom,
    thumbsOnly,
    mode: adoptFrom ? 'adopt' : download ? 'download' : 'local',
  };
}

async function main() {
  const o = args();
  let got;
  let reader = null;
  try {
    got = await openForCheck({ modtime: o.mode === 'adopt' });
    if (o.mode === 'local' && !process.env.FILES_VAULT_ROOT) throw new Error('없음: FILES_VAULT_ROOT');
    if (o.mode !== 'adopt') reader = await startReaderPool(got.remote, o.readers);
  } catch (e) {
    console.error('[sums] 못 돌림.', String(e?.message ?? e).slice(0, 200));
    return 2;
  }
  const { session } = got;
  const files = session.index.files.filter((f) => !o.only || f.path === o.only || f.path.startsWith(o.only + '/'));
  const ledger = attachSums(session, got.store);
  const ctx = { o, got, session, files, ledger, reader, t0: performance.now() };
  let code = 0;
  try {
    if (o.mode === 'adopt') code = await runAdopt(ctx);
    else if (o.mode === 'download') code = await runDownload(ctx);
    else code = await runLocal(ctx);
  } finally {
    if (!o.dry) await ledger.flush();
    reader?.stop();
  }
  if (!o.dry && ledger.pending) {
    console.error(`[sums] 장부를 못 썼다. 남은 줄 ${ledger.pending}`);
    return 1;
  }
  return code;
}

function report(ctx, line, count) {
  const sec = (performance.now() - ctx.t0) / 1000;
  console.log(`[sums] ${line}${ctx.o.dry ? ' (연습)' : ''}`);
  console.log(`[sums] ${sec.toFixed(1)}초, ${(count / sec).toFixed(2)} 개/초`);
}

async function runAdopt(ctx) {
  const text = await readFile(ctx.o.adoptFrom, 'utf8');
  const verified = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const { rows, n } = adoptRows(ctx.files, verified, remoteWithTime(ctx.got.listing), ctx.got.sums);
  for (const [k, v] of rows) ctx.ledger.record(k, v);
  report(
    ctx,
    `기준선 ${n.files}파일 ${n.chunks}청크. 대조 기록 없음 ${n.notVerified}, sha256 다름 ${n.shaDiff}, ` +
      `대조 뒤 바뀜 ${n.changedAfter}, 판단 못 함 ${n.unclear}`,
    n.chunks,
  );
  return 0;
}

async function runDownload(ctx) {
  const { o, got, session, ledger, reader } = ctx;
  const all = downloadKeys(ctx.files, got.sums, { thumbsOnly: o.thumbsOnly });
  const keys = all.slice(0, o.limit);
  const remote = remoteByKey(got.listing);
  const gb = (list) => (list.reduce((a, k) => a + (remote.get(k)?.size ?? 0), 0) / 1e9).toFixed(2);
  console.log(`[sums] 기록 없는 것 ${all.length}개 ${gb(all)} GB, 이번에 받을 것 ${keys.length}개 ${gb(keys)} GB`);
  const n = { same: 0, bad: 0, moved: 0, error: 0 };
  let bytes = 0;
  /* 회선이 끊기면 남은 수천 개가 몇 초 만에 오류로 지나감 (2026-11-26, 5,460건). 재시도, 연속 실패면 중단 */
  let streak = 0;
  const fetchWithRetry = async (key) => {
    for (let t = 1; ; t++) {
      try {
        const body = await reader.get(key);
        streak = 0;
        return body;
      } catch (e) {
        if (t >= 4) {
          streak += 1;
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000 * 2 ** t));
      }
    }
  };
  await each(keys, o.parallel, async (key, i) => {
    if (streak >= 50) return;
    try {
      const body = await fetchWithRetry(key);
      const { verdict, md5 } = await proveSealed(session, key, body, remote.get(key));
      n[verdict] += 1;
      if (verdict === 'same') {
        ledger.record(key, md5);
        bytes += body.length;
      } else if (verdict === 'bad') console.log(`[sums] 인증 실패: ${key}`);
    } catch (e) {
      n.error += 1;
      if (n.error <= 10) console.log('[sums] 못 받음:', String(e?.message ?? e).slice(0, 120));
    }
    if (i % 500 === 0) console.log(`[sums] ${i}/${keys.length} 같음 ${n.same} 인증 실패 ${n.bad}`);
    if (!o.dry) await ledger.flushIfDue();
  });
  report(
    ctx,
    `같음 ${n.same} (${(bytes / 1e9).toFixed(2)} GB), 인증 실패 ${n.bad}, 받는 사이 바뀜 ${n.moved}, 오류 ${n.error}` +
      (streak >= 50 ? '. 연속 실패 50건으로 중단, 다시 실행하면 이어서' : ''),
    keys.length,
  );
  return n.bad || n.error || streak >= 50 ? 1 : 0;
}

async function runLocal(ctx) {
  const { o, got, session, ledger, reader } = ctx;
  const root = process.env.FILES_VAULT_ROOT;
  const remote = remoteByKey(got.listing);
  const todo = ctx.files
    .filter((f) => f.chunks > 0 && chunkKeysOf(f).some((k) => !got.sums.has(k)))
    .slice(0, o.limit);
  console.log(`[sums] 기록 없는 파일 ${todo.length}개`);
  const n = { same: 0, diff: 0, changed: 0, unclear: 0, noLocal: 0, error: 0 };
  let chunks = 0;
  let bytes = 0;
  const readIv = (key) => reader.head(key, IV_LEN);
  const one = async (f) => {
    const abs = join(root, ...f.path.split('/'));
    const st = await stat(abs).catch(() => null);
    if (!st) return 'noLocal';
    if (st.size !== f.size) return 'changed';
    const fh = await open(abs, 'r');
    try {
      const { verdict, rows } = await proveFile(session, f, fh, remote, readIv);
      if (verdict === 'diff') console.log(`[sums] 원격이 원본과 다름: ${f.id}`);
      if (verdict === 'same') {
        for (const [k, v] of rows) ledger.record(k, v);
        chunks += rows.length;
        bytes += f.size;
      }
      return verdict;
    } finally {
      await fh.close();
    }
  };
  await each(todo, o.parallel, async (f, i) => {
    try {
      n[await one(f)] += 1;
    } catch (e) {
      n.error += 1;
      if (n.error <= 10) console.log('[sums] 못 잼:', String(e?.message ?? e).slice(0, 120));
    }
    if (i % 200 === 0) console.log(`[sums] ${i}/${todo.length} 같음 ${n.same} 다름 ${n.diff}`);
    if (!o.dry) await ledger.flushIfDue();
  });
  report(
    ctx,
    `같음 ${n.same} (청크 ${chunks}, ${(bytes / 1e9).toFixed(2)} GB), 원격 다름 ${n.diff}, ` +
      `원본 없음 ${n.noLocal}, 원본 바뀜 ${n.changed}, 판단 못 함 ${n.unclear}, 오류 ${n.error}`,
    chunks,
  );
  return n.diff || n.error ? 1 : 0;
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
