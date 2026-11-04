import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPlan, fmtAgo, fmtDuration, hasUpdate, inWindow, newer, parseArgs, retryAt, tickSeconds, visibleApps } from '../ui/updates.js';

const NOON = new Date(2026, 10, 5, 12, 0);
const app = (id, extra = {}) => ({ id, name: id, kind: 'tauri', install: { format: 'nsis' }, ...extra });
const old = (extra = {}) => ({ installed: true, version: '1.0.0', latest: '1.0.1', download: 'https://x', ...extra });
const plan = (apps, entries, prefs = {}, date = NOON, failures) => autoPlan(apps, new Map(entries), prefs, date, failures);

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
