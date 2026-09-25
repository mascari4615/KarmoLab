/**
 * 플래너. 구글이 주는 모양 ↔ 달력이 쓰는 모양 (TASK-KL-321).
 *
 * 여기서 크게 지키는 것은 **종일 일정의 끝나는 날**이다. 구글도 FullCalendar 도 끝을
 * 다음 날로 쓰는데, 옛 React 판은 달력 라이브러리가 달라서 받을 때 하루 빼고 보낼 때
 * 하루 더하고 있었다. 옮기면서 그 맞바꿈을 없앴으니 **한 칸도 안 밀리는지** 여기서 못 박는다.
 *
 * 사용: node scripts/test-planner-core.mjs   (npm run test:planner)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: ${got} (기대 ${want})`);

async function load(rel, tag) {
  const stamp = `${tag}-${Date.now()}`;
  const entry = path.join(os.tmpdir(), `${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, rel))};\n`);
  const out = path.join(os.tmpdir(), `${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

/* 이 브라우저 저장소는 localStorage 를 쓴다. 노드에는 없으니 가장 작은 것으로 대신 둔다.
   여기서 보는 것은 어디에 쓰이나, 어느 칸인가지 브라우저 구현이 아니다. */
globalThis.localStorage = (() => {
  const box = new Map();
  return {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
    clear: () => box.clear(),
  };
})();

const P = await load('src/widgets/planner/gcal.ts', 'planner-gcal');
const L = await load('src/widgets/planner/local-store.ts', 'planner-local');
const CAL = { id: 'me@example.com', summary: '내 캘린더', backgroundColor: '#123456' };

/* ── 종일 일정: 구글이 준 날짜를 그대로 쓴다 ── */
{
  const ev = P.toFcEvent(
    { id: 'e1', summary: '휴가', start: { date: '2026-08-16' }, end: { date: '2026-08-17' } },
    CAL
  );
  eq(ev.allDay, true, '종일로 읽는다');
  eq(ev.start, '2026-08-16', '시작 그대로');
  eq(ev.end, '2026-08-17', '끝도 그대로. 하루 빼지 않는다');
  eq(ev.title, '휴가', '제목');
  eq(ev.backgroundColor, '#123456', '캘린더 색');
  eq(ev.extendedProps.googleId, 'e1', '구글 쪽 id 를 따로 들고 있다');
  eq(ev.id, 'me@example.com__e1', '캘린더가 다르면 id 도 다르다');
}

/* ── 끝을 안 주면 다음 날로 채운다 (달을 넘어가도) ── */
{
  const ev = P.toFcEvent({ id: 'e2', start: { date: '2026-08-31' }, end: {} }, CAL);
  eq(ev.end, '2026-09-01', '8/31 의 다음 날은 9/1');
  const ev2 = P.toFcEvent({ id: 'e3', start: { date: '2026-12-31' }, end: {} }, CAL);
  eq(ev2.end, '2027-01-01', '해도 넘어간다');
  const ev3 = P.toFcEvent({ id: 'e4', start: { date: '2028-02-28' }, end: {} }, CAL);
  eq(ev3.end, '2028-02-29', '윤년 2월도 맞다');
}

/* ── 시각 있는 일정 ── */
{
  const ev = P.toFcEvent(
    {
      id: 'e5',
      summary: '회의',
      start: { dateTime: '2026-08-16T10:00:00+09:00' },
      end: { dateTime: '2026-08-16T11:00:00+09:00' }
    },
    CAL
  );
  eq(ev.allDay, false, '종일 아님');
  eq(ev.start, '2026-08-16T10:00:00+09:00', '시각 문자열 그대로 넘긴다');
}

/* ── 제목 없는 일정도 안 죽는다 ── */
{
  const ev = P.toFcEvent({ id: 'e6', start: { date: '2026-08-16' }, end: { date: '2026-08-17' } }, CAL);
  eq(ev.title, '', '제목 없으면 빈 문자열 (화면이 기본값을 붙인다)');
}

/* ── 색 ── */
{
  eq(P.eventColor({ id: 'x', colorId: '7', start: {}, end: {} }, '#000'), '#42d692', '일정 색이 이긴다');
  eq(P.eventColor({ id: 'x', start: {}, end: {} }, '#000'), '#000', '색 없으면 캘린더 색');
  eq(P.eventColor({ id: 'x', colorId: '999', start: {}, end: {} }, '#000'), '#000', '모르는 번호는 캘린더 색');
  eq(P.calendarColor('abc', '#fff'), '#fff', '캘린더가 준 색 우선');
  eq(P.calendarColor('abc'), P.calendarColor('abc'), '같은 id 는 늘 같은 색');
  /* 색은 8개뿐이라 두 id 가 같은 색일 수 있다. 다르다가 아니라 **골고루 퍼지나**를 본다 */
  const spread = new Set(Array.from({ length: 40 }, (_, i) => P.calendarColor(`cal-${i}@x.com`)));
  check(spread.size >= 5, `40개 캘린더가 색 ${spread.size}종. 한두 색으로 몰리면 구분이 안 된다`);
}

