import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rhythmDue, eveningLine, loadRhythm, saveRhythm, dashDiaryWriter, Settings } from '../dist/index.js';

const options = { eveningOn: true, diaryOn: true, eveningHour: 17, diaryHour: 22 };
const at = (kst) => new Date(`2026-11-23T${kst}:00+09:00`);
const today = (over = {}) => ({ items: [], badge: 0, events: [], tasks: [], anime: [], aiDue: 0, warnings: [], fetchedAt: '', ...over });

test('저녁 시각부터 브리핑, 자기 전 시각부터 한 줄, 그 전은 없음', () => {
  assert.equal(rhythmDue({}, at('16:59'), options), null);
  assert.equal(rhythmDue({}, at('17:00'), options), 'evening');
  assert.equal(rhythmDue({}, at('21:59'), options), 'evening');
  assert.equal(rhythmDue({}, at('22:00'), options), 'diary');
  assert.equal(rhythmDue({}, at('23:59'), options), 'diary');
});

test('하루에 종류별 한 번, 다음 날 다시', () => {
  assert.equal(rhythmDue({ evening: '2026-11-23' }, at('18:00'), options), null);
  assert.equal(rhythmDue({ evening: '2026-11-23', diary: '2026-11-23' }, at('22:30'), options), null);
  assert.equal(rhythmDue({ evening: '2026-11-22', diary: '2026-11-22' }, at('18:00'), options), 'evening');
  // 자정이 지나면 한국 날짜가 바뀜. 새벽에는 둘 다 없음
  assert.equal(rhythmDue({}, new Date('2026-11-24T00:30:00+09:00'), options), null);
});

test('끈 종류는 건네지 않음, 저녁 시각이 자기 전보다 늦으면 브리핑 없음', () => {
  assert.equal(rhythmDue({}, at('18:00'), { ...options, eveningOn: false }), null);
  assert.equal(rhythmDue({}, at('22:30'), { ...options, diaryOn: false }), null);
  assert.equal(rhythmDue({}, at('23:00'), { ...options, eveningHour: 23, diaryOn: false }), null);
});

test('브리핑 문장은 받은 값만, 비어 있으면 비었다고', () => {
  assert.equal(eveningLine(today()), '오늘과 내일 일정 없음\n할 일 없음');
  assert.equal(
    eveningLine(today({ events: [{ title: '약속', when: '19:30' }, { title: '운동', when: '21:00' }], tasks: [{ title: '빨래' }, { title: '장보기' }], anime: ['가', '나', '다'] })),
    '남은 일정 2개. 19:30 약속\n할 일 2개. 빨래 외 1개\n새 화 가, 나 외 1개',
  );
  assert.equal(eveningLine(today({ events: [{ title: '출근', when: '내일 07:30' }], tasks: [{ title: '빨래' }] })), '오늘 남은 일정 없음. 다음은 내일 07:30 출근\n할 일 하나. 빨래');
});

test('건넨 날짜는 파일에 남아 재시작에도 유지, 깨진 파일은 빈 상태', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rhythm-'));
  try {
    const file = join(dir, 'a', '하루-리듬.json');
    assert.deepEqual(loadRhythm(file), {});
    saveRhythm(file, { evening: '2026-11-23' });
    assert.deepEqual(loadRhythm(file), { evening: '2026-11-23', diary: undefined });
    writeFileSync(file, '{깨짐');
    assert.deepEqual(loadRhythm(file), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('한 줄은 그날 일기에 덧붙이기로, 겹치면 같은 요청 번호로 한 번 재시도', async () => {
  const calls = [];
  let conflict = true;
  const invoke = async (name, args) => {
    calls.push({ name, args });
    if (name === 'dash_read') return { revision: 'a'.repeat(40) };
    if (conflict) { conflict = false; throw Object.assign(new Error('revision_conflict'), { code: 'revision_conflict' }); }
    return { applied: true };
  };
  const write = dashDiaryWriter(null, { invoke, now: () => new Date('2026-11-23T22:10:00+09:00') });
  assert.deepEqual(await write('  오늘은 푹 쉼  '), { ok: true, date: '2026-11-23' });
  const changes = calls.filter((c) => c.name === 'dash_planner_change');
  assert.equal(changes.length, 2);
  assert.equal(changes[0].args.requestId, changes[1].args.requestId);
  assert.deepEqual({ ...changes[1].args, requestId: '', revision: '' }, { collection: 'diary', key: '2026-11-23', action: 'append', patch: { text: '오늘은 푹 쉼' }, revision: '', requestId: '', apply: true });
});

test('창이 준 요청 번호와 카드 날짜를 씀. 자정을 넘겨도 어제 카드는 어제 일기, 더 오래된 날짜와 틀린 번호는 무시', async () => {
  const seen = [];
  const invoke = async (name, args) => { if (name === 'dash_planner_change') seen.push(args); return name === 'dash_read' ? { revision: 'a'.repeat(40) } : { applied: true }; };
  const write = dashDiaryWriter(null, { invoke, now: () => new Date('2026-11-24T00:10:00+09:00') });
  const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.deepEqual(await write('늦은 한 줄', { requestId: id, date: '2026-11-23' }), { ok: true, date: '2026-11-23' });
  assert.equal(seen[0].requestId, id);
  assert.equal(seen[0].key, '2026-11-23');
  assert.deepEqual(await write('옛 날짜', { requestId: 'not-a-uuid', date: '2026-11-01' }), { ok: true, date: '2026-11-24' });
  assert.notEqual(seen[1].requestId, 'not-a-uuid');
});

test('빈 글과 너무 긴 글, 저장 실패는 이유와 함께 거절', async () => {
  const fails = async () => { throw Object.assign(new Error('github_login_required'), { code: 'github_login_required' }); };
  assert.deepEqual(await dashDiaryWriter(null, { invoke: fails })('   '), { ok: false, why: '빈 글' });
  assert.deepEqual(await dashDiaryWriter(null, { invoke: fails })('가'.repeat(2001)), { ok: false, why: '2000자까지' });
  assert.deepEqual(await dashDiaryWriter(null, { invoke: fails })('글'), { ok: false, why: 'github_login_required' });
  assert.deepEqual(await dashDiaryWriter(null)('글'), { ok: false, why: 'memo 저장소를 이웃에서 못 찾음' });
});

test('설정에 네 항목이 있고 기본은 켜짐, 저녁 17시와 자기 전 22시', () => {
  const settings = new Settings();
  assert.equal(settings.on('eveningBrief'), true);
  assert.equal(settings.on('diaryAsk'), true);
  assert.equal(settings.get('eveningBriefHour'), 17);
  assert.equal(settings.get('diaryAskHour'), 22);
});
