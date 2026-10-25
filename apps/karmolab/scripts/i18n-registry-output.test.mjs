import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('registry audit generation leaves runtime translations intact', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-registry-output-'));
  const put = (relative, bytes) => {
    const file = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  try {
    for (const relative of ['scripts/build-i18n.mjs', 'scripts/lib/locales.mjs', 'scripts/lib/widgets-meta.mjs', 'data/locales.json', 'data/regions.json']) {
      put(relative, fs.readFileSync(path.join(app, relative)));
    }
    put('src/lib/i18n-registry.ts', 'old locale registry');
    put('src/lib/region-registry.ts', 'old region registry');
    const runtime = path.join(fixture, 'js/i18n/ko/hacker.js');
    put('js/i18n/ko/hacker.js', 'window.RUNTIME_TRANSLATION_FROZEN=true;');
    fs.utimesSync(runtime, 1000, 1000);
    const before = { bytes: fs.readFileSync(runtime), mtime: fs.statSync(runtime).mtimeMs };
    const command = path.join(fixture, 'scripts/build-i18n.mjs');
    execFileSync(process.execPath, [command, '--registries-only'], { cwd: fixture, stdio: 'pipe' });
    assert.equal(fs.readFileSync(path.join(fixture, 'src/lib/i18n-registry.ts'), 'utf8').replaceAll('\r\n', '\n'), fs.readFileSync(path.join(app, 'src/lib/i18n-registry.ts'), 'utf8').replaceAll('\r\n', '\n'));
    assert.equal(fs.readFileSync(path.join(fixture, 'src/lib/region-registry.ts'), 'utf8').replaceAll('\r\n', '\n'), fs.readFileSync(path.join(app, 'src/lib/region-registry.ts'), 'utf8').replaceAll('\r\n', '\n'));
    assert.deepEqual(fs.readFileSync(runtime), before.bytes);
    assert.equal(fs.statSync(runtime).mtimeMs, before.mtime);
    assert.deepEqual(fs.readdirSync(path.join(fixture, 'js/i18n/ko')), ['hacker.js']);
    assert.throws(() => execFileSync(process.execPath, [command, '--registries-only', '--check'], { cwd: fixture, stdio: 'pipe' }), /Command failed/);
    assert.deepEqual(fs.readFileSync(runtime), before.bytes);
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('i18n-registry-output-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
