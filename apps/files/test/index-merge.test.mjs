import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeIndex, createVault, dropFiles, flushIndex, getFile, listFiles, memoryStore, putFile, putThumb, setTimes, unlockVault,
} from '../src/vault.mjs';
import { indexLock } from '../src/index-lock.mjs';

const b = (s) => new TextEncoder().encode(s);
const PASS = 'test-passphrase-not-a-secret';
async function vault() {
  const store = memoryStore();
  await createVault(store, PASS, { iterations: 1000 });
  const open = async () => {
    const s = await unlockVault(store, PASS);
    s.deferIndex = true;
    return s;
  };
  const names = async () => (await listFiles(await open())).map((f) => f.path).sort();
  return { store, open, names };
}

test('업로더가 오래 쥔 색인이 그 사이 들어온 줄을 덮지 않는다', async () => {
  const { open, names } = await vault();
  const up = await open();
  await putFile(up, 'u1', b('1'));
  await flushIndex(up);
  const report = await open();
  await putFile(report, 'AI-work/latest', b('r'));
  await flushIndex(report);
  await putFile(up, 'u2', b('2'));
  await flushIndex(up);
  assert.deepEqual(await names(), ['AI-work/latest', 'u1', 'u2']);
});

test('옛 색인을 쥔 짧은 작업이 업로더의 마지막 묶음을 덮지 않는다', async () => {
  const { open, names } = await vault();
  const report = await open();
  const up = await open();
  await putFile(up, 'u1', b('1'));
  await flushIndex(up);
  await putFile(report, 'AI-work/latest', b('r'));
  await flushIndex(report);
  assert.deepEqual(await names(), ['AI-work/latest', 'u1']);
});

test('미리보기와 시각은 그 파일이 그대로일 때만 얹는다', async () => {
  const { open } = await vault();
  const first = await open();
  await putFile(first, 'a', b('old'));
  await putFile(first, 'keep', b('k'));
  await flushIndex(first);
  const thumbs = await open();
  const up = await open();
  await putFile(up, 'a', b('new'));
  await flushIndex(up);
  await putThumb(thumbs, 'a', b('t'));
  await setTimes(thumbs, 'a', { mtime: 5 });
  await putThumb(thumbs, 'keep', b('tt'));
  await setTimes(thumbs, 'keep', { mtime: 7 });
  await flushIndex(thumbs);
  const last = await open();
  const rows = Object.fromEntries((await listFiles(last)).map((f) => [f.path, f]));
  assert.equal(rows.a.thumb, 0);
  assert.equal(rows.a.mtime, 0);
  assert.equal(rows.keep.thumb, 2);
  assert.equal(rows.keep.mtime, 7);
  assert.equal(new TextDecoder().decode((await getFile(last, 'a')).bytes), 'new');
});

test('올린 뒤 바로 구운 미리보기도 같이 남는다', async () => {
  const { open } = await vault();
  const up = await open();
  await putFile(up, 'a', b('x'));
  await putThumb(up, 'a', b('thumb'));
  await flushIndex(up);
  assert.equal((await listFiles(await open()))[0].thumb, 5);
});

test('빼기는 그 사이 다시 올라온 파일을 안 뺀다', async () => {
  const { open, names } = await vault();
  const first = await open();
  await putFile(first, 'gone', b('1'));
  await putFile(first, 'back', b('1'));
  await flushIndex(first);
  const bin = await open();
  const up = await open();
  await putFile(up, 'back', b('2'));
  await flushIndex(up);
  await dropFiles(bin, bin.index.files.slice());
  await flushIndex(bin);
  assert.deepEqual(await names(), ['back']);
});

test('쓰는 도중 생긴 변경은 다음 쓰기에 남는다', async () => {
  const { store, open, names } = await vault();
  const up = await open();
  let hit = false;
  up.store = {
    get: (k) => store.get(k),
    async put(k, v) {
      if (k === 'idx' && !hit) {
        hit = true;
        await putFile(up, 'late', b('l'));
      }
      await store.put(k, v);
    },
  };
  await putFile(up, 'first', b('f'));
  await flushIndex(up);
  assert.ok((await listFiles(up)).some((f) => f.path === 'late'));
  await flushIndex(up);
  assert.deepEqual(await names(), ['first', 'late']);
});

test('원격 색인을 못 읽으면 덮지 않고 던진다. 변경은 남아 다시 쓸 수 있다', async () => {
  const { store, open, names } = await vault();
  const up = await open();
  await putFile(up, 'a', b('1'));
  let puts = 0;
  up.store = { get: async () => null, put: async () => (puts += 1) };
  await assert.rejects(() => flushIndex(up), /no index/);
  assert.equal(puts, 0);
  up.store = store;
  await flushIndex(up);
  assert.deepEqual(await names(), ['a']);
});

