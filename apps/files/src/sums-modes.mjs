/**
 * 장부 소급의 원본 없는 길 둘. 판정만, 통신과 쓰기 없음
 *
 * - 기준선 (adopt): 이미 내려받아 복호와 sha256 대조를 마친 목록. 대조 시각 뒤로 원격이 안 바뀐 청크만
 *   지금 Drive MD5 를 장부에 기록. 그 뒤 변조는 잡지만 대조 전 상태는 그 대조가 보증
 * - 내려받기 (download): 청크와 미리보기를 받아 AES-GCM 인증 확인. 자리(AAD)까지 맞는 우리 암호문일 때만 기록
 */
import { md5Hex } from './sums.mjs';
import { chunkKeysOf } from './remote-check.mjs';
import { openSealed } from './vault.mjs';

/** 목록을 키로, 시각 포함. 같은 이름 둘은 판단 보류 (null) */
export function remoteWithTime(listing) {
  const m = new Map();
  for (const o of listing) {
    const at = Date.parse(o.ModTime ?? '');
    m.set(o.Path, m.has(o.Path) ? null : { size: o.Size, md5: o.Hashes?.md5 ?? '', at });
  }
  return m;
}

/**
 * 대조 기록 줄 ({ id, sha256, at }) 과 색인이 같은 파일의 기록 없는 청크.
 * 결과: 적을 줄과 건너뛴 이유별 수
 */
export function adoptRows(files, verified, remote, sums) {
  const byId = new Map();
  for (const v of verified) if (v?.id && v.sha256 && v.at > 0) byId.set(v.id, v);
  const rows = [];
  const n = { files: 0, chunks: 0, notVerified: 0, shaDiff: 0, changedAfter: 0, unclear: 0 };
  for (const f of files) {
    const keys = chunkKeysOf(f).filter((k) => !sums.has(k));
    if (!keys.length) continue;
    const v = byId.get(f.id);
    if (!v) {
      n.notVerified += 1;
      continue;
    }
    if (v.sha256 !== f.sha256) {
      n.shaDiff += 1;
      continue;
    }
    const got = keys.map((k) => [k, remote.get(k)]);
    if (got.some(([, o]) => !o?.md5 || !Number.isFinite(o.at))) {
      n.unclear += 1;
      continue;
    }
    if (got.some(([, o]) => o.at > v.at)) {
      n.changedAfter += 1;
      continue;
    }
    for (const [k, o] of got) rows.push([k, o.md5]);
    n.files += 1;
    n.chunks += got.length;
  }
  return { rows, n };
}

/** 받은 바이트 판정: same (인증 통과, 원격 MD5 와 같음), bad (인증 실패), moved (받는 사이 바뀜) */
export async function proveSealed(session, key, bytes, there) {
  if (!there?.md5 || bytes.length !== there.size) return { verdict: 'moved' };
  try {
    await openSealed(session, key, bytes);
  } catch {
    return { verdict: 'bad' };
  }
  const md5 = md5Hex(bytes);
  return md5 === there.md5 ? { verdict: 'same', md5 } : { verdict: 'moved' };
}

/** 내려받을 키. 원본으로 못 한 청크와 미리보기 중 기록 없는 것 */
export function downloadKeys(files, sums, { thumbsOnly = false } = {}) {
  const keys = [];
  for (const f of files) {
    if (!thumbsOnly) for (const k of chunkKeysOf(f)) if (!sums.has(k)) keys.push(k);
    if (f.thumb && !sums.has(`t/${f.id}`)) keys.push(`t/${f.id}`);
  }
  return keys;
}
