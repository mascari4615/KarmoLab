import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('run-prepush.mjs', import.meta.url), 'utf8');

function fixture(buildStatus, gateStatus) {
  const dir = mkdtempSync(join(tmpdir(), 'kl-prepush-build-'));
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
  writeFileSync(join(dir, 'scripts/run-prepush.mjs'), source);
  writeFileSync(join(dir, 'scripts/lib/gate-sets.mjs'), "export const PREPUSH = ['test:tools', 'test:tool-url'];\n");
  writeFileSync(join(dir, 'build.mjs'), `
    import { writeFileSync } from 'node:fs';
    if (process.env.GIT_DIR) throw new Error('leaked git context');
    if (${buildStatus} !== 0) process.exit(${buildStatus});
    writeFileSync('prepared', 'fresh build');
  `);
  writeFileSync(join(dir, 'scripts/run-gates.mjs'), `
    import { readFileSync, writeFileSync } from 'node:fs';
    writeFileSync('gates-called', JSON.stringify(process.argv.slice(2)));
    if (readFileSync('prepared', 'utf8') !== 'fresh build') process.exit(9);
    process.exit(${gateStatus});
  `);
  const run = () => spawnSync(process.execPath, ['scripts/run-prepush.mjs'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_DIR: 'invalid-hook-context' },
  });
  return { dir, run, close: () => rmSync(dir, { recursive: true, force: true }) };
}

test('fresh checkout prepares generated inputs before both smoke gates', () => {
  const f = fixture(0, 0);
  try {
    const r = f.run();
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(f.dir, 'gates-called'), 'utf8')), ['test:tools', 'test:tool-url']);
  } finally { f.close(); }
});

test('build failure preserves failure status and never starts gates', () => {
  const f = fixture(7, 0);
  try {
    assert.equal(f.run().status, 7);
    assert.equal(existsSync(join(f.dir, 'gates-called')), false);
  } finally { f.close(); }
});

test('prepared inputs do not conceal gate failure', () => {
  const f = fixture(0, 4);
  try { assert.equal(f.run().status, 4); } finally { f.close(); }
});
