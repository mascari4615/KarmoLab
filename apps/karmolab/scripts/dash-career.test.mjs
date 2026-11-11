import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

/* Dash 커리어 방. 정본 형식은 memo data/career/README.md.
   MEMO_DIR 를 주면 실제 memo 정본으로도 한 번 그린다 (CI 에는 memo 가 없어 건너뜀). */
const base = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `import './src/widgets/mydash/career'; import { parseVariants } from './src/widgets/mydash/career'; window.test = { parseVariants };`, resolveDir: base }, bundle: true, write: false, format: 'iife', logLevel: 'silent', loader: { '.css': 'text' } });

const md = (ids, extra = '') => ids.map((id) => `## ${id}. ${id} 제목\n\n- 중심: ${id} 중심\n- 장점: ${id} 장점\n\n<!-- answer:${id} -->\n${id} 본문 첫 줄${extra}\n둘째 줄\n<!-- /answer:${id} -->\n`).join('\n');
const fixture = {
  'data/career/applications.json': { applications: [{ id: 'acme-2026', company: '<b>Acme</b>', role: '인턴', status: 'drafting', deadline: '2099-01-01T00:00:00+09:00', links: [{ label: 'bad', url: 'javascript:alert(1)' }, { label: '공고', url: 'https://example.com/a' }], draftsDir: 'career/x', caseIds: ['c1'], picks: { 1: 'B' }, questions: [{ id: 1, title: '동기', limit: 700, prompt: '왜?', file: 'q1.md' }, { id: 2, title: '분석', limit: 700, prompt: '게임', paused: true }, { id: 3, title: '짧게', limit: 10, prompt: '짧게', file: 'q3.md' }] }] },
  'data/career/cases.json': { cases: [{ id: 'c1', company: 'Acme', role: '개발', period: '2021', kind: 'essay', stage: '서류', source: '출처', url: 'https://example.com/c', takeaway: '요점', answers: [{ question: 'Q<img src=x>', answer: 'A', note: 'N' }] }] },
  'career/x/q1.md': md(['A', 'B', 'C']),
  'career/x/q3.md': md(['A'], ' 긴 본문이라 제한 초과'),
};

function screen(t, files) {
  const dom = new JSDOM('<html lang="ko"><main id="root"></main></html>', { url: 'http://localhost/dash/#career', runScripts: 'outside-only', pretendToBeVisual: true });
  const dispose = [];
  t.after(() => { dispose.forEach((fn) => fn()); dom.window.close(); });
  const w = dom.window;
  w.eval(bundle.outputFiles[0].text);
  const panel = w.KarmoDash.panels.find((p) => p.id === 'career');
  const root = w.document.getElementById('root');
  const get = (path) => { if (!(path in files)) throw Object.assign(Error('notfound ' + path), { kind: 'notfound' }); return files[path]; };
  const ctx = {
    root,
    repo: { readJson: async (p) => structuredClone(get(p)), readText: async (p) => get(p) },
    repoInfo: { owner: 'o', repo: 'memo', branch: 'main' },
    status() {}, setCount() {}, openItem() {}, isCurrent: () => true, onDispose: (fn) => dispose.push(fn), ghToken: async () => null,
  };
  return { w, root, ctx, panel };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('parseVariants reads any letter count and skips empty bodies', (t) => {
  const { w } = screen(t, fixture);
  const vs = w.test.parseVariants(md(['A', 'B', 'C', 'D']) + '\n## E. 빈 안\n\n<!-- answer:E -->\n<!-- /answer:E -->\n');
  assert.equal(vs.map((v) => v.id).join(''), 'ABCD');
  assert.equal(vs[0].focus, 'A 중심');
  assert.equal(vs[0].text, 'A 본문 첫 줄\n둘째 줄');
});

test('drafts tab shows questions, picks, counts and escapes data', async (t) => {
  const { root, ctx, panel } = screen(t, fixture);
  await panel.render(ctx);
  await settle();
  assert.equal(root.querySelectorAll('.cr-qnav button').length, 3);
  assert.equal(root.querySelectorAll('.cr-variant').length, 3);
  assert.ok(root.querySelector('.cr-picked h4').textContent.startsWith('B.'));
  assert.equal(root.querySelectorAll('b b, img[src=x], a[href^="javascript"]').length, 0);
  assert.match(root.querySelector('.cr-head').textContent, /D-\d+/);
  root.querySelector('[data-q="1"]').click();
  await settle();
  assert.match(root.querySelector('.cr-variants').textContent, /보류/);
  root.querySelector('[data-q="2"]').click();
  await settle();
  assert.match(root.querySelector('.cr-variant footer').textContent, /초과/);
});

test('cases tab lists linked cases and the hash keeps the tab', async (t) => {
  const { w, root, ctx, panel } = screen(t, fixture);
  await panel.render(ctx);
  root.querySelector('[data-tab="cases"]').click();
  await settle();
  assert.equal(root.querySelectorAll('.cr-case').length, 1);
  assert.equal(root.querySelectorAll('.cr-case li').length, 1);
  assert.equal(root.querySelectorAll('img[src=x]').length, 0);
  assert.equal(decodeURIComponent(w.location.hash), '#career/acme-2026/cases');
});

test('real memo canon renders when MEMO_DIR is given', { skip: !process.env.MEMO_DIR }, async (t) => {
  const dir = process.env.MEMO_DIR;
  const read = async (p) => readFile(`${dir}/${p}`, 'utf8');
  const apps = JSON.parse(await read('data/career/applications.json'));
  const files = { 'data/career/applications.json': apps, 'data/career/cases.json': JSON.parse(await read('data/career/cases.json')) };
  for (const a of apps.applications) for (const q of a.questions) if (q.file && existsSync(`${dir}/${a.draftsDir}/${q.file}`)) files[`${a.draftsDir}/${q.file}`] = await read(`${a.draftsDir}/${q.file}`);
  const { root, ctx, panel } = screen(t, files);
  await panel.render(ctx);
  await settle();
  const total = { variants: 0 };
  for (let i = 0; i < apps.applications[0].questions.length; i++) {
    root.querySelector(`[data-q="${i}"]`).click();
    await settle();
    total.variants += root.querySelectorAll('.cr-variant').length;
    assert.equal(root.querySelectorAll('.cr-over').length, 0);
  }
  console.log('real canon variants', total.variants);
  assert.ok(total.variants > 0);
});
