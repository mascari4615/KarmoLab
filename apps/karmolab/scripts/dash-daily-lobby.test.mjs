import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const app = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: `import './src/widgets/mydash/home'; import './src/widgets/mydash/daily'; import './src/widgets/mydash/appearance'; export * from './src/widgets/mydash/lobby-look';`, resolveDir: app },
  bundle: true, write: false, format: 'iife', globalName: 'Look', logLevel: 'silent',
  plugins: [{ name: 'test-google', setup(context) { context.onLoad({ filter: /[\\/]planner[\\/]gauth\.ts$/ }, () => ({ contents: 'export async function ensureToken(){return null} export function notificationRefreshToken(){return null}', loader: 'js' })); } }],
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function screen(t, panel, { tasks = [], reportTasks = [], reportEvents = [] } = {}) {
  const dom = new JSDOM('<html data-theme="light"><main></main></html>', { url: 'https://fixture.invalid/', runScripts: 'outside-only' });
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { mydash: JSON.parse(readFileSync(join(app, 'i18n/ko/mydash.json'), 'utf8')) } };
  window.localStorage.setItem('karmolab_planner_tasks', JSON.stringify(tasks));
  window.fetch = async () => ({ ok: true, json: async () => ({ collectedAt: new Date().toISOString(), connected: true, errors: [], settings: { enabled: false, hour: 9, minute: 0, reminderMinutes: 30, animeIds: [] }, events: reportEvents, tasks: reportTasks, anime: [] }) });
  window.eval(bundle.outputFiles[0].text);
  const disposers = [], opened = [];
  const root = window.document.querySelector('main');
  let current = true;
  const ctx = { root, repo: { readJson: async () => ({}), list: async () => [] }, repoInfo: { owner: 'fixture', repo: 'fixture', branch: 'main' }, ghToken: async () => 'fixture-only', status() {}, setCount() {}, isCurrent: () => current, onDispose: fn => disposers.push(fn), openItem: item => opened.push(item) };
  await window.KarmoDash.panels.find(item => item.id === panel).render(ctx);
  await tick(); await tick();
  const dispose = () => { current = false; disposers.forEach(fn => fn()); };
  t.after(() => { dispose(); dom.window.close(); });
  return { window, root, get: selector => root.querySelector(selector), opened, dispose };
}

test('home is navigation and character only, without capture or notification panels', async t => {
  const ui = await screen(t, 'home');
  assert.equal(ui.get('.mydq'), null);
  assert.equal(ui.get('.pl-notifications'), null);
  ui.get('[data-open="daily"]').click();
  ui.get('[data-open="appearance"]').click();
  assert.deepEqual(ui.opened, ['daily', 'appearance']);
  assert.ok(ui.get('.mydh-yawn'));
});

test('today plus the next seven days includes day seven but excludes day eight', async t => {
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const date = offset => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const ui = await screen(t, 'daily', { reportEvents: [
    { id: 'google-day-seven', title: '7일 뒤 일정', start: date(7), end: date(8), allDay: true },
    { id: 'google-day-eight', title: '8일 뒤 일정', start: date(8), end: date(9), allDay: true },
  ] });
  assert.match(ui.get('.mydd-agenda').textContent, /7일 뒤 일정/);
  assert.doesNotMatch(ui.get('.mydd-agenda').textContent, /8일 뒤 일정/);
});

test('daily page saves into existing diary and opens notification controls in one page', async t => {
  const ui = await screen(t, 'daily');
  assert.ok(ui.get('.mydq'));
  assert.ok(ui.get('.mydd-agenda'));
  assert.ok(ui.get('.pl-notifications--compact'));
  assert.equal(ui.get('.pl-notify-report').hidden, true);
  ui.get('textarea').value = '오늘 기록 테스트';
  ui.get('form').dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(JSON.parse(ui.window.localStorage.getItem('karmolab_planner_diary'))[0].text, '오늘 기록 테스트');
});

test('daily agenda uses current local tasks once and includes remote tasks', async t => {
  const task = { id: 'local__fixture', title: '로컬 할 일', column: 'inProgress' };
  const ui = await screen(t, 'daily', { tasks: [task], reportTasks: [{ ...task, status: 'needsAction' }, { id: 'google-task', title: '구글 할 일', status: 'needsAction' }] });
  const text = ui.get('.mydd-agenda').textContent;
  assert.equal(text.split('로컬 할 일').length - 1, 1);
  assert.match(text, /구글 할 일/);
  ui.get('[data-complete]').click();
  assert.equal(JSON.parse(ui.window.localStorage.getItem('karmolab_planner_tasks'))[0].column, 'done');
  ui.get('[data-undo]').click();
  assert.equal(JSON.parse(ui.window.localStorage.getItem('karmolab_planner_tasks'))[0].column, 'inProgress');
});

test('character, outfit and background choices persist and update the home sprite', async t => {
  const ui = await screen(t, 'appearance');
  ui.get('[data-character="alisa"]').click();
  assert.equal(ui.window.localStorage.getItem('dash.lobby.outfit'), 'alisa-original');
  assert.match(ui.get('.mydl-character').src, /alisa\.webp$/);
  ui.get('[data-background="dusk"]').click();
  assert.equal(ui.window.localStorage.getItem('toolbox_home_bg'), 'dusk');
  assert.equal(ui.window.document.documentElement.dataset.homeBg, 'dusk');
  const image = ui.window.document.createElement('img');
  image.className = 'mydh-yawn'; ui.root.appendChild(image);
  ui.window.Look.applyLobbyLook();
  assert.match(image.src, /alisa\.webp$/);
  ui.get('[data-outfit="none"]').click();
  assert.equal(image.hidden, true);
  ui.window.localStorage.setItem('dash.lobby.outfit', 'not-a-script');
  assert.equal(ui.window.Look.lobbyLook().outfit, 'yon-original');
  assert.throws(() => ui.window.Look.saveLobbyLook('outfit', 'javascript:alert(1)'));
});

test('failed appearance save preserves the previous selection', async t => {
  const ui = await screen(t, 'appearance');
  ui.window.Storage.prototype.setItem = () => { throw new Error('quota'); };
  ui.get('[data-character="alisa"]').click();
  assert.equal(ui.window.Look.lobbyLook().outfit, 'yon-original');
  assert.match(ui.get('.mydl-status').textContent, /저장하지 못했어요/);
});

test('every selectable built-in image exists in the app', async t => {
  const ui = await screen(t, 'appearance');
  assert.equal(ui.window.Look.LOBBY_CHARACTERS.length, 3);
  for (const character of ui.window.Look.LOBBY_CHARACTERS) assert.ok(character.outfits.length >= 2, character.id);
  const files = [...ui.window.Look.LOBBY_BACKGROUNDS.map(item => item.image), ...ui.window.Look.LOBBY_CHARACTERS.flatMap(character => character.outfits.map(outfit => outfit.image))];
  for (const file of files) assert.ok(existsSync(join(app, file.replace('/apps/karmolab/', ''))), file);
  ui.window.Look.saveLobbyLook('background', 'winter');
  assert.match(ui.window.document.documentElement.style.getPropertyValue('--dash-photo'), /winter-meadow/);
  ui.window.Look.saveLobbyLook('background', 'auto');
  assert.equal(ui.window.document.documentElement.style.getPropertyValue('--dash-photo'), '');
});
