import assert from 'node:assert/strict';
import test from 'node:test';

import { firstWordReactions, nudgeRestLeftMs, nudgeRestMs, NUDGE_REST_MS, nudgeSense, reasonToSpeak } from '../dist/index.js';

const minutes = 60_000;
const time = 60 * minutes;

const base = {
  sinceTalkedMs: 30 * minutes,
  wondering: null,
  windowTitle: null,
  lastWindowTitle: null,
  hour: 14,
};

test('방금까지 얘기하던 참이면 끼어들지 않는다', () => {
  assert.equal(reasonToSpeak({ ...base, sinceTalkedMs: 2 * minutes }), null);
});

test('할 말이 없으면 조용하다. 말 걸려고 말 걸지 않는다', () => {
  assert.equal(reasonToSpeak(base), null);
});

test('하던 일이 바뀌면 그게 말 걸 이유가 된다', () => {
  const r = reasonToSpeak({ ...base, sinceTalkedMs: 25 * minutes, windowTitle: '새 창', lastWindowTitle: '옛 창' });
  assert.ok(r !== null);
  assert.match(r.why, /새 창/);
});

test('같은 창을 계속 보고 있으면 말 걸지 않는다', () => {
  assert.equal(reasonToSpeak({ ...base, sinceTalkedMs: 25 * minutes, windowTitle: '같은 창', lastWindowTitle: '같은 창' }), null);
});

test('한참 조용하면 담아 둔 궁금증을 꺼낸다', () => {
  const r = reasonToSpeak({ ...base, sinceTalkedMs: 50 * minutes, wondering: '그 게임 얘기' });
  assert.match(r.why, /그 게임 얘기/);
});

test('궁금증이 있어도 방금 얘기했으면 안 꺼낸다', () => {
  assert.equal(reasonToSpeak({ ...base, sinceTalkedMs: 15 * minutes, wondering: '그 게임 얘기' }), null);
});

test('새벽까지 안 자면 그건 말 걸 만한 일이다', () => {
  const r = reasonToSpeak({ ...base, hour: 3, sinceTalkedMs: 40 * minutes });
  assert.match(r.why, /안 자고/);
});

test('아주 오래 못 봤으면 아는 척 한 번', () => {
  const r = reasonToSpeak({ ...base, sinceTalkedMs: 9 * time });
  assert.match(r.why, /오랜만/);
});

test('한 번에 한 가지 이유만 든다. 여러 개를 쏟으면 알림이 된다', () => {
  const r = reasonToSpeak({
    ...base, hour: 3, sinceTalkedMs: 9 * time, wondering: '뭐 하나', windowTitle: '새 창', lastWindowTitle: '옛 창',
  });
  assert.equal(typeof r.why, 'string');
  assert.equal(r.why.includes('오랜만') && r.why.includes('궁금'), false);
});

test('이유가 생기면 깨우고, 같은 이유로는 다시 안 깨운다', async () => {
  const woke = [];
  let reason = { why: '한마디', key: '같은이유' };
  const sense = nudgeSense({ everyMs: 15, reason: () => reason });
  sense.start((s) => woke.push(s.text));

  await new Promise((r) => setTimeout(r, 90));
  sense.stop();

  assert.deepEqual(woke, ['한마디'], '여러 번 살펴봐도 같은 이유면 한 번만');
});

test('이유가 없으면 아예 안 깨운다', async () => {
  const woke = [];
  const sense = nudgeSense({ everyMs: 15, reason: () => null });
  sense.start((s) => woke.push(s.text));
  await new Promise((r) => setTimeout(r, 80));
  sense.stop();
  assert.deepEqual(woke, []);
});

test('이유를 보다 터져도 조용히 넘어간다. 깨우는 일이 멈추지 않게', async () => {
  const problems = [];
  const sense = nudgeSense({
    everyMs: 15,
    reason: () => { throw new Error('터짐'); },
    log: (m) => problems.push(m),
  });
  sense.start(() => {});
  await new Promise((r) => setTimeout(r, 50));
  sense.stop();
  assert.ok(problems.length > 0, '조용히 삼키지 않고 남긴다');
});

const at0 = Date.parse('2026-11-03T10:00:00+09:00');
const nudged = (at) => ({ role: 'sensed', channel: 'nudge', text: '이유', at });
const said = (at, text = '조수님 뭐 해요') => ({ role: 'said', channel: 'web', text, at });
const heard = (at, text) => ({ role: 'sensed', channel: 'web', text, at });

test('먼저 건 말에 한 마디로 넘기면 식은 것, 웃으면 통한 것으로 잰다', () => {
  const r = firstWordReactions([
    nudged(at0), said(at0 + 1000), heard(at0 + 5000, 'ㅇㅇ'),
    nudged(at0 + time), said(at0 + time + 1000), heard(at0 + time + 4000, 'ㅋㅋㅋ 그거'),
  ]);
  assert.deepEqual(r.map((x) => x.landed), [false, true]);
});

test('사람이 먼저 꺼낸 대화의 반응은 먼저 걸기 반응으로 세지 않는다', () => {
  const r = firstWordReactions([heard(at0, '안녕'), said(at0 + 1000), heard(at0 + 3000, 'ㅇㅇ')]);
  assert.deepEqual(r, []);
});

test('답이 오기 전에 또 먼저 걸었으면 앞의 말은 잴 것이 없다', () => {
  const r = firstWordReactions([
    nudged(at0), said(at0 + 1000, '첫 말'),
    nudged(at0 + time), said(at0 + time + 1000, '둘째 말'), heard(at0 + time + 3000, 'ㅇㅇ'),
  ]);
  assert.deepEqual(r.map((x) => x.said), ['둘째 말']);
});

test('먼저 건 말이 연달아 식으면 쉬는 시간이 늘고 한 번 통하면 줄어든다', () => {
  const cold = { said: 'a', landed: false, why: '' };
  const warm = { said: 'a', landed: true, why: '' };
  assert.equal(nudgeRestMs([]), 0);
  assert.equal(nudgeRestMs([cold]), NUDGE_REST_MS[1]);
  assert.equal(nudgeRestMs([cold, cold, cold]), NUDGE_REST_MS[2]);
  assert.equal(nudgeRestMs([cold, cold, warm]), NUDGE_REST_MS[1]);
  assert.equal(nudgeRestMs([cold, warm]), 0);
});

test('쉬는 시간은 기억 속 마지막 먼저 걸기 시각부터 잰다', () => {
  const entries = [
    nudged(at0), said(at0 + 1000), heard(at0 + 5000, 'ㅇㅇ'),
    nudged(at0 + time), said(at0 + time + 1000), heard(at0 + time + 5000, '응'),
  ];
  const last = at0 + time;
  assert.equal(nudgeRestLeftMs(entries, last + 30 * minutes), NUDGE_REST_MS[2] - 30 * minutes);
  assert.equal(nudgeRestLeftMs(entries, last + NUDGE_REST_MS[2]), 0);
  assert.equal(nudgeRestLeftMs([], at0), 0);
});
