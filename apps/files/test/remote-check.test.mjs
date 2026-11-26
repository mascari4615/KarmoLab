import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVault, flushIndex, getFile, memoryStore, putThumb, unlockVault } from '../src/vault.mjs';
import { putFileFromPath } from '../src/vault-node.mjs';
import { attachSums, readSums } from '../src/sums.mjs';
import { checkRemote, failed, partial } from '../src/remote-check.mjs';
import { proveFile, remoteByKey } from '../src/sums-backfill.mjs';
import { readerOver } from '../src/reader-rclone.mjs';
import { rcloneStore } from '../src/store-rclone.mjs';
import { allowedKey } from '../src/blob-key.mjs';

const b = (s) => new TextEncoder().encode(s);
const md5 = (x) => createHash('md5').update(x).digest('hex');
const newVault = (store) => createVault(store, 'test-passphrase-not-a-secret', { iterations: 1000 });
/** Drive 가 주는 모양 */
const listing = (store) =>
  [...store.snapshot()].map(([Path, v]) => ({ Path, Size: v.length, Hashes: { md5: md5(v) } }));
const sumKeys = (store) => [...store.snapshot().keys()].filter((k) => k.startsWith('sums/'));

async function setup(t, { ledger = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'files-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'a.bin'), 'hello-hello-hello');
  await writeFile(join(dir, 'empty.bin'), '');
  const store = memoryStore();
  const s = await newVault(store);
  s.deferIndex = true;
  s.indexLock = (fn) => fn();
  const sums = ledger ? attachSums(s, store) : null;
  await putFileFromPath(s, 'a.bin', join(dir, 'a.bin'), { chunkSize: 5 });
  await putFileFromPath(s, 'empty.bin', join(dir, 'empty.bin'));
  await putThumb(s, 'a.bin', b('thumb'));
  await sums?.flush();
  await flushIndex(s);
  const again = await unlockVault(store, 'test-passphrase-not-a-secret');
  const check = async () =>
    checkRemote(again.index.files, (await readSums(again, store, sumKeys(store))).sums, listing(store));
  return { dir, store, again, check, id: again.index.files.find((f) => f.path === 'a.bin').id };
}

test('올린 그대로면 전부 같음', async (t) => {
  const { check } = await setup(t);
  const r = await check();
  assert.deepEqual([failed(r), partial(r)], [false, false]);
  assert.deepEqual([r.chunks, r.matched, r.noRecord.length, r.orphans], [4, 4, 0, 0]);
  assert.equal(r.thumbs.matched, 1);
});

test('한 바이트 썩음, 잘림, 없음을 각각 다르게 센다', async (t) => {
  const { store, check, id } = await setup(t);
  const m = store.snapshot();
  const keep = m.get(`k/${id}-1`);
  const bad = keep.slice();
  bad[20] ^= 1;
  m.set(`k/${id}-1`, bad);
  let r = await check();
  assert.deepEqual([r.md5.length, r.size.length, r.missing.length], [1, 0, 0]);
  assert.equal(failed(r), true);
  m.set(`k/${id}-1`, keep.slice(0, -1));
  r = await check();
  assert.equal(r.size.length, 1);
  m.delete(`k/${id}-1`);
  r = await check();
  assert.deepEqual([r.missing.length, r.size.length], [1, 0]);
  assert.equal(failed(r), true);
});

test('두 청크가 서로 바뀌면 잡는다. 크기 합은 같다', async (t) => {
  const { store, check, id } = await setup(t);
  const m = store.snapshot();
  const [x, y] = [m.get(`k/${id}-0`), m.get(`k/${id}-1`)];
  m.set(`k/${id}-0`, y);
  m.set(`k/${id}-1`, x);
  const r = await check();
  assert.deepEqual([r.md5.length, r.size.length], [2, 0]);
});

test('장부 이전 항목은 기록 없음이고 실패가 아니다. 크기는 본다', async (t) => {
  const { store, check, id, again } = await setup(t, { ledger: false });
  assert.equal(sumKeys(store).length, 0);
  let r = await check();
  assert.deepEqual([r.noRecord.length, r.matched, failed(r), partial(r)], [4, 0, false, true]);
  assert.equal(new TextDecoder().decode((await getFile(again, 'a.bin')).bytes), 'hello-hello-hello');
  const m = store.snapshot();
  m.set(`k/${id}-0`, m.get(`k/${id}-0`).slice(1));
  r = await check();
  assert.equal(failed(r), true);
});

test('미리보기 어긋남은 세되 실패로 안 친다', async (t) => {
  const { store, check, id } = await setup(t);
  store.snapshot().delete(`t/${id}`);
  const r = await check();
  assert.deepEqual([r.thumbs.bad.length, failed(r)], [1, false]);
});

test('같은 이름이 둘이면 하나라도 다를 때 다름. 색인 밖은 따로', () => {
  const files = [{ path: 'a', id: 'x', size: 1, chunks: 1 }];
  const o = (h) => ({ Path: 'c/x/0', Size: 29, Hashes: { md5: h } });
  const list = [o('A'), o('B'), { Path: 'c/y/0', Size: 10 }, { Path: 'idx', Size: 5 }];
  const r = checkRemote(files, new Map([['c/x/0', 'A']]), list);
  assert.deepEqual([r.md5.length, r.duplicates, r.orphans, r.orphanBytes], [1, 1, 1, 10]);
});

test('원격이 MD5 를 안 주면 같음으로 안 센다', () => {
  const files = [{ path: 'a', id: 'x', size: 1, chunks: 1 }];
  const r = checkRemote(files, new Map([['c/x/0', 'A']]), [{ Path: 'c/x/0', Size: 29 }]);
  assert.deepEqual([r.matched, r.noRemoteMd5, partial(r)], [0, 1, true]);
});

test('장부는 나중 조각이 이긴다. 못 여는 조각은 따로', async () => {
  const store = memoryStore();
  const s = await newVault(store);
  const l = attachSums(s, store);
  l.record('t/x', 'old');
  await l.flush();
  await new Promise((r) => setTimeout(r, 5));
  l.record('t/x', 'new');
  await l.flush();
  store.snapshot().set('sums/99999999999999-zz', new Uint8Array(64));
  const { sums, bad } = await readSums(s, store, sumKeys(store).reverse());
  assert.equal(sums.get('t/x'), 'new');
  assert.equal(bad.length, 1);
});

test('장부 조각이 사라졌으면 손상이 아니라 못 받음으로 던진다', async () => {
  const store = memoryStore();
  const s = await newVault(store);
  await assert.rejects(() => readSums(s, store, ['sums/00000000000001-aa']), /못 받았다/);
});

test('장부 쓰기가 실패해도 안 던지고 줄이 남는다', async () => {
  const store = memoryStore();
  const s = await newVault(store);
  let down = true;
  const l = attachSums(s, {
    async put(k, v) {
      if (down) throw new Error('quota');
      await store.put(k, v);
    },
  });
  l.record('c/a/0', 'm');
  assert.equal(await l.flush(), false);
  assert.equal(l.pending, 1);
  down = false;
  assert.equal(await l.flush(), true);
  assert.equal(l.pending, 0);
  assert.equal(sumKeys(store).length, 1);
});

test('장부는 화면용 주소로 안 나간다', () => {
  assert.equal(allowedKey('sums/00001-aa'), false);
});

test('소급: 앞 12바이트와 원본만으로 원격 MD5 를 확인한다', async (t) => {
  const { dir, store, again, id } = await setup(t, { ledger: false });
  const f = again.index.files.find((x) => x.id === id);
  const iv = async (key) => store.snapshot().get(key).slice(0, 12);
  const prove = async () => {
    const fh = await open(join(dir, 'a.bin'));
    try {
      return await proveFile(again, f, fh, remoteByKey(listing(store)), iv);
    } finally {
      await fh.close();
    }
  };
  const ok = await prove();
  assert.equal(ok.verdict, 'same');
  assert.deepEqual(ok.rows, [0, 1, 2, 3].map((i) => [`k/${id}-${i}`, md5(store.snapshot().get(`k/${id}-${i}`))]));
  const bad = store.snapshot().get(`k/${id}-2`).slice();
  bad[15] ^= 1;
  store.snapshot().set(`k/${id}-2`, bad);
  assert.equal((await prove()).verdict, 'diff');
  await writeFile(join(dir, 'a.bin'), 'HELLO-hello-hello');
  assert.equal((await prove()).verdict, 'changed');
  store.snapshot().delete(`k/${id}-2`);
  assert.equal((await prove()).verdict, 'unclear');
});

test('상주 읽기: 짧게 온 것과 범위를 무시한 응답을 안 받는다', async () => {
  const reader = (status, body, headers = {}) =>
    readerOver('http://x', 'gdrive:v/', {
      fetchFn: async () => ({
        status,
        headers: new Headers(headers),
        body: null,
        arrayBuffer: async () => Uint8Array.from(b(body)).buffer,
      }),
    });
  assert.equal((await reader(200, 'abc', { 'content-length': '3' }).get('c/a/0')).length, 3);
  await assert.rejects(() => reader(200, 'abc', { 'content-length': '9' }).get('c/a/0'), /short/);
  await assert.rejects(() => reader(200, 'abcdef').head('c/a/0', 3), /serve 200/);
  await assert.rejects(() => reader(404, '').get('c/a/0'), /404/);
});

test('상주 읽기가 실패하면 cat 이 정한다. 없는 키는 null', async () => {
  const reader = { get: async () => { throw new Error('serve 500'); } };
  const has = rcloneStore('gdrive:v', { reader, run: async () => Buffer.from('ok') });
  assert.equal(Buffer.from(await has.get('c/a/0')).toString(), 'ok');
  const none = rcloneStore('gdrive:v', { reader, run: async () => { throw new Error('object not found'); } });
  assert.equal(await none.get('c/a/0'), null);
});
