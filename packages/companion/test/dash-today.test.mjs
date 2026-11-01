import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeToday, dashTodaySource } from '../dist/index.js';

// 2026-11-01 20:00 KST
const now = new Date('2026-11-01T11:00:00Z');

test('지난 일정은 빼고 오늘 남은 일정만 시각 순으로', () => {
  const t = summarizeToday({
    events: [
      { title: '저녁', start: '2026-11-01T12:30:00Z', end: '2026-11-01T13:00:00Z' },
      { title: '점심', start: '2026-11-01T03:00:00Z', end: '2026-11-01T04:00:00Z' },
      { title: '회의', start: '2026-11-01T11:30:00Z', end: '2026-11-01T12:00:00Z' },
      { title: '출근', start: '2026-11-01T22:30:00Z', end: '2026-11-01T23:00:00Z' },
    ],
  }, 0, now);
  assert.deepEqual(t.events, [{ title: '회의', when: '20:30' }, { title: '저녁', when: '21:30' }]);
});

test('오늘 남은 일정이 없으면 내일 첫 일정 하나', () => {
  const t = summarizeToday({
    events: [
      { title: '퇴근', start: '2026-11-02T08:00:00Z', end: '2026-11-02T08:30:00Z' },
      { title: '출근', start: '2026-11-01T22:30:00Z', end: '2026-11-01T23:00:00Z' },
    ],
  }, 0, now);
  assert.deepEqual(t.events, [{ title: '출근', when: '내일 07:30' }]);
});

test('숫자는 제목 있는 남은 할 일 수', () => {
  const t = summarizeToday({
    tasks: [
      { title: '빨래', status: 'needsAction' },
      { title: '', status: 'needsAction' },
      { title: '청소', status: 'completed' },
    ],
  }, 3, now);
  assert.equal(t.badge, 1);
  assert.deepEqual(t.tasks, [{ title: '빨래' }]);
  assert.equal(t.aiDue, 3);
});

test('원본 경고는 숨기지 않는다', () => {
  const t = summarizeToday({ errors: ['로컬 저장본 24시간 이상 경과'] }, 0, now, ['후속 일정 못 읽음: x']);
  assert.deepEqual(t.warnings, ['후속 일정 못 읽음: x', '로컬 저장본 24시간 이상 경과']);
});

test('memo 가 없으면 null', async () => {
  assert.equal(await dashTodaySource(null)(), null);
});

test('알림 줄은 종류별, 새 화는 라프텔 주소, AI 는 기한 수 한 줄', () => {
  const t = summarizeToday({
    events: [{ title: '회의', start: '2026-11-01T11:30:00Z', end: '2026-11-01T12:00:00Z' }],
    tasks: [{ id: 'a1', title: '빨래', status: 'needsAction' }],
    anime: [{ id: 47465, title: '만화동산', publishedAt: '2026-11-01T10:00:00Z' }],
  }, 2, now);
  assert.deepEqual(t.items.map((i) => i.kind), ['일정', '할 일', '새 소식', 'AI']);
  assert.equal(t.items[0].startAt, '2026-11-01T11:30:00.000Z');
  assert.equal(t.items[2].url, 'https://laftel.net/item/47465');
  assert.equal(t.items[3].title, 'AI 후속 일정 2개');
});

test('달의 위상과 반복 일정 회차는 알림에서 뺌', () => {
  const t = summarizeToday({
    events: [
      { id: 'moon__1', title: '하현달', start: '2026-11-01', allDay: true, source: '달의 위상' },
      { id: 'local__abc::2026-11-1::link:0', title: '출근', start: '2026-11-01T12:30:00Z', end: '2026-11-01T13:00:00Z' },
      { id: 'local__abc::2026-11-1', title: '회사', start: '2026-11-01T13:00:00Z', end: '2026-11-01T14:00:00Z' },
      { id: 'local__xyz', title: '병원', start: '2026-11-01T12:00:00Z', end: '2026-11-01T12:30:00Z' },
    ],
  }, 0, now);
  assert.deepEqual(t.events.map((e) => e.title), ['병원']);
});

test('일정 읽기가 실패하면 마지막 값과 그 시각 경고', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'dash-today-'));
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'lib', 'dash-agent.mjs'), `let n = 0;
export async function invokeDash(name, args) {
  if (args.resource === 'followups') return { items: [] };
  n += 1;
  if (n > 1) throw new Error('offline');
  return { data: { tasks: [{ id: 'a', title: '빨래', status: 'needsAction' }] } };
}`);
  let t = now.getTime();
  const read = dashTodaySource(dir, { ttlMs: 0, now: () => new Date(t) });
  assert.equal((await read()).badge, 1);
  t += 60_000;
  const second = await read();
  assert.equal(second.badge, 1);
  assert.ok(second.warnings.some((w) => w.includes('20:00 에 받은 일정')), second.warnings.join('|'));
});
