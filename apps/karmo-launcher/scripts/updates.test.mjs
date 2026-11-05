import test from 'node:test';
import assert from 'node:assert/strict';
import { accentOf, castLine, castState, logoSource, mascotSource, autoPlan, fmtAgo, fmtDuration, hasUpdate, inWindow, newer, parseArgs, remoteOf, retryAt, tickSeconds, trayApps, visibleApps } from '../ui/updates.js';

const NOON = new Date(2026, 10, 5, 12, 0);
const app = (id, extra = {}) => ({ id, name: id, kind: 'tauri', install: { format: 'nsis' }, ...extra });
const old = (extra = {}) => ({ installed: true, version: '1.0.0', latest: '1.0.1', download: 'https://x', ...extra });
const plan = (apps, entries, prefs = {}, date = NOON, failures) => autoPlan(apps, new Map(entries), prefs, date, failures);

test('일시정지한 판은 자동으로 안 받고, 새 판이 나오면 다시 받음', () => {
  const apps = [{ id: 'wm', kind: 'unity', install: { format: 'zip' } }];
  const st = (latest) => [['wm', { installed: true, version: '1.0.0', latest, download: 'x' }]];
  const prefs = { paused: { wm: { version: '1.0.1' } } };
  assert.deepEqual(plan(apps, st('1.0.1'), prefs).ready, []);
  assert.equal(plan(apps, st('1.0.1'), prefs).blocked.wm, 'paused');
  assert.deepEqual(plan(apps, st('1.0.2'), prefs).ready, ['wm']);
});

test('원격 주소가 있는 로컬 항목은 이 PC 에 없어도 쓸 수 있음', () => {
  const ai = { id: 'ai', name: 'AI', install: { format: 'local' }, local: { remote: 'https://ai.example.com/' } };
  assert.equal(remoteOf(ai), 'https://ai.example.com/');
  assert.equal(remoteOf({ local: { remote: 'http://x/' } }), '');
  assert.equal(remoteOf({}), '');
  assert.deepEqual(trayApps([ai], new Map([['ai', { installed: false }]])), [{ id: 'ai', name: 'AI' }]);
  assert.equal(castState(ai, { installed: false }), 'idle');
});

test('트레이 실행 목록은 설치된 앱과 웹 앱만', () => {
  const apps = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', kind: 'web' }, { id: 'd', name: 'D', soon: true, kind: 'web' }];
  const status = new Map([['a', { installed: true }], ['b', { installed: false }]]);
  assert.deepEqual(trayApps(apps, status), [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }]);
});

test('newer 는 숫자로 비교', () => {
  assert.equal(newer('0.1.116', '0.1.112'), true);
  assert.equal(newer('0.1.9', '0.1.10'), false);
  assert.equal(newer('1.0', '1.0.0'), false);
  assert.equal(hasUpdate({ installed: false, latest: '2' }), false);
});

test('새 판이 있고 꺼져 있으면 받음', () => {
  assert.deepEqual(plan([app('a')], [['a', old()]]).ready, ['a']);
});

test('받을 주소가 없거나 최신이면 후보도 미룸도 아님', () => {
  const p = plan([app('a'), app('b')], [['a', old({ download: null })], ['b', old({ latest: '1.0.0' })]]);
  assert.deepEqual(p, { ready: [], blocked: {} });
});

test('설치 안 된 앱은 자동으로 깔지 않음', () => {
  assert.deepEqual(plan([app('a')], [['a', old({ installed: false })]]).ready, []);
});

test('웹, 로컬, 준비 중은 대상 아님', () => {
  const apps = [app('w', { kind: 'web' }), app('l', { install: { format: 'local' } }), app('s', { soon: true })];
  assert.deepEqual(plan(apps, apps.map((a) => [a.id, old()])), { ready: [], blocked: {} });
});

test('실행 중이면 끌 때까지 미룸', () => {
  assert.deepEqual(plan([app('a')], [['a', old({ running: true })]]).blocked, { a: 'running' });
});

