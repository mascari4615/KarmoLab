import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { toolDetailCss, stripComments } from './shell-css.mjs';
import { loadShell, shellCommon } from './shell-page.mjs';
import { serveRepo } from './serve-static.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'css/tools.css'), 'utf8');
const shell = loadShell(root);
const page = (toolDetail = false) => shellCommon(shell, {
  permalink: toolDetail ? '/t/loan/' : '/t/', lastModified: '2026-10-26', bootPaths: [], toolDetail
});
const fullDeferred = '<link rel="stylesheet" href="/apps/karmolab/css/tools.min.css" media="print">';
const fullBlocking = '<link rel="stylesheet" href="/apps/karmolab/css/tools.min.css">';
const detailBlocking = '<link rel="stylesheet" href="/apps/karmolab/css/tools-detail.min.css">';

test('detail subset removes only the marked hub section, preserving every other character and order', () => {
  const start = source.indexOf('/* ═══════════════════════════════════════ 도구 목록 전용');
  const end = source.indexOf('/* ═══════════════════════════════════════\n   자료표', start);
  assert.ok(start > 0 && end > start);
  assert.equal(toolDetailCss(source), source.slice(0, start) + source.slice(end));
  assert.ok(stripComments(source).length - stripComments(toolDetailCss(source)).length > 4000);
});

test('the section marker is required exactly once', () => {
  assert.throws(() => toolDetailCss(source.replace('도구 목록 전용', 'unmarked')));
  assert.throws(() => toolDetailCss(source + '\n/* ═══ 도구 목록 전용 ═══ */\na{}'));
});

test('subset preserves surrounding selectors and nested rules', () => {
  const fixture = '/* ═══ common ═══ */\na{color:red}\n/* ═══ 도구 목록 전용 ═══ */\n.hub{}\n/* ═══ tail ═══ */\n@media(print){b{color:blue}}';
  assert.equal(toolDetailCss(fixture), '/* ═══ common ═══ */\na{color:red}\n/* ═══ tail ═══ */\n@media(print){b{color:blue}}');
});

test('detail blocks only on the subset and keeps the existing full deferred activation path', () => {
  const html = page(true);
  assert.ok(html.includes(detailBlocking));
  assert.ok(html.includes(fullDeferred));
  assert.equal(html.split(fullBlocking).length - 1, 1, 'full blocking link remains only inside noscript');
  assert.ok(html.includes("link[rel=\"stylesheet\"][media=\"print\"]"));
});

test('hub keeps its full blocking bundle and the home template remains unchanged', () => {
  assert.ok(page().includes(fullBlocking));
  assert.ok(!page().includes(detailBlocking));
  assert.ok(shell.includes(fullDeferred));
  assert.ok(!shell.includes(detailBlocking));
});

test('detail generation opts in without changing hub generation or the performance budget', () => {
  const generator = fs.readFileSync(path.join(root, 'scripts/gen-tool-pages.mjs'), 'utf8');
  assert.equal(generator.split('toolDetail: true').length - 1, 1);
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'data/blocking-css-total.json'), 'utf8'));
  assert.deepEqual(budget.list, { loan: 185410, charcount: 185410, jsonfmt: 185410, qrgen: 185410 });
});

test('static helper keeps default fallback but strict callers get missing 404 and real files 200', async () => {
  const normal = await serveRepo(), strict = await serveRepo({ fallbackShell: false });
  try {
    const missing = '/t/__missing_css_subset_fixture__/';
    const fallback = await fetch(normal.base + missing);
    assert.equal(fallback.status, 200); await fallback.text();
    const absent = await fetch(strict.base + missing);
    assert.equal(absent.status, 404); await absent.text();
    const real = await fetch(strict.base + '/apps/karmolab/index.html');
    assert.equal(real.status, 200); await real.text();
  } finally { normal.close(); strict.close(); }
});

test('style token audit walks source CSS while excluding only the known generated bundles', () => {
  const audit = fs.readFileSync(path.join(root, 'scripts/audit-style-tokens.mjs'), 'utf8');
  const start = audit.indexOf('function walk(dir, fn)');
  const end = audit.indexOf('\nfunction stripComments', start);
  assert.ok(start >= 0 && end > start);
  const names = ['tools.css', 'theme.css', 'tools-detail.css', 'tools-other.min.css',
    'tools.min.css', 'tools-detail.min.css', 'shell-critical.css', 'shell-deferred.css', 'tools.aabbccdd.css'];
  const seen = [];
  runInNewContext(audit.slice(start, end) + '\nwalk("/fixture/css", file => seen.push(path.basename(file)));', {
    fs: { readdirSync: () => names.map(name => ({ name, isDirectory: () => false })) }, path, SKIP: new Set(), seen
  });
  assert.deepEqual(seen, ['tools.css', 'theme.css', 'tools-detail.css', 'tools-other.min.css']);
});
