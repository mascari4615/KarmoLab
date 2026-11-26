import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createVault, memoryStore, putFile, putThumb } from '../src/vault.mjs';
import { adoptRows, downloadKeys, proveSealed, remoteWithTime } from '../src/sums-modes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const md5 = (x) => createHash('md5').update(x).digest('hex');
const b = (s) => new TextEncoder().encode(s);

async function sample() {
  const store = memoryStore();
  const s = await createVault(store, 'test-passphrase-not-a-secret', { iterations: 1000 });
  await putFile(s, 'a', b('hello-hello'), { chunkSize: 4 });
  await putThumb(s, 'a', b('thumb'));
  const f = s.index.files[0];
  const remote = (at = 1000) =>
    new Map([...store.snapshot()].map(([k, v]) => [k, { size: v.length, md5: md5(v), at }]));
  return { store, s, f, remote };
}

test('기준선: 대조한 것만, 대조 뒤 바뀐 것과 sha256 다른 것은 뺀다', async () => {
  const { f, remote } = await sample();
  const ok = adoptRows([f], [{ id: f.id, sha256: f.sha256, at: 2000 }], remote(1000), new Map());
  assert.deepEqual([ok.n.files, ok.n.chunks, ok.rows.length], [1, 3, 3]);
  assert.equal(adoptRows([f], [{ id: f.id, sha256: f.sha256, at: 500 }], remote(1000), new Map()).n.changedAfter, 1);
  assert.equal(adoptRows([f], [{ id: f.id, sha256: 'x', at: 2000 }], remote(1000), new Map()).n.shaDiff, 1);
  assert.equal(adoptRows([f], [], remote(1000), new Map()).n.notVerified, 1);
  const r = remote(1000);
  r.delete(`k/${f.id}-1`);
  assert.equal(adoptRows([f], [{ id: f.id, sha256: f.sha256, at: 2000 }], r, new Map()).n.unclear, 1);
});

test('기준선: 이미 기록된 청크는 다시 안 적는다', async () => {
  const { f, remote } = await sample();
  const sums = new Map([[`k/${f.id}-0`, 'x'], [`k/${f.id}-1`, 'x'], [`k/${f.id}-2`, 'x']]);
  const got = adoptRows([f], [{ id: f.id, sha256: f.sha256, at: 2000 }], remote(), sums);
  assert.deepEqual([got.rows.length, got.n.notVerified], [0, 0]);
});

test('내려받기: 인증 통과만 같음. 자리 바꿔치기와 썩음은 인증 실패', async () => {
  const { store, s, f, remote } = await sample();
  const m = store.snapshot();
  const r = remote();
  const k0 = `k/${f.id}-0`;
  assert.equal((await proveSealed(s, k0, m.get(k0), r.get(k0))).verdict, 'same');
  assert.equal((await proveSealed(s, `t/${f.id}`, m.get(`t/${f.id}`), r.get(`t/${f.id}`))).verdict, 'same');
  const k1 = `k/${f.id}-1`;
  assert.equal((await proveSealed(s, k0, m.get(k1), { ...r.get(k1) })).verdict, 'bad');
  const rot = m.get(k0).slice();
  rot[14] ^= 1;
  assert.equal((await proveSealed(s, k0, rot, { size: rot.length, md5: md5(rot) })).verdict, 'bad');
  assert.equal((await proveSealed(s, k0, m.get(k0), { ...r.get(k0), md5: 'other' })).verdict, 'moved');
  assert.equal((await proveSealed(s, k0, m.get(k0).slice(1), r.get(k0))).verdict, 'moved');
});

test('내려받을 키: 기록 없는 청크와 미리보기, --thumbs 면 미리보기만', async () => {
  const { f } = await sample();
  const sums = new Map([[`k/${f.id}-0`, 'x']]);
  assert.deepEqual(downloadKeys([f], sums), [`k/${f.id}-1`, `k/${f.id}-2`, `t/${f.id}`]);
  assert.deepEqual(downloadKeys([f], sums, { thumbsOnly: true }), [`t/${f.id}`]);
});

test('목록 시각: 없는 시각은 판단 못 함으로 간다', () => {
  const r = remoteWithTime([{ Path: 'c/x/0', Size: 1, Hashes: { md5: 'a' } }]);
  const f = { id: 'x', sha256: 's', chunks: 1 };
  assert.equal(adoptRows([f], [{ id: 'x', sha256: 's', at: 5 }], r, new Map()).n.unclear, 1);
});

test('hdr 을 못 받으면 --init 없이는 새로 안 만든다', async () => {
  const run = (extra) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [join(here, '..', 'src', 'upload.mjs'), '--only', 'x', ...extra], {
        env: { ...process.env, FILES_VAULT_ROOT: here, FILES_VAULT_PASS: 'p', FILES_VAULT_REMOTE: 'nosuchremote-zz:v', FILES_VAULT_R2: '' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => resolve({ code, err }));
    });
  const got = await run([]);
  assert.ok(got.code !== 0);
  assert.doesNotMatch(got.err, /클라우드 염/);
});
