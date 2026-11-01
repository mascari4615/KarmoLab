import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gap, isBusy, gapLine } from '../dist/index.js';

const video = { title: '방송 - CHZZK - 개인 - Microsoft Edge', exe: 'msedge', full: false };
const code = { title: 'karmoddrine - Visual Studio Code', exe: 'Code', full: false };
const game = { title: 'MapleStory', exe: 'MapleStory', full: true };

function clock(start = Date.parse('2026-11-02T03:00:00Z')) {
  let t = start;
  return { now: () => t, go: (ms) => { t += ms; } };
}

test('영상, 게임, 전체 화면은 몰입', () => {
  assert.equal(isBusy(video), true);
  assert.equal(isBusy(game), true);
  assert.equal(isBusy({ title: '이름 모를 게임', exe: 'x', full: true }), true);
  assert.equal(isBusy(code), false);
  assert.equal(isBusy(null), false);
});

test('켜고 다른 창이 20초 이어지면 켬 알림 한 번', () => {
  const c = clock();
  const gap = new Gap({ now: c.now });
  assert.equal(gap.feed(code), null);
  c.go(25_000);
  assert.equal(gap.feed(code), '켬');
  c.go(25_000);
  assert.equal(gap.feed(code), null);
});

test('3분 넘게 본 영상이 끝나면 끝남, 짧은 영상은 무시', () => {
  const c = clock();
  const gap = new Gap({ now: c.now, spacingMs: 0 });
  gap.feed(video);
  c.go(60_000);
  gap.feed(code);
  c.go(25_000);
  assert.equal(gap.feed(code), null, '1분짜리는 틈 아님');
  gap.feed(video);
  c.go(5 * 60_000);
  gap.feed(code);
  c.go(10_000);
  assert.equal(gap.feed(code), null, '아직 20초 안 됨');
  c.go(15_000);
  assert.equal(gap.feed(code), '끝남');
});

test('하루 상한과 간격', () => {
  const c = clock();
  const gap = new Gap({ now: c.now, perDay: 1 });
  gap.feed(code);
  c.go(25_000);
  assert.equal(gap.feed(code), '켬');
  gap.feed(game);
  c.go(10 * 60_000);
  gap.feed(code);
  c.go(25_000);
  assert.equal(gap.feed(code), null);
});

test('말한 항목은 다시 안 함, 새 것이 없으면 침묵', () => {
  const today = { badge: 2, events: [{ title: '출근', when: '내일 07:30' }], tasks: [{ title: '빨래' }, { title: '청소' }], anime: [], aiDue: 0, warnings: [], fetchedAt: '' };
  const said = new Set();
  const first = gapLine(today, '켬', said);
  assert.equal(first.text, '왔네. 할 일 2개 남았어. 빨래 외 1개. 다음 일정은 내일 07:30 출근.');
  first.keys.forEach((k) => said.add(k));
  assert.equal(gapLine(today, '끝남', said), null);
});
