import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const original = readFileSync(new URL('./audit-deploy-health.mjs', import.meta.url), 'utf8');
const source = original
  .replace("import { execFileSync } from 'node:child_process';", '')
  .replace("import { liveBuildUrl, buildRevision } from './lib/live-url.mjs';", '');
const judge = new Function('execFileSync', 'liveBuildUrl', 'buildRevision', 'process', 'console', source);

function inspect({ behind = '0', ageHours = 5, failure = false, killed = false, unavailable = false } = {}, code = source) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const runs = [{ databaseId: 1, status: 'completed', conclusion: 'success',
    createdAt: iso(now - ageHours * 3600000 - 240000), updatedAt: iso(now - ageHours * 3600000) }];
  if (failure || killed) runs.unshift({ databaseId: 2, status: 'completed',
    conclusion: killed ? 'cancelled' : 'failure', createdAt: iso(now - 600000), updatedAt: iso(now - 300000) });
  const output = [];
  const exec = (command, args) => {
    if (command === 'gh' && args[0] === 'run' && args[1] === 'list') return JSON.stringify(runs);
    if (command === 'gh' && args[0] === 'api') return JSON.stringify({ jobs: [{ s: iso(now - 600000), c: iso(now - 300000) }] });
    if (command === 'gh' && args.includes('--log-failed')) return 'error TS1234';
    if (command === 'curl') {
      if (unavailable) throw new Error('fixture unavailable');
      return JSON.stringify({ sha: 'a'.repeat(40) });
    }
    if (command === 'git' && args[0] === 'fetch') return '';
    if (command === 'git' && args[0] === 'rev-list') return behind;
    if (command === 'git' && args[0] === 'log') return '5 hours ago';
    throw new Error(`Unexpected fixture command ${command}`);
  };
  let status = 0;
  const exit = {};
  try {
    const run = code === source ? judge : new Function('execFileSync', 'liveBuildUrl', 'buildRevision', 'process', 'console', code);
    run(exec, () => 'https://fixture.invalid/build.json', (value) => value.sha,
      { argv: ['node', 'fixture', '--hours=6'], exit(value) { status = value; throw exit; } },
      { log(value) { output.push(value); }, error(value) { output.push(value); } });
  } catch (error) { if (error !== exit) throw error; }
  return { status, output: output.join('\n') };
}

test('old successful deployment with no unpublished commit is idle, formerly false failure', () => {
  const before = source.replace('lag.behind > 0 && Date.now()', 'Date.now()');
  assert.equal(inspect({}, before).status, 1);
  const after = inspect();
  assert.equal(after.status, 0);
  assert.match(after.output, /정상 유휴/);
});

test('unpublished commit still fails after three hours', () => {
  assert.equal(inspect({ behind: '1' }).status, 1);
  assert.equal(inspect({ behind: '1', ageHours: 1 }).status, 0);
});

test('ten unpublished commits fail even after a recent successful deployment', () => {
  assert.equal(inspect({ behind: '10', ageHours: 1 }).status, 1);
});

test('new actual failures and interrupted builds remain failures', () => {
  assert.equal(inspect({ failure: true }).status, 1);
  assert.equal(inspect({ killed: true }).status, 1);
});

test('unavailable and invalid lag measurements are unmeasured, not idle', () => {
  assert.equal(inspect({ unavailable: true }).status, 2);
  for (const behind of ['NaN', '-1', '', '1.5', '9007199254740992']) {
    const result = inspect({ behind });
    assert.equal(result.status, 2, behind);
    assert.doesNotMatch(result.output, /정상 유휴/);
  }
});

test('confirmed failure takes priority over unmeasured lag', () => {
  assert.equal(inspect({ failure: true, unavailable: true }).status, 1);
  assert.equal(inspect({ killed: true, behind: 'NaN' }).status, 1);
});