/* ── 보낼 때: 종일 ── */
{
  const body = P.toGooglePayload({
    title: '휴가',
    start: new Date(2026, 7, 16),
    end: new Date(2026, 7, 17),
    allDay: true
  });
  eq(body.start.date, '2026-08-16', '시작 날짜');
  eq(body.end.date, '2026-08-17', '끝 날짜 그대로. 하루 더하지 않는다');
  eq(body.summary, '휴가', '제목');
  eq(body.start.dateTime, undefined, '종일에는 시각을 안 보낸다');
}

/* ── 보낼 때: 끝이 시작과 같으면 하루짜리로 ── */
{
  const body = P.toGooglePayload({
    title: '하루',
    start: new Date(2026, 7, 16),
    end: new Date(2026, 7, 16),
    allDay: true
  });
  eq(body.end.date, '2026-08-17', '같은 날이면 다음 날로 채워 보낸다 (구글은 end > start 를 요구)');
}

/* ── 받은 것을 도로 보내도 그대로인가 (왕복) ── */
{
  const ev = P.toFcEvent(
    { id: 'e7', summary: '연휴', start: { date: '2026-09-28' }, end: { date: '2026-10-02' } },
    CAL
  );
  const [sy, sm, sd] = ev.start.split('-').map(Number);
  const [ey, em, ed] = ev.end.split('-').map(Number);
  const body = P.toGooglePayload({
    title: ev.title,
    start: new Date(sy, sm - 1, sd),
    end: new Date(ey, em - 1, ed),
    allDay: true
  });
  eq(body.start.date, '2026-09-28', '왕복해도 시작 그대로');
  eq(body.end.date, '2026-10-02', '왕복해도 끝 그대로. 한 칸도 안 민다');
}

/* ── 로컬 날짜 문자열 ── */
{
  eq(P.ymd(new Date(2026, 0, 5)), '2026-01-05', '한 자리는 0 채움');
  eq(P.ymd(new Date(2026, 7, 16, 23, 30)), '2026-08-16', '늦은 밤도 그날 (UTC 로 안 민다)');
}

/* ── 칸반: 어느 칸인가 ── */
{
  eq(P.classifyTask({ id: 't1', title: 'a', status: 'needsAction' }), 'todo', '메모 없으면 할 일');
  eq(P.classifyTask({ id: 't2', title: 'a', status: 'completed' }), 'done', '끝난 것은 완료');
  eq(
    P.classifyTask({ id: 't3', title: 'a', status: 'needsAction', notes: '메모\n[IN_PROGRESS]' }),
    'inProgress',
    '표식이 있으면 진행 중'
  );
  eq(
    P.classifyTask({ id: 't4', title: 'a', status: 'completed', notes: '[IN_PROGRESS]' }),
    'done',
    '끝난 것이면 표식이 있어도 완료'
  );
}

/* ── 칸반: 표식은 화면에서 감춘다 ── */
{
  eq(P.visibleNotes('메모\n[IN_PROGRESS]'), '메모', '표식을 걷어 낸다');
  eq(P.visibleNotes('[IN_PROGRESS]'), '', '표식뿐이면 빈 메모');
  eq(P.visibleNotes(undefined), '', '메모가 없어도 안 죽는다');
  eq(P.visibleNotes('[IN_PROGRESS] 앞뒤 [IN_PROGRESS]'), '앞뒤', '표식이 여러 개여도 다 걷는다');
}

/* ── 칸반: 옮길 때 보낼 것 ── */
{
  const task = { id: 't', title: 'a', status: 'needsAction', notes: '메모' };
  eq(P.taskMovePayload(task, 'done').status, 'completed', '완료로');
  const ip = P.taskMovePayload(task, 'inProgress');
  eq(ip.status, 'needsAction', '진행 중은 아직 안 끝난 것');
  check(ip.notes.includes('[IN_PROGRESS]'), '진행 중 표식을 박는다');
  check(ip.notes.startsWith('메모'), '사람이 쓴 메모는 남긴다');

  const already = { id: 't', title: 'a', status: 'needsAction', notes: '메모\n[IN_PROGRESS]' };
  eq(
    P.taskMovePayload(already, 'inProgress').notes.split('[IN_PROGRESS]').length - 1,
    1,
    '이미 진행 중인 것을 또 옮겨도 표식은 하나만'
  );
  eq(P.taskMovePayload(already, 'todo').notes, '메모', '할 일로 되돌리면 표식만 빠진다');
}