test('게임이 떠 있으면 다른 앱도 미룸, 설정으로 허용', () => {
  const apps = [app('g', { kind: 'unity' }), app('a')];
  const entries = [['g', { installed: true, version: '1', latest: '1', running: true }], ['a', old()]];
  assert.deepEqual(plan(apps, entries).blocked, { a: 'game' });
  assert.deepEqual(plan(apps, entries, { duringGame: true }).ready, ['a']);
});

test('앱별 방식과 전체 끄기', () => {
  const apps = [app('a'), app('b')];
  const entries = [['a', old()], ['b', old()]];
  const p = plan(apps, entries, { apps: { a: { update: 'off' }, b: { update: 'launch' } } });
  assert.deepEqual(p, { ready: [], blocked: { a: 'off', b: 'launch' } });
  assert.deepEqual(plan(apps, entries, { autoUpdate: false }).blocked, { a: 'global-off', b: 'global-off' });
});

test('먼저 받기가 앞으로', () => {
  const p = plan([app('a'), app('b')], [['a', old()], ['b', old()]], { apps: { b: { update: 'priority' } } });
  assert.deepEqual(p.ready, ['b', 'a']);
});

test('시간대 밖이면 미룸, 자정 넘는 구간도 됨', () => {
  const night = { window: { start: '23:00', end: '07:00' } };
  assert.equal(inWindow(night.window, new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(inWindow(night.window, new Date(2026, 0, 1, 6, 59)), true);
  assert.equal(inWindow(night.window, new Date(2026, 0, 1, 7, 0)), false);
  assert.equal(inWindow({ start: 'x', end: '1' }, NOON), true);
  assert.deepEqual(plan([app('a')], [['a', old()]], night).blocked, { a: 'window' });
});

test('실패하면 물러나고, 판이 바뀌면 바로 다시', () => {
  const at = NOON.getTime();
  const failures = { a: { at, count: 2, version: '1.0.1' } };
  assert.equal(retryAt(failures.a, '1.0.1'), at + 60 * 60 * 1000);
  assert.equal(retryAt({ at, count: 30, version: 'v' }, 'v'), at + 6 * 60 * 60 * 1000);
  assert.deepEqual(plan([app('a')], [['a', old()]], {}, NOON, failures).blocked, { a: 'retry' });
  assert.deepEqual(plan([app('a')], [['a', old()]], {}, new Date(at + 60 * 60 * 1000), failures).ready, ['a']);
  assert.deepEqual(plan([app('a')], [['a', old({ latest: '1.0.2' })]], {}, NOON, failures).ready, ['a']);
});

test('목록 검색, 거르기, 정렬, 즐겨찾기', () => {
  const apps = [app('b', { name: '나무', summary: '게임' }), app('a', { name: '가지' }), app('c', { name: '다리' })];
  const st = new Map([['a', old()], ['b', { installed: true, version: '1', latest: '1' }]]);
  const ids = (prefs, view) => visibleApps(apps, st, prefs, view).map((x) => x.id);
  assert.deepEqual(ids({}, {}), ['b', 'a', 'c']);
  assert.deepEqual(ids({}, { sort: 'name' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({}, { q: '게임' }), ['b']);
  assert.deepEqual(ids({}, { filter: 'installed' }), ['b', 'a']);
  assert.deepEqual(ids({}, { filter: 'updates' }), ['a']);
  assert.deepEqual(ids({ apps: { c: { favorite: true } } }, { sort: 'name' }), ['c', 'a', 'b']);
  assert.deepEqual(ids({ apps: { a: { last: 5 }, c: { last: 9 } } }, { sort: 'recent' }), ['c', 'a', 'b']);
});

test('실행 시간 한 칸. 첫 확인은 0, 긴 공백은 상한', () => {
  assert.equal(tickSeconds(1793819834749, 0), 0);
  assert.equal(tickSeconds(10000, 9000), 1);
  assert.equal(tickSeconds(1000000, 1000), 120);
});

test('마스코트 자리', () => {
  assert.deepEqual(mascotSource({ art: { mascot: 'dash' } }), { url: 'img/mascot-dash.webp' });
  assert.deepEqual(mascotSource({ art: { mascot_private: 'data/launcher/mascots/x.webp' } }), { private: 'data/launcher/mascots/x.webp' });
  for (const app of [null, {}, { art: {} }, { art: { mascot: '../evil' } }]) assert.equal(mascotSource(app), null);
});

test('캐릭터 상태', () => {
  const app = { id: 'a', kind: 'tauri' };
  const inst = { installed: true, version: '1', latest: '1' };
  assert.equal(castState(app, inst), 'idle');
  assert.equal(castState(app, { ...inst, running: true }), 'running');
  assert.equal(castState(app, { ...inst, running: true, latest: '2' }), 'waiting');
  assert.equal(castState(app, { ...inst, latest: '2' }), 'update');
  assert.equal(castState(app, { installed: false }), 'missing');
  assert.equal(castState(app, { ...inst, error: 'x' }), 'error');
  assert.equal(castState(app, inst, { phase: 'download' }), 'busy');
  assert.equal(castState(app, { ...inst, error: 'x' }, null, 'done'), 'done');
  assert.equal(castState({ kind: 'web' }, undefined), 'idle');
});

test('표정 그림은 있는 것만, 없으면 평소', () => {
  const art = { mascot: 'x', poses: ['running', 'busy'] };
  assert.deepEqual(mascotSource({ art }, 'running'), { url: 'img/mascot-x-running.webp' });
  assert.deepEqual(mascotSource({ art }, 'done'), { url: 'img/mascot-x-running.webp' });
  assert.deepEqual(mascotSource({ art }, 'error'), { url: 'img/mascot-x.webp' });
  assert.deepEqual(mascotSource({ art }, 'update'), { url: 'img/mascot-x.webp' });
  const priv = { mascot_private: 'data/launcher/mascots/y.webp', poses: ['busy'] };
  assert.deepEqual(mascotSource({ art: priv }, 'busy'), { private: 'data/launcher/mascots/y-busy.webp' });
  assert.deepEqual(logoSource({ art: { logo_private: 'data/launcher/mascots/y-logo.webp' } }), { private: 'data/launcher/mascots/y-logo.webp' });
  assert.deepEqual(logoSource({ art: { logo: 'x' } }), { url: 'img/logo-x.webp' });
  assert.equal(logoSource({ art: { mascot: 'x' } }), null, '마스코트가 있어도 로고가 없으면 없음');
  assert.equal(logoSource({ art: { logo: '../x' } }), null);
  assert.equal(accentOf({ art: { accent: '#2563c9' } }), '#2563c9');
  assert.equal(accentOf({ art: { accent: 'red;x:y' } }), '');
  assert.equal(accentOf({}), '');
});

test('대사 고르기', () => {
  const app = { art: { cast: { lines: { idle: ['가', '나'], waiting: '끄면 {latest} 받을게' } } } };
  assert.equal(castLine(app, 'idle', 0), '가');
  assert.equal(castLine(app, 'idle', 3), '나');
  assert.equal(castLine(app, 'busy', 0), '가');
  assert.equal(castLine(app, 'waiting', 0, { latest: '1.2' }), '끄면 1.2 받을게');
  assert.equal(castLine({}, 'idle', 0), '');
});

test('실행 옵션 나누기', () => {
  assert.deepEqual(parseArgs('-a "b c"  d'), ['-a', 'b c', 'd']);
  assert.deepEqual(parseArgs(''), []);
});

test('시간 글', () => {
  assert.equal(fmtDuration(30), '');
  assert.equal(fmtDuration(3600 * 3 + 60 * 20), '3시간 20분');
  assert.equal(fmtDuration(7200), '2시간');
  const now = NOON.getTime();
  assert.equal(fmtAgo(0, now), '');
  assert.equal(fmtAgo(now - 1000, now), '오늘');
  assert.equal(fmtAgo(now - 86400000, now), '어제');
  assert.equal(fmtAgo(now - 3 * 86400000, now), '3일 전');
  assert.equal(fmtAgo(new Date(2026, 0, 2).getTime(), now), '2026.01.02');
});
