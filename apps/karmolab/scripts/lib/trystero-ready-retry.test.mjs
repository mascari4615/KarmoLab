import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { retryReadySource, trysteroReadyRetry } from './trystero-ready-retry.mjs';

const require = createRequire(import.meta.url);
const entry = join(dirname(require.resolve('@trystero-p2p/core/package.json')), 'dist/handshake.mjs');
const bundled = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [trysteroReadyRetry] });
const { createHandshakeManager } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('one missing ready recovers both peers; repeats have a deadline and join fires once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const peers = [{}, {}];
  const active = [0, 0];
  const sent = [0, 0];
  const managers = [0, 1].map((index) => createHandshakeManager({
    handshakeTimeoutMs: 10000,
    sendHandshakeReady: async (data) => {
      assert.equal(data, '');
      sent[index]++;
      if (index === 0 && sent[index] === 1) return;
      managers[1 - index].receiveHandshakeReady('peer');
    },
    onActivate: () => active[index]++,
    onFailure: (_, __, error) => { throw error; }
  }));
  managers.forEach((manager, index) => manager.addPeer('peer', peers[index]));
  managers.forEach((manager, index) => manager.start('peer', peers[index]));
  await flush();
  assert.deepEqual(active, [1, 0]);
  t.mock.timers.tick(500);
  await flush();
  assert.deepEqual(active, [1, 1]);
  t.mock.timers.tick(10000);
  await flush();
  const finished = [...sent];
  t.mock.timers.tick(60000);
  await flush();
  assert.deepEqual(sent, finished);
  assert.deepEqual(active, [1, 1]);
});

for (const reason of ['leave', 'timeout']) test(`${reason} cancels all ready retries`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let sends = 0;
  let failures = 0;
  const peer = {};
  const manager = createHandshakeManager({
    handshakeTimeoutMs: 1000,
    sendHandshakeReady: async () => { sends++; },
    onActivate: () => assert.fail('no remote ready'),
    onFailure: (_, __, error) => { failures++; manager.clearPeer('peer', error); }
  });
  manager.addPeer('peer', peer);
  manager.start('peer', peer);
  await flush();
  if (reason === 'leave') manager.clearPeer('peer', new Error('left'));
  else t.mock.timers.tick(1000);
  const finished = sends;
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(sends, finished);
  assert.equal(failures, reason === 'timeout' ? 1 : 0);
});

test('a changed upstream source requires review', () => {
  assert.throws(() => retryReadySource('changed dependency'), /Trystero handshake changed/);
});
