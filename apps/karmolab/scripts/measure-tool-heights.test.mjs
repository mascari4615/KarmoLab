import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./measure-tool-heights.mjs', import.meta.url), 'utf8');
const start = source.indexOf('if (check) {');
const end = source.indexOf('\nconst sorted =', start);
assert.ok(start >= 0 && end > start, 'the real check branch must be present');
const branch = source.slice(start, end);
const tolerance = Number(source.match(/const TOLERANCE = (\d+);/)?.[1]);
assert.equal(tolerance, 24);

function check({ platform = 'win32', meta = { platform: 'win32' }, measured = 100 } = {}) {
  const exit = {};
  let status;
  try {
    runInNewContext(branch, {
      check: true, meta, TOLERANCE: tolerance, WIDTHS: { narrow: 390, wide: 1280 },
      todo: ['fixture'], prev: { fixture: { narrow: 100, wide: 100 } },
      out: { fixture: { narrow: measured, wide: measured } },
      console: { log() {}, error() {} },
      process: { platform, exit(code) { status = code; throw exit; } },
    });
    assert.fail('the check branch must return an explicit exit status');
  } catch (error) {
    if (error !== exit) throw error;
  }
  return status;
}

test('different operating systems are unmeasured, not a successful height comparison', () => {
  assert.equal(check({ platform: 'linux' }), 2);
});

test('matching operating system and height still pass', () => {
  assert.equal(check(), 0);
});

test('the existing 24px tolerance boundary still passes', () => {
  assert.equal(check({ measured: 124 }), 0);
});

test('an actual height over the existing tolerance still fails', () => {
  assert.equal(check({ measured: 125 }), 1);
});

test('missing platform metadata preserves the existing height comparison', () => {
  assert.equal(check({ meta: null }), 0);
  assert.equal(check({ meta: null, measured: 125 }), 1);
});

const auditSource = readFileSync(new URL('./audit-all.mjs', import.meta.url), 'utf8')
  .replace("import { spawnSync } from 'node:child_process';", '');

function audit(statuses = {}) {
  const calls = [], output = [], exit = {};
  let status = 0;
  try {
    runInNewContext(auditSource, {
      spawnSync(_command, args) { const script = args.at(-1); calls.push(script); return { status: statuses[script] ?? 0 }; },
      console: { log(value) { output.push(String(value)); }, error(value) { output.push(String(value)); } },
      process: { platform: 'linux', env: {}, exit(code) { status = code; throw exit; } },
    });
  } catch (error) {
    if (error !== exit) throw error;
  }
  return { status, calls, output: output.join('\n') };
}

test('audit-all reports an unmeasured height separately and continues later checks', () => {
  const result = audit({ 'audit:scripts': 2, 'audit:heights': 2 });
  assert.equal(result.status, 2);
  assert.match(result.output, /CANNOT.*audit:heights/);
  assert.match(result.output, /통과 16, 실패 0, 못 돌림 2/);
  assert.equal(result.calls.length, 19);
  assert.equal(result.calls.at(-1), 'ratchet:tighten');
});

test('audit-all preserves failure precedence over unmeasured results', () => {
  const result = audit({ 'audit:scripts': 2, 'audit:heights': 1 });
  assert.equal(result.status, 1);
  assert.match(result.output, /FAIL.*audit:heights/);
  assert.match(result.output, /통과 16, 실패 1, 못 돌림 1/);
  assert.equal(result.calls.length, 19);
});

test('audit-all all-pass status and independent ratchet behavior are unchanged', () => {
  const result = audit({ 'ratchet:tighten': 1 });
  assert.equal(result.status, 0);
  assert.match(result.output, /통과 18, 실패 0, 못 돌림 0/);
  assert.equal(result.calls.at(-1), 'ratchet:tighten');
});
