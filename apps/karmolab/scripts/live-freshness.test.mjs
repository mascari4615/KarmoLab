import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const source = fs.readFileSync(new URL('./audit-live-fresh.mjs', import.meta.url), 'utf8')
  .replace("import { execFileSync } from 'node:child_process';", '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const judge = new AsyncFunction('execFileSync', 'fetch', 'process', 'console', source);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('bounded history uses actual Git ancestry without changing freshness criteria', async (t) => {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'live-freshness-test-')));
  const origin = path.join(root, 'origin'); fs.mkdirSync(origin);
  try {
    git(origin, 'init', '--initial-branch=main');
    git(origin, 'config', 'user.name', 'Fixture'); git(origin, 'config', 'user.email', 'fixture@example.invalid');
    const hooks = path.join(root, 'empty-hooks'); fs.mkdirSync(hooks);
    git(origin, 'config', 'core.hooksPath', hooks); git(origin, 'config', 'commit.gpgsign', 'false');
    for (let i = 0; i < 62; i++) git(origin, 'commit', '--allow-empty', '-qm', `fixture-${i}`);
    const commits = git(origin, 'rev-list', '--reverse', 'HEAD').split('\n');
    const clone = (name, depth) => {
      const dir = path.join(root, name);
      git(root, 'clone', '--no-checkout', '--single-branch', '--branch', 'main', '--depth=' + depth, pathToFileURL(origin).href, dir);
      return dir;
    };
    const shallow = clone('depth1', 1), bounded = clone('depth50', 50);
    const inspect = async (cwd, sha, ageHours = 0) => {
      const output = [], process = { env: { BASE: 'https://fixture.invalid' }, exitCode: 0, exit() { throw new Error('Unexpected immediate exit'); } };
      await judge((command, args, options) => execFileSync(command, args, { ...options, cwd, stdio: ['ignore', 'pipe', 'pipe'] }),
        async () => ({ status: 200, ok: true, json: async () => ({ sha, builtAt: new Date(Date.now() - ageHours * 3600000).toISOString() }) }),
        process, { log(line) { output.push(line); }, error(line) { output.push(line); } });
      return { status: process.exitCode, output: output.join('\n') };
    };
    await t.test('depth1 reproduces the missing deployed parent; depth50 resolves one commit', async () => {
      assert.equal((await inspect(shallow, commits[60])).status, 2);
      const fixed = await inspect(bounded, commits[60]); assert.equal(fixed.status, 0); assert.match(fixed.output, /1커밋 뒤/);
    });
    await t.test('an additional generated commit does not lose the deployed ancestor', async () => {
      git(origin, 'commit', '--allow-empty', '-qm', 'generated-output');
      const generated = clone('generated-depth50', 50), result = await inspect(generated, commits[60]);
      assert.equal(result.status, 0); assert.match(result.output, /2커밋 뒤/);
    });
    await t.test('the exact fifty-commit boundary counts and outside it remains unmeasured', async () => {
      const boundary = await inspect(bounded, commits[12]); assert.equal(boundary.status, 0); assert.match(boundary.output, /49커밋 뒤/);
      assert.equal((await inspect(bounded, commits[11])).status, 2);
    });
    await t.test('same HEAD remains current and an older-than-three-hours deployment still fails', async () => {
      assert.equal((await inspect(bounded, commits[61], 4)).status, 0);
      assert.equal((await inspect(bounded, commits[60], 4)).status, 1);
      assert.equal((await inspect(bounded, commits[60], 2.9)).status, 0);
    });
    git(origin, 'checkout', '-b', 'side', commits[30]);
    for (let i = 0; i < 55; i++) git(origin, 'commit', '--allow-empty', '-qm', `side-${i}`);
    const side = git(origin, 'rev-parse', 'HEAD');
    await t.test('an available object on another branch is not called a deployed ancestor', async () => {
      git(bounded, 'fetch', '--depth=1', pathToFileURL(origin).href, side);
      assert.equal(git(bounded, 'cat-file', '-t', side), 'commit');
      assert.equal((await inspect(bounded, side)).status, 2);
    });
    await t.test('a merged side branch cut inside the counted range stays unmeasured', async () => {
      git(origin, 'checkout', 'main'); git(origin, 'merge', '--no-ff', 'side', '-m', 'merge-side');
      const merged = clone('merged-depth50', 50);
      assert.equal(git(merged, 'merge-base', '--is-ancestor', commits[60], 'HEAD'), '');
      assert.notEqual(git(merged, 'rev-list', '--max-parents=0', `${commits[60]}..HEAD`), '');
      assert.equal((await inspect(merged, commits[60])).status, 2);
    });
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    assert.ok(path.basename(root).startsWith('live-freshness-test-'));
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
    fs.rmSync(root, { recursive: true });
  }
});
