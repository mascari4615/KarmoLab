import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = path.dirname(fileURLToPath(import.meta.url));

test('generated Markdown survives assembly and host split as literal text', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-md-output-'));
  const app = path.join(fixture, 'apps', 'karmolab');
  const site = path.join(fixture, 'apps', 'blog');
  const write = (relative, text) => {
    const file = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const run = (script, args = []) => execFileSync(process.execPath, [script, ...args], {
    cwd: fixture, encoding: 'utf8', stdio: 'pipe',
  });
  try {
    for (const relative of ['gen-tool-md.mjs', 'lib/retired-operations.mjs']) {
      write(`apps/karmolab/scripts/${relative}`, fs.readFileSync(path.join(scripts, relative)));
    }
    const literal = '설명 {{ literal }} / {% literal %}';
    const blogLink = 'https://blog.mascari4615.com/posts/example/';
    write('apps/karmolab/data/tools-seo.json', JSON.stringify({ tools: {
      'memo-atlas': { description: literal, howto: [blogLink] },
    } }));
    write('apps/karmolab/js/widgets-lazy-meta.js',
      'window.KARMOLAB_LAZY_META=[{id:"memo-atlas",title:"기록 지도"}];');
    write('apps/karmolab/src/core/memo-atlas.ts', 'export const spec = {\n    inspect: {\n    }\n};');
    for (const relative of ['index.html', 'posts/index.html', 'dash/index.html']) {
      write(`apps/blog/${relative}`, '<!doctype html><title>fixture</title>');
    }

    run(path.join(app, 'scripts/gen-tool-md.mjs'));
    const generated = fs.readFileSync(path.join(site, 'tmd/memo-atlas.txt'), 'utf8');
    assert.match(generated, /^---\npermalink: \/t\/memo-atlas\.md\n---\n# 기록 지도/);
    assert.ok(generated.includes(literal));
    assert.ok(!generated.includes('{% raw %}') && !generated.includes('{% endraw %}'));

    const assembled = path.join(fixture, 'assembled');
    run(path.join(scripts, 'assemble-site.mjs'), ['--site', site, '--out', assembled]);
    const beforeSplit = fs.readFileSync(path.join(assembled, 't/memo-atlas.md'), 'utf8');
    assert.ok(beforeSplit.startsWith('# 기록 지도\n'));
    assert.ok(beforeSplit.includes(literal));
    const split = path.join(fixture, 'split');
    run(path.join(scripts, 'split-outputs.mjs'), ['--site', assembled, '--out', split]);
    const markdown = fs.readFileSync(path.join(split, 'lab/t/memo-atlas.md'), 'utf8');
    assert.ok(markdown.startsWith('# 기록 지도\n'));
    assert.ok(markdown.includes(literal));
    assert.ok(markdown.includes('열기: https://lab.mascari4615.com/t/memo-atlas/'));
    assert.ok(markdown.includes('https://lab.mascari4615.com/t/memo-atlas/?op='));
    assert.ok(markdown.includes(blogLink));
    assert.ok(!markdown.includes('https://blog.mascari4615.com/t/'));
    assert.ok(!markdown.includes('{% raw %}') && !markdown.includes('{% endraw %}'));
    assert.doesNotMatch(markdown, /<!doctype|<html|<h1/i);
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('tool-md-output-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