/* ── 이 브라우저 저장소: 구글 없이도 쓴다 ── */
{
  localStorage.clear();
  const NAME = '내 캘린더 (이 브라우저)';
  eq(L.listEvents(NAME).length, 0, '처음엔 비어 있다');

  const id = L.createEvent({ title: '일기 쓰기', start: '2026-08-16', end: '2026-08-17', allDay: true });
  check(L.isLocal(id), '여기서 만든 id 는 local__ 로 시작한다. 이 앞머리가 어디에 쓸지 정한다');
  check(!L.isLocal('me@example.com__abc'), '구글 것은 local 이 아니다');

  const list = L.listEvents(NAME);
  eq(list.length, 1, '만든 것이 목록에 있다');
  eq(list[0].title, '일기 쓰기', '제목');
  eq(list[0].allDay, true, '종일');
  eq(list[0].end, '2026-08-17', '끝은 다음 날. 구글 것과 같은 규약');
  eq(list[0].extendedProps.calendarId, 'local', '이 브라우저 캘린더로 표시된다');
  check(!!list[0].backgroundColor, '색이 붙는다');

  L.updateEvent(id, { title: '일기 쓰기(고침)' });
  eq(L.listEvents(NAME)[0].title, '일기 쓰기(고침)', '고쳐진다');
  L.updateEvent('local__없는것', { title: 'x' });
  eq(L.listEvents(NAME).length, 1, '없는 것을 고쳐도 늘지 않는다');

  L.deleteEvent(id);
  eq(L.listEvents(NAME).length, 0, '지워진다');
}

/* ── 이 브라우저 할 일 ── */
{
  localStorage.clear();
  const id = L.createTask('장 보기');
  let cols = L.listTasks();
  eq(cols.todo.length, 1, '새 할 일은 해야 할 일 칸');
  eq(cols.todo[0].status, 'needsAction', '아직 안 끝난 것');

  L.moveTask(id, 'done');
  cols = L.listTasks();
  eq(cols.todo.length, 0, '옮기면 원래 칸에서 빠진다');
  eq(cols.done.length, 1, '완료 칸으로');
  eq(cols.done[0].status, 'completed', '완료로 보인다. 구글 것과 같은 모양');

  L.deleteTask(id);
  eq(L.listTasks().done.length, 0, '지워진다');
}

/* ── 깨진 저장값을 만나도 ── */
{
  localStorage.setItem('karmolab_planner_events', '{못 읽는 것}');
  eq(L.listEvents('x').length, 0, '깨진 값이면 빈 목록 (화면이 안 죽는다)');
  localStorage.clear();
}