test('옛 색인의 같은 경로 두 줄은 안 건드리면 그대로, 다시 올리면 하나로', () => {
  const fresh = { v: 1, files: [{ path: 'a', id: '1' }, { path: 'a', id: '2' }, { path: 'b', id: '3' }] };
  const kept = mergeIndex(fresh, new Map([['c', { kind: 'put', row: { path: 'c', id: '4' } }]]));
  assert.deepEqual(kept.files.map((f) => f.id), ['1', '2', '3', '4']);
  const one = mergeIndex(fresh, new Map([['a', { kind: 'put', row: { path: 'a', id: '5' } }]]));
  assert.deepEqual(one.files.map((f) => f.id), ['3', '5']);
  const patched = mergeIndex(fresh, new Map([['a', { kind: 'patch', id: '2', fields: { thumb: 9 } }]]));
  assert.deepEqual(patched.files.map((f) => f.thumb ?? 0), [0, 9, 0]);
});

test('뺀 뒤 늦게 온 미리보기가 빼기를 되돌리지 않는다', async () => {
  const { open, names } = await vault();
  const s = await open();
  await putFile(s, 'a', b('1'));
  await putFile(s, 'b', b('2'));
  await flushIndex(s);
  const bin = await open();
  const row = bin.index.files.find((f) => f.path === 'a');
  await dropFiles(bin, [row]);
  bin.index.files.push(row);
  await putThumb(bin, 'a', b('t'));
  await flushIndex(bin);
  assert.deepEqual(await names(), ['b']);
});

test('잠금을 잃었으면 색인을 안 쓴다', async () => {
  const { store, open, names } = await vault();
  const s = await open();
  await putFile(s, 'a', b('1'));
  s.indexLock = (fn) => fn(async () => { throw new Error('색인 잠금을 잃었다'); });
  await assert.rejects(() => flushIndex(s), /잃었다/);
  s.indexLock = (fn) => fn();
  await flushIndex(s);
  assert.deepEqual(await names(), ['a']);

});

async function lockPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'files-lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'index.lock');
}
/** 겹쳐 들어온 최대 수를 잰다 */
async function crowd(path, people) {
  let inside = 0;
  let max = 0;
  await Promise.all(
    Array.from({ length: people }, () =>
      indexLock({ path, stepMs: 5, waitMs: 8000 })(async () => {
        max = Math.max(max, ++inside);
        await new Promise((r) => setTimeout(r, 10));
        inside -= 1;
      }),
    ),
  );
  return max;
}

test('잠금은 한 번에 하나만 들인다. 끝나면 지워진다', async (t) => {
  const path = await lockPath(t);
  assert.equal(await crowd(path, 8), 1);
  await assert.rejects(() => readFile(path));
});

test('안에서 던져도 잠금이 풀린다', async (t) => {
  const lock = indexLock({ path: await lockPath(t), stepMs: 5, waitMs: 500 });
  await assert.rejects(() => lock(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await lock(async () => 7), 7);
});

test('주인이 죽은 잠금은 치운다. 여럿이 같이 치워도 하나씩 들어간다', async (t) => {
  const path = await lockPath(t);
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise((r) => child.on('close', r));
  await writeFile(path, JSON.stringify({ pid: child.pid, token: 'x' }));
  assert.equal(await crowd(path, 6), 1);
});

test('살아 있는 주인의 잠금은 기다리다 던진다. 묵은 것은 치운다', async (t) => {
  const path = await lockPath(t);
  await writeFile(path, JSON.stringify({ pid: process.pid, token: 'other' }));
  const lock = indexLock({ path, stepMs: 5, waitMs: 60, staleMs: 60_000 });
  await assert.rejects(() => lock(async () => 1), /색인 잠금/);
  const old = new Date(Date.now() - 120_000);
  await utimes(path, old, old);
  assert.equal(await lock(async () => 1), 1);
});

test('남이 잠금을 가져가면 stillHeld 가 던진다', async (t) => {
  const path = await lockPath(t);
  const lock = indexLock({ path, stepMs: 5 });
  await assert.rejects(
    () => lock(async (stillHeld) => {
      await stillHeld();
      await writeFile(path, JSON.stringify({ pid: process.pid, token: 'thief' }));
      await stillHeld();
    }),
    /잃었다/,
  );
  assert.match(await readFile(path, 'utf8'), /thief/);
});
