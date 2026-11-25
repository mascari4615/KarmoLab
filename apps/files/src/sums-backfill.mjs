#!/usr/bin/env node
/**
 * 장부 이전에 올라간 것 소급. 본문 다운로드 없음
 *
 * 원격 청크는 IV 12바이트로 시작한다. 그것만 받아 디스크 원본을 같은 IV 로 다시 싸면
 * 원격과 같은 암호문. MD5 가 Drive 값과 같으면 원격 본문이 원본과 같다는 뜻
 * (2026-11-26 표본 8/8 일치). 같은 것만 장부에 기록, 다르면 기록 없이 알림
 *
 * 원본 sha256 이 색인과 다르면 대조 대상이 아니다 (디스크에서 고친 파일).
 * 운영 `hdr`, `idx` 는 안 씀. `sums/` 에만 추가. 중간에 멈춰도 이어서 실행 가능
 *
 * 쓰기: node src/sums-backfill.mjs [--only <앞 경로>] [--limit N] [--parallel 32] [--readers 8] [--dry-run]
 */
import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { openForCheck } from './open-session.mjs';
import { startReaderPool } from './reader-rclone.mjs';
import { chunkKeysOf, SEAL_OVERHEAD } from './remote-check.mjs';
import { attachSums, md5Hex } from './sums.mjs';
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

/** 목록을 키로. 같은 이름이 둘이면 어느 것인지 모르므로 판단하지 않는다 */
export function remoteByKey(listing) {
  const m = new Map();
  for (const o of listing) {
    m.set(o.Path, m.has(o.Path) ? null : { size: o.Size, md5: o.Hashes?.md5 ?? '' });
  }
  return m;
}

async function main() {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? dflt : process.argv[i + 1];
  };
  const dry = process.argv.includes('--dry-run');
  const only = arg('--only', '');
  const limit = Number(arg('--limit', 'Infinity'));
  const parallel = Math.max(1, Number(arg('--parallel', '32')) || 32);
  const readers = Math.max(1, Number(arg('--readers', '8')) || 8);

  let got;
  let reader;
  try {
    got = await openForCheck();
    if (!process.env.FILES_VAULT_ROOT) throw new Error('없음: FILES_VAULT_ROOT');
    reader = await startReaderPool(got.remote, readers);
  } catch (e) {
    console.error('[sums] 못 돌림.', String(e?.message ?? e).slice(0, 200));
    return 2;
  }
  const root = process.env.FILES_VAULT_ROOT;
  const { session } = got;
  const remote = remoteByKey(got.listing);
  const todo = session.index.files
    .filter((f) => f.chunks > 0 && (!only || f.path === only || f.path.startsWith(only + '/')))
    .filter((f) => chunkKeysOf(f).some((k) => !got.sums.has(k)))
    .slice(0, limit);
  console.log(`[sums] 기록 없는 파일 ${todo.length}개${dry ? ' (연습)' : ''}`);

  const ledger = attachSums(session, got.store);
  const n = { same: 0, diff: 0, changed: 0, unclear: 0, noLocal: 0, error: 0 };
  let chunks = 0;
  let bytes = 0;
  const readIv = (key) => reader.head(key, IV_LEN);

  async function one(f) {
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
  }

  const t0 = performance.now();
  let at = 0;
  let done = 0;
  try {
    await Promise.all(
      Array.from({ length: parallel }, async () => {
        while (at < todo.length) {
          const f = todo[at++];
          try {
            n[await one(f)] += 1;
          } catch (e) {
            n.error += 1;
            if (n.error <= 10) console.log('[sums] 못 잼:', String(e?.message ?? e).slice(0, 120));
          }
          done += 1;
          if (done % 200 === 0) console.log(`[sums] ${done}/${todo.length} 같음 ${n.same} 다름 ${n.diff}`);
          if (!dry) await ledger.flushIfDue();
        }
      }),
    );
  } finally {
    if (!dry) await ledger.flush();
    reader.stop();
  }
  const sec = (performance.now() - t0) / 1000;
  console.log(
    `[sums] 같음 ${n.same} (청크 ${chunks}, ${(bytes / 1e9).toFixed(2)} GB), 원격 다름 ${n.diff}, ` +
      `원본 없음 ${n.noLocal}, 원본 바뀜 ${n.changed}, 판단 못 함 ${n.unclear}, 오류 ${n.error}`,
  );
  console.log(`[sums] ${sec.toFixed(1)}초, ${(chunks / sec).toFixed(2)} 청크/초`);
  if (!dry && ledger.pending) {
    console.error(`[sums] 장부를 못 썼다. 남은 줄 ${ledger.pending}`);
    return 1;
  }
  return n.diff || n.error ? 1 : 0;
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
