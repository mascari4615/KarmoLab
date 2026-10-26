import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const entry = fileURLToPath(new URL('../src/widgets/planner/quick-capture.ts', import.meta.url));
const { outputFiles } = await build({
  stdin: { contents: `export { mountQuickCapture } from ${JSON.stringify(entry)}`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', globalName: 'Capture', logLevel: 'silent'
});
function screen(t, initial = {}) {
  const dom = new JSDOM('<main><div class="mydh-grid"></div></main>', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  for (const [key, value] of Object.entries(initial)) window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  window.eval(outputFiles[0].text);
  const disposers = [], opened = [];
  const root = window.document.querySelector('main');
  const mount = () => window.Capture.mountQuickCapture({ root, onDispose: fn => disposers.push(fn), isCurrent: () => true, openItem: item => opened.push(item) });
  mount();
  const get = selector => root.querySelector(selector);
  const read = key => JSON.parse(window.localStorage.getItem(key));
  const input = value => { get('textarea').value = value; get('textarea').dispatchEvent(new window.Event('input', { bubbles: true })); };
  const submit = () => get('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  return { window, root, get, read, input, submit, disposers, opened, mount };
}

test('append to existing diary, refresh, and render literal HTML safely', t => {
  const ui = screen(t, { karmolab_planner_diary: [{ date: '2026-10-26', text: '기존 기록', updatedAt: 1 }] });
  ui.get('[name="quick-date"]').value = '2026-10-26';
  ui.input('<img src=x onerror=alert(1)> 오늘 기록');
  ui.submit();
  assert.equal(ui.read('karmolab_planner_diary')[0].text, '기존 기록\n\n<img src=x onerror=alert(1)> 오늘 기록');
  assert.equal(ui.get('textarea').value, '');
  assert.equal(ui.get('.mydq-recent img'), null);
  ui.submit();
  assert.equal(ui.read('karmolab_planner_diary').length, 1);
  ui.disposers.splice(0).forEach(fn => fn());
  ui.get('.mydq').remove();
  ui.mount();
  assert.match(ui.get('.mydq-recent').textContent, /기존 기록/);
});

test('task goes into existing kanban, completion and undo persist', t => {
  const ui = screen(t);
  ui.get('[data-kind="task"]').click();
  ui.input('병원 예약');
  ui.submit();
  assert.equal(ui.read('karmolab_planner_tasks')[0].column, 'todo');
  ui.get('[data-done]').click();
  assert.equal(ui.read('karmolab_planner_tasks')[0].column, 'done');
  ui.get('.mydq-undo').click();
  assert.equal(ui.read('karmolab_planner_tasks')[0].column, 'todo');
  ui.get('.mydq-open').click();
  assert.equal(ui.window.localStorage.getItem('karmolab.planner.side'), 'kanban');
  assert.deepEqual(ui.opened, ['planner']);
});

test('all day event uses exclusive next day end across year boundary', t => {
  const ui = screen(t);
  ui.get('[data-kind="event"]').click();
  ui.get('[name="quick-date"]').value = '2026-12-31';
  ui.input('휴가');
  ui.submit();
  const event = ui.read('karmolab_planner_events')[0];
  assert.equal(event.start, '2026-12-31');
  assert.equal(event.end, '2027-01-01');
  assert.equal(event.allDay, true);
});

test('timed event uses Korean time and crosses midnight correctly', t => {
  const ui = screen(t);
  ui.get('[data-kind="event"]').click();
  ui.get('[name="quick-date"]').value = '2026-10-26';
  ui.get('[name="quick-time"]').value = '23:30';
  ui.input('친구와 통화');
  ui.submit();
  const event = ui.read('karmolab_planner_events')[0];
  assert.equal(event.start, '2026-10-26T23:30:00+09:00');
  assert.equal(event.end, '2026-10-26T15:30:00.000Z');
  assert.equal(event.allDay, false);
});

test('failed storage retains draft and existing diary, no false saved status', t => {
  const ui = screen(t, { karmolab_planner_diary: [{ date: '2026-10-26', text: '보존', updatedAt: 1 }] });
  ui.get('[name="quick-date"]').value = '2026-10-26';
  ui.input('저장할 기록');
  ui.window.Storage.prototype.setItem = () => { throw new Error('quota'); };
  ui.submit();
  assert.equal(ui.get('textarea').value, '저장할 기록');
  assert.equal(ui.read('karmolab_planner_diary')[0].text, '보존');
  assert.match(ui.get('[role="alert"]').textContent, /저장하지 못했어요/);
});

test('invalid stored data remains unchanged on save attempt', t => {
  const ui = screen(t, { karmolab_planner_diary: '{broken original' });
  ui.input('새 기록');
  ui.submit();
  assert.equal(ui.window.localStorage.getItem('karmolab_planner_diary'), '{broken original');
  assert.equal(ui.get('textarea').value, '새 기록');
  assert.match(ui.get('[role="alert"]').textContent, /기존 저장 내용/);
});

test('invalid diary row is not silently discarded by append', t => {
  const original = [{ date: '2026-10-26', text: '보존', updatedAt: 1 }, { unexpected: '보존할 원본' }];
  const ui = screen(t, { karmolab_planner_diary: original });
  ui.input('새 기록');
  ui.submit();
  assert.deepEqual(ui.read('karmolab_planner_diary'), original);
  assert.equal(ui.get('textarea').value, '새 기록');
});

test('undo restores an in-progress task to its previous column', t => {
  const ui = screen(t, { karmolab_planner_tasks: [{ id: 'local__progress', title: '하던 일', column: 'inProgress' }] });
  ui.get('[data-done]').click();
  ui.get('.mydq-undo').click();
  assert.equal(ui.read('karmolab_planner_tasks')[0].column, 'inProgress');
});

test('unsent draft survives remount and stays during other tab changes', t => {
  const ui = screen(t);
  ui.get('[data-kind="task"]').click();
  ui.input('아직 작성 중');
  ui.disposers.splice(0).forEach(fn => fn());
  ui.get('.mydq').remove();
  ui.mount();
  assert.equal(ui.get('textarea').value, '아직 작성 중');
  assert.equal(ui.get('[data-kind="task"]').getAttribute('aria-pressed'), 'true');
  ui.window.localStorage.setItem('karmolab_planner_tasks', JSON.stringify([{ id: 'local__external', title: '다른 탭', column: 'todo' }]));
  ui.window.dispatchEvent(new ui.window.Event('storage'));
  assert.equal(ui.get('textarea').value, '아직 작성 중');
  assert.match(ui.get('.mydq-recent').textContent, /다른 탭/);
  ui.disposers.splice(0).forEach(fn => fn());
  ui.window.localStorage.setItem('karmolab_planner_tasks', '[]');
  ui.window.dispatchEvent(new ui.window.Event('storage'));
  assert.match(ui.get('.mydq-recent').textContent, /다른 탭/);
});

test('empty old draft does not pin a new record to yesterday', t => {
  const ui = screen(t, { 'planner.quick-capture.draft': { text: '', kind: 'diary', date: '2020-01-01', time: '' } });
  assert.equal(ui.get('[name="quick-date"]').value, new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  ui.input('あとで削除');
  ui.input('');
  assert.equal(ui.window.localStorage.getItem('planner.quick-capture.draft'), null);
});