/* ── AI 후속 일정 (memo followups.json 이 원본) ── */
{
  const F = await load('src/widgets/planner/followups.ts', 'planner-followups');
  const items = [
    { id: 'a', date: '2026-09-28', title: '색인 재측정', project: 'seo', doc: 'projects/karmolab/systems/seo-ops.md' },
    { id: 'b', date: '2026-09-26', title: '끝난 것', status: 'done' },
    { id: 'c', date: '9월 말', title: '날짜가 깨진 것' },
    { id: '', date: '2026-09-27', title: 'id 없는 것' },
  ];
  const evs = F.toAiEvents(items);
  eq(evs.length, 1, '열린 것만, 날짜와 id 가 멀쩡한 것만');
  eq(evs[0].start, '2026-09-28', '하루 일정 시작');
  eq(evs[0].end, '2026-09-29', '끝은 다음 날 (종일 규칙)');
  eq(evs[0].allDay, true, '종일');
  eq(evs[0].editable, false, '달력에서 끌어 못 옮김 (원본은 memo)');
  eq(evs[0].extendedProps.calendarId, F.AI_CALENDAR_ID, 'AI 캘린더 소속');
  eq(evs[0].title, '[seo] 색인 재측정', '프로젝트 머리');
  eq(evs[0].extendedProps.doc, 'projects/karmolab/systems/seo-ops.md', '근거 문서');

  /* 구글 복사본 맞추기: 없는 것 만들기, 바뀐 것 고치기, 원본에서 빠진 것 지우기 */
  const calls = [];
  const remote = [
    { id: 'g1', summary: '[seo] 옛 제목', start: { date: '2026-09-28' }, description: 'memo: projects/karmolab/systems/seo-ops.md', extendedProperties: { private: { karmoFollowup: 'a' } } },
    { id: 'g2', summary: '지난 것', start: { date: '2026-09-20' }, extendedProperties: { private: { karmoFollowup: 'old' } } },
    { id: 'g3', summary: '사람이 넣은 것', start: { date: '2026-09-21' } },
  ];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${String(url).split('/events')[1] || ''}`);
    if (!init.method) return { ok: true, json: async () => ({ items: remote }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const more = [...items, { id: 'd', date: '2026-10-01', title: '새 것' }];
  const r = await F.syncToGoogle('tok', 'ai-cal', more);
  eq(r.made, 1, '없는 d 를 만든다');
  eq(r.fixed, 1, '제목이 바뀐 a 를 고친다');
  eq(r.gone, 1, '원본에 없는 old 를 지운다');
  check(!calls.some((c) => c.includes('g3')), '표식 없는 사람 일정은 안 건드린다');
}

/* ── 구글 일정 캐시: 저장본으로 먼저, 바뀐 것만 받아 합치기 (event-cache.ts, 2026-09-25) ── */
{
  const C = await load('src/widgets/planner/event-cache.ts', 'planner-cache');
  const day = (d) => Date.parse(d + 'T00:00:00Z');
  const ev = (id, d, extra = {}) => ({ id, summary: id, start: { date: d }, end: { date: d }, ...extra });
  const sep = [day('2026-09-01'), day('2026-10-01')];

  /* 처음 받기 */
  let e = C.mergeFull(null, [ev('a', '2026-09-05'), ev('b', '2026-09-20')], ...sep, '2026-09-25T00:00:00Z');
  eq(Object.keys(e.items).length, 2, '처음 받은 두 일정');
  check(C.covers(e, day('2026-09-10'), day('2026-09-15')), '받은 구간 안이면 다시 다 안 받아도 된다');
  check(!C.covers(e, day('2026-09-10'), day('2026-10-15')), '구간 밖으로 나가면 새로 받아야 한다');

  /* 바뀐 것만: b 는 지워지고 a 는 제목이 바뀌고 c 는 새로 */
  const d = C.mergeDelta(e, [ev('b', '2026-09-20', { status: 'cancelled' }), ev('a', '2026-09-05', { summary: '새 제목' }), ev('c', '2026-09-22')], '2026-09-26T00:00:00Z');
  eq(d.changed, 3, '지움 1, 고침 1, 새 것 1');
  eq(d.entry.items.b, undefined, '지워진 일정은 빠진다');
  eq(d.entry.items.a.summary, '새 제목', '고친 일정은 덮어쓴다');
  eq(d.entry.syncedAt, '2026-09-26T00:00:00Z', '다음엔 이때부터 바뀐 것만');
  eq(C.mergeDelta(d.entry, [ev('c', '2026-09-22')], 'x').changed, 0, '같은 일정이 또 오면 바뀐 것 0 (다시 안 그림)');

  /* 옆 달을 새로 받으면 구간이 이어지고, 그 달 밖 일정은 남는다 */
  const n = C.mergeFull(d.entry, [ev('o', '2026-10-10')], day('2026-10-01'), day('2026-11-01'), '2026-09-27T00:00:00Z');
  eq(n.from, sep[0], '구간 앞은 그대로');
  eq(n.to, day('2026-11-01'), '구간 뒤가 늘어난다');
  check(!!n.items.a && !!n.items.o, '9월 것과 10월 것 둘 다');
  eq(n.syncedAt, '2026-09-26T00:00:00Z', '이어 붙이면 더 옛 받은 때를 쓴다 (9월 쪽 변화를 놓치지 않게)');

  /* 새로 받은 구간 안에서 사라진 일정은 빠진다 */
  const r = C.mergeFull(n, [], day('2026-10-01'), day('2026-11-01'), '2026-09-28T00:00:00Z');
  eq(r.items.o, undefined, '10월을 다시 받았더니 없으면 뺀다');
  check(!!r.items.a, '9월 것은 그대로');

  /* 떨어진 구간이면 사이를 모르니 옛 것을 버린다 */
  const far = C.mergeFull(r, [ev('z', '2027-03-03')], day('2027-03-01'), day('2027-04-01'), 's');
  eq(Object.keys(far.items).join(), 'z', '떨어진 구간은 새로 시작');

  /* 저장과 읽기 */
  C.saveCached('cal1', r);
  eq(C.loadCached('cal1').items.a.summary, '새 제목', '저장본을 다시 읽는다');
  eq(C.eventsIn(r, day('2026-09-21'), day('2026-09-23')).map((x) => x.id).join(), 'c', '구간 안 일정만');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n[test-planner-core] ${failures.length}건 실패:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[test-planner-core] 다 통과');
