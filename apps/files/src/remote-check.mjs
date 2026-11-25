/**
 * 색인, MD5 장부, 원격 목록을 본문 없이 대조. 통신과 파일 쓰기 없음
 *
 * 세 가지만 실패로 친다: 없음, 크기 다름, MD5 다름.
 * 기록 없음은 장부 이전에 올라간 것. 존재와 크기까지는 확인
 * 미리보기는 다시 구우면 되므로 따로 세기만, 실패 아님
 */
/** 봉한 것 하나에 붙는 몫. IV 12 + 인증 태그 16 */
export const SEAL_OVERHEAD = 28;

/** 같은 이름이 둘이면 어느 것을 받을지 모른다. 하나라도 다르면 다른 것 */
function judge(objs, want) {
  const got = objs.map((o) => o.Hashes?.md5);
  if (got.some((m) => !m)) return 'noRemote';
  if (!want) return 'noRecord';
  return got.every((m) => m === want) ? 'same' : 'diff';
}

export function chunkKeysOf(f) {
  return Array.from({ length: f.chunks }, (_, i) => `c/${f.id}/${i}`);
}

export function checkRemote(files, sums, listing) {
  const seen = new Map();
  for (const o of listing) {
    if (seen.has(o.Path)) seen.get(o.Path).push(o);
    else seen.set(o.Path, [o]);
  }
  const out = {
    files: files.length,
    chunks: 0,
    matched: 0,
    noRemoteMd5: 0,
    noRecord: [],
    missing: [],
    size: [],
    md5: [],
    thumbs: { total: 0, matched: 0, noRecord: 0, bad: [] },
    duplicates: 0,
    orphans: 0,
    orphanBytes: 0,
  };
  const wanted = new Set();
  for (const f of files) {
    let total = 0;
    let whole = true;
    for (const key of chunkKeysOf(f)) {
      wanted.add(key);
      out.chunks += 1;
      const objs = seen.get(key);
      if (!objs) {
        out.missing.push({ path: f.path, key });
        whole = false;
        continue;
      }
      if (objs.length > 1) out.duplicates += 1;
      total += objs[0].Size;
      const verdict = judge(objs, sums.get(key));
      if (verdict === 'same') out.matched += 1;
      else if (verdict === 'diff') out.md5.push({ path: f.path, key });
      else if (verdict === 'noRecord') out.noRecord.push({ path: f.path, key });
      else out.noRemoteMd5 += 1;
    }
    if (whole && total !== f.size + SEAL_OVERHEAD * f.chunks) {
      out.size.push({ path: f.path, key: `c/${f.id}` });
    }
    if (!f.thumb) continue;
    const key = `t/${f.id}`;
    const objs = seen.get(key);
    wanted.add(key);
    out.thumbs.total += 1;
    const verdict =
      objs && objs.every((o) => o.Size === f.thumb + SEAL_OVERHEAD) ? judge(objs, sums.get(key)) : 'diff';
    if (verdict === 'same') out.thumbs.matched += 1;
    else if (verdict === 'diff') out.thumbs.bad.push({ path: f.path, key });
    else out.thumbs.noRecord += 1;
  }
  for (const [key, objs] of seen) {
    if (!/^[ct]\//.test(key) || wanted.has(key)) continue;
    out.orphans += objs.length;
    for (const o of objs) out.orphanBytes += o.Size;
  }
  return out;
}

export function failed(r) {
  return r.missing.length > 0 || r.size.length > 0 || r.md5.length > 0;
}

/** 어긋남은 없는데 MD5 로 확인 못 한 청크가 남았나. 있는지와 크기까지만 본 상태 */
export function partial(r) {
  return !failed(r) && r.matched < r.chunks;
}

export function summary(r) {
  return [
    `파일 ${r.files}, 청크 ${r.chunks}, MD5 로 확인 ${r.chunks ? ((r.matched / r.chunks) * 100).toFixed(1) : '100.0'}%`,
    `MD5 같음 ${r.matched}, 기록 없음 ${r.noRecord.length}, 원격 MD5 없음 ${r.noRemoteMd5}`,
    `없음 ${r.missing.length}, 크기 다름 ${r.size.length}, MD5 다름 ${r.md5.length}`,
    `미리보기 ${r.thumbs.total}: 같음 ${r.thumbs.matched}, 기록 없음 ${r.thumbs.noRecord}, 어긋남 ${r.thumbs.bad.length}`,
    `같은 이름 둘 ${r.duplicates}, 색인 밖 ${r.orphans} (${(r.orphanBytes / 1e9).toFixed(2)} GB)`,
  ];
}
