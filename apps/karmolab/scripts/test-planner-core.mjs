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
  eq(P.eventColor({ id: 'x', colorId: '7', start: {}, end: {} }, '#000'), '#46d6db', '일정 전용 팔레트가 캘린더 팔레트와 분리');
  const draft={title:'색 검사',start:new Date(2026,9,14,9),end:new Date(2026,9,14,18),allDay:false};
  eq(P.toGooglePayload({...draft,colorId:'11'}).colorId,'11','구글 색 ID 쓰기');
  eq(P.toGooglePayload({...draft,colorId:''}).colorId,null,'구글 기본색 복원');
  check(!('colorId' in P.toGooglePayload(draft)),'이동 저장은 기존 색 보존');
  const id=L.createEvent({title:'색 그룹',start:'2026-10-14T09:00:00+09:00',end:'2026-10-14T18:00:00+09:00',allDay:false,color:'#dc2127',repeat:{frequency:'daily',until:'2026-10-16'}});
  L.updateOccurrence(id,'2026-10-15',{color:'#46d6db'});
  const rows=L.listEvents('로컬',new Date(2026,9,14),new Date(2026,9,17)).filter(x=>x.extendedProps.localSeriesId===id);
  eq(rows.find(x=>x.extendedProps.occurrenceDate==='2026-10-15').backgroundColor,'#46d6db','이날 색 예외');
  eq(rows.find(x=>x.extendedProps.occurrenceDate==='2026-10-16').backgroundColor,'#dc2127','다른 회차 색 보존');
  L.updateEvent(id,{color:'#5484ed'});
  const changed=L.listEvents('로컬',new Date(2026,9,14),new Date(2026,9,17)).filter(x=>x.extendedProps.localSeriesId===id);
  eq(changed.find(x=>x.extendedProps.occurrenceDate==='2026-10-15').backgroundColor,'#46d6db','전체 색 변경 뒤 하루 예외 보존');
  eq(changed.find(x=>x.extendedProps.occurrenceDate==='2026-10-16').backgroundColor,'#5484ed','전체 색 변경');
  L.deleteEvent(id);
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

  /* 쪽이 나뉘어 와도 끝까지, 같은 표식이 겹친 복사본은 하나만 남긴다 */
  const pages = {
    '': { items: [{ id: 'p1', summary: '[seo] 색인 재측정', start: { date: '2026-09-28' }, description: 'memo: projects/karmolab/systems/seo-ops.md', extendedProperties: { private: { karmoFollowup: 'a' } } }], nextPageToken: 'n2' },
    n2: { items: [{ id: 'p2', summary: '[seo] 색인 재측정', start: { date: '2026-09-28' }, extendedProperties: { private: { karmoFollowup: 'a' } } }, { id: 'p3', summary: '새 것', start: { date: '2026-10-01' }, extendedProperties: { private: { karmoFollowup: 'd' } } }] },
  };
  const calls2 = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls2.push(`${init.method || 'GET'} ${u.pathname.split('/events')[1] || ''}`);
    if (!init.method) return { ok: true, json: async () => pages[u.searchParams.get('pageToken') || ''] };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const r2 = await F.syncToGoogle('tok', 'ai-cal', [items[0], { id: 'd', date: '2026-10-01', title: '새 것' }]);
  eq(calls2.filter((c) => c.startsWith('GET')).length, 2, '다음 쪽까지 받는다');
  eq(r2.made, 0, '둘째 쪽에 있던 d 는 다시 안 만든다');
  eq(r2.gone, 1, '겹친 a 복사본 하나를 지운다');
  check(calls2.includes('DELETE /p2') && !calls2.includes('DELETE /p1'), `먼저 본 것을 남기고 뒤의 것을 지운다 ${calls2.join(', ')}`);

  /* 두 화면이 겹쳐 불러도 맞춤은 한 번 */
  let posts = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (!init.method) return { ok: true, json: async () => ({ items: [] }) };
    if (init.method === 'POST') posts += 1;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const one = [{ id: 'z', date: '2026-10-02', title: '하나' }];
  const [x1, x2] = await Promise.all([F.syncToGoogle('tok', 'ai-cal', one), F.syncToGoogle('tok', 'ai-cal', one)]);
  eq(posts, 1, '같은 항목을 두 번 만들지 않는다');
  check(x1 === x2, '뒤에 부른 쪽은 도는 맞춤의 결과를 같이 받는다');
}

/* ── 토큰: 401 이면 갱신해 한 번만 다시 (gauth.ts withToken) ── */
{
  globalThis.window = globalThis;
  const G = await load('src/widgets/planner/gauth.ts', 'planner-gauth');
  localStorage.clear();
  localStorage.setItem('karmolab_google_token', JSON.stringify({ access_token: 'old', expires_at: Date.now() + 3600000 }));
  localStorage.setItem('karmolab_google_refresh', 'rt');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'new', expires_in: 3599 }) });
  const seen = [];
  const got = await G.withToken('old', async (tok) => {
    seen.push(tok);
    if (tok === 'old') throw new Error('events 401');
    return 'ok';
  });
  eq(got, 'ok', '갱신한 토큰으로 성공');
  eq(seen.join(), 'old,new', '거절된 토큰 다음에 새 토큰으로 한 번');
  let tries = 0;
  const err = await G.withToken('new', async () => {
    tries += 1;
    throw new Error('events 500');
  }).catch((e) => e.message);
  eq(err, 'events 500', '401 이 아니면 그대로 실패');
  eq(tries, 1, '401 이 아니면 다시 안 부른다');
  localStorage.clear();
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
  C.invalidateCached('cal1');check(C.loadCached('cal1').needsRefresh,'일정 쓰기 후 전체 갱신 필요 표시');eq(C.loadCached('cal1').items.a.summary,'새 제목','후속 읽기 실패에도 저장본 보존');
}

const R = await load('src/widgets/planner/recurrence.ts', 'recurrence');
{
  const model = await load('src/widgets/planner/event-model.ts', 'event-model');
  const rows = [{ id: 'local__shared', title: 'shared', start: '2026-10-14', end: '2026-10-15', allDay: true,
    repeat: { frequency: 'daily', interval: 1, days: [], until: '2026-10-16' },
    exceptions: { '2026-10-14': { start: '2026-11-02', end: '2026-11-03' }, '2026-10-15': { cancelled: true } } }];
  const raw = JSON.stringify(rows);
  localStorage.setItem('karmolab_planner_events', raw);
  const range = [new Date(2026, 10, 2), new Date(2026, 10, 3)];
  const moved = model.eventsFromRows(rows, 'shared', ...range);
  eq(JSON.stringify(moved), JSON.stringify(L.listEvents('shared', ...range)), 'pure model and browser cache use identical expansion');
  eq(moved.length, 1, 'moved exception enters a range outside its series');
  eq(moved[0].extendedProps.googleId, 'local__shared', 'derived occurrence retains source key');
  eq(moved[0].extendedProps.occurrenceDate, '2026-10-14', 'moved occurrence retains original date');
  eq(JSON.stringify(rows), raw, 'pure expansion preserves input rows');
  eq(localStorage.getItem('karmolab_planner_events'), raw, 'pure expansion preserves stored rows');
  const boundary = model.eventsFromRows([{ ...rows[0], exceptions: {} }], 'shared', new Date(2026, 9, 15), new Date(2026, 9, 16));
  eq(boundary.map(event => event.start).join(), '2026-10-15', 'all day overlap excludes end at from and start at to');
  localStorage.removeItem('karmolab_planner_events');
}
{
  const groups=await load('src/widgets/planner/event-group.ts','event-groups');
  const local=await load('src/widgets/planner/local-store.ts','group-local');
  localStorage.removeItem('karmolab_planner_events');
  const links=[{side:'before',title:'출근',minutes:30,gap:10},{side:'after',title:'퇴근',minutes:60,gap:0}];
  const id=local.createEvent({title:'회사',start:new Date(2026,9,14,9).toISOString(),end:new Date(2026,9,14,18).toISOString(),allDay:false,linkedEvents:links,repeat:{frequency:'daily',interval:1,days:[],until:'2026-10-16'}});
  const range=[new Date(2026,9,14),new Date(2026,9,17)];
  let events=groups.withLinkedEvents(local.listEvents('내 일정',...range));
  eq(events.length,9,'회사3회에 앞뒤6회 파생');
  const before=events.find(e=>e.title==='출근');eq(new Date(before.start).getHours()+':'+new Date(before.start).getMinutes(),'8:20','출근 길이30분과 간격10분');
  eq(new Date(events.find(e=>e.title==='퇴근').start).getHours(),18,'퇴근은 회사 종료부터');
  check(events.filter(e=>e.extendedProps.parentEventId).every(e=>!e.startEditable&&!e.durationEditable),'연결 일정 독립 이동 보호');
  local.updateOccurrence(id,'2026-10-15',{end:new Date(2026,9,15,20,30).toISOString()});
  events=groups.withLinkedEvents(local.listEvents('내 일정',...range));
  eq(events.filter(e=>e.title==='퇴근').map(e=>new Date(e.start).getHours()+':'+new Date(e.start).getMinutes()).join(),'18:0,20:30,18:0','야근 하루만 퇴근 이동');
  local.updateOccurrence(id,'2026-10-16',{cancelled:true});eq(groups.withLinkedEvents(local.listEvents('내 일정',...range)).length,6,'휴가 하루 그룹3개 함께 제외');
  const reread=await load('src/widgets/planner/local-store.ts','group-reload');eq(groups.withLinkedEvents(reread.listEvents('내 일정',...range)).length,6,'재읽기 후 야근과 휴가 유지');
  local.updateOccurrence(id,'2026-10-15',{end:new Date(2026,9,15,20,30).toISOString(),linkedEvents:[{...links[1],minutes:5}]});
  local.updateEvent(id,{linkedEvents:[links[0],{...links[1],minutes:45}]});
  events=groups.withLinkedEvents(local.listEvents('내 일정',...range));
  check(events.filter(e=>e.title==='퇴근').every(e=>Date.parse(e.end)-Date.parse(e.start)===45*60000),'이전 회차 연결 덮어쓰기도 공통 설정 상속');
  eq(events.length,6,'공통 연결 변경 후 휴가 제외 유지');
  const saved=JSON.parse(localStorage.getItem('karmolab_planner_events'))[0];
  check(!('linkedEvents' in saved.exceptions['2026-10-15'])&&saved.exceptions['2026-10-15'].end.includes('T'),'옛 연결 덮어쓰기 제거와 야근 보존');
  local.updateOccurrence(id,'2026-10-16',null);eq(groups.withLinkedEvents(local.listEvents('내 일정',...range)).length,9,'휴가 그룹 복원');
  local.updateEvent(id,{linkedEvents:[links[0],{...links[1],minutes:45}]});
  events=groups.withLinkedEvents(local.listEvents('내 일정',...range));check(events.filter(e=>e.title==='퇴근').every(e=>Date.parse(e.end)-Date.parse(e.start)===45*60000),'야근 예외도 전체 연결 길이 변경 상속');
  local.updateOccurrence(id,'2026-10-14',{start:new Date(2026,10,2,9).toISOString(),end:new Date(2026,10,2,18).toISOString()});
  const moved=local.listEvents('내 일정',new Date(2026,10,1),new Date(2026,10,3));eq(moved.length,1,'원래 달 밖으로 이동한 예외 표시');eq(moved[0].extendedProps.occurrenceDate,'2026-10-14','이동 후 원래 날짜로 예외 식별');
  local.updateOccurrence(id,'2026-10-14',null);local.deleteEvent(id);eq(groups.withLinkedEvents(local.listEvents('내 일정',...range)).length,0,'반복 전체 삭제 후 연결 일정 잔존0');
  const parent=P.toFcEvent({id:'parent',summary:'밤근무',start:{dateTime:new Date(2026,9,14,23).toISOString()},end:{dateTime:new Date(2026,9,15,1).toISOString()},extendedProperties:{private:{karmoLinks:JSON.stringify(links)}}},CAL);
  const night=groups.withLinkedEvents([parent]);eq(new Date(night[2].start).getDate(),15,'밤샘 뒤 연결 일정 다음날');
  eq(groups.withLinkedEvents([{...parent,allDay:true}]).length,1,'종일에 연결 시간 생성 없음');eq(groups.parseLinks('bad').length,0,'잘못된 구글 메타데이터 방어');
  const payload=P.toGooglePayload({title:'회사',start:new Date(2026,9,14,9),end:new Date(2026,9,14,18),allDay:false,linkedEvents:links});eq(JSON.parse(payload.extendedProperties.private.karmoLinks).length,2,'구글 기준 일정 속성에 연결 규칙2개 저장');
  eq(P.toGooglePayload({title:'해제',start:new Date(),end:new Date(),allDay:false,linkedEvents:null}).extendedProperties.private.karmoLinks,null,'구글 회차 연결 덮어쓰기 해제');
  eq(P.toGooglePayload({start:new Date(),end:new Date(),allDay:false,linkedEvents:[],commonLinks:true}).extendedProperties.private.karmoLinksScope,'group','빈 공통 연결도 명시적으로 저장');
  const oldStart=new Date(2026,9,14,9),newStart=new Date(2026,9,14,10);
  const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace('.000','');
  const oldRules=['RRULE:FREQ=DAILY;UNTIL=20261020T145959Z',`EXDATE:${stamp(new Date(2026,9,9,9))}`];
  const adjusted=groups.shiftExDates(oldRules,oldStart,newStart);eq(adjusted[0],oldRules[0],'구글 전체 시간 변경에서 RRULE 보존');eq(adjusted[1],`EXDATE:${stamp(new Date(2026,9,9,10))}`,'구글 전체 시간 변경에서 공휴일 제외 시각 동반 이동');
  const holiday=local.createEvent({title:'회사',start:new Date(2026,9,8,9).toISOString(),end:new Date(2026,9,8,18).toISOString(),allDay:false,linkedEvents:links,repeat:{frequency:'daily',interval:1,days:[],startDate:'2026-10-08',until:'2026-10-10',excludeHolidays:true}});
  eq(groups.withLinkedEvents(local.listEvents('내 일정',new Date(2026,9,8),new Date(2026,9,11))).length,6,'공휴일에는 회사와 앞뒤 일정 모두 없음');local.deleteEvent(holiday);
  const oldFetch=globalThis.fetch;let reads=0;globalThis.fetch=async()=>{reads++;return new Response(JSON.stringify({id:'master',summary:'회사',start:{dateTime:parent.start},end:{dateTime:parent.end},extendedProperties:{private:{karmoLinks:JSON.stringify(links)}}}));};
  try {
    const a={...parent,id:'primary__a',extendedProps:{...parent.extendedProps,calendarId:'primary',googleId:'a',recurringEventId:'master',linkedEvents:[]}};
    const b={...a,id:'primary__b',extendedProps:{...a.extendedProps,googleId:'b'}};
    const hydrated=await P.hydrateGroups('account-a-fixture',[a,b]);eq(reads,1,'구글 반복 부모 조회 회차별 중복 없음');eq(groups.withLinkedEvents(hydrated).length,6,'구글 부모 연결 규칙 상속');
    await P.hydrateGroups('account-b-fixture',[a]);eq(reads,2,'다른 계정에 부모 캐시 공유 없음');
  }finally{globalThis.fetch=oldFetch;}
}
{
  const start=new Date(2026,8,21,10),end=new Date(2026,8,21,11);
  const rule={frequency:'daily',interval:1,days:[],startDate:'2026-09-21',until:'2026-09-27',excludeHolidays:true};
  const range=[new Date(2026,8,21),new Date(2026,8,28)];
  const kept=R.occurrences(start,end,rule,...range);
  eq(kept.map(e=>P.ymd(e.start)).join(),'2026-09-21,2026-09-22,2026-09-23,2026-09-27','추석3일 제외, 일요일 유지');
  eq(R.occurrences(start,end,{...rule,excludeHolidays:false},...range).length,7,'공휴일 제외 해제 후7회');
  const timed=P.toGooglePayload({title:'휴일 제외',start,end,allDay:false,repeat:rule});
  const stamp=d=>new Date(2026,8,d,10).toISOString().replace(/[-:]/g,'').replace('.000','');
  eq(timed.recurrence[1],`EXDATE:${[24,25,26].map(stamp).join(',')}`,'구글 실제 공휴일 회차 시각 제외');
  const allDay=P.toGooglePayload({title:'첫회차 휴일',start:new Date(2026,9,3),end:new Date(2026,9,3),allDay:true,repeat:{...rule,startDate:'2026-10-03',until:'2026-10-06'}});
  eq(allDay.recurrence[1],'EXDATE;VALUE=DATE:20261003,20261005','종일 첫 회차와 대체공휴일 제외');
  eq(allDay.start.date,'2026-10-03','휴일이어도 반복 앵커 유지');
  const fortnight=R.occurrences(new Date(2026,9,3,10),new Date(2026,9,3,11),{...rule,frequency:'weekly',days:[6],interval:2,startDate:'2026-10-03',until:'2026-10-31'},new Date(2026,9,1),new Date(2026,10,1));
  eq(fortnight.map(e=>P.ymd(e.start)).join(),'2026-10-17,2026-10-31','휴일 건너뛰어도 격주 간격 유지');
  const local=await load('src/widgets/planner/local-store.ts','holiday-local');localStorage.removeItem('karmolab_planner_events');
  const id=local.createEvent({title:'휴일 제외',start:start.toISOString(),end:end.toISOString(),allDay:false,repeat:rule});
  const reloaded=await load('src/widgets/planner/local-store.ts','holiday-local-reload');
  eq(reloaded.listEvents('내 일정',...range).length,4,'재읽기 후 공휴일 제외 유지');
  local.updateEvent(id,{repeat:{...rule,excludeHolidays:false}});eq(local.listEvents('내 일정',...range).length,7,'저장된 제외 해제');local.deleteEvent(id);
  check(!R.holidayRangeSupported(start,{...rule,until:undefined}),'제외 무기한 범위 거부');
  check(!R.holidayRangeSupported(start,{...rule,until:'2028-01-01'}),'제외 미지원 미래 거부');
  check(!R.holidayRangeSupported(start,{...rule,startDate:'2023-12-31'}),'제외 미지원 과거 거부');
  let rejected=false;try{P.toGooglePayload({title:'잘못된 범위',start,end,allDay:false,repeat:{...rule,until:undefined}});}catch{rejected=true;}check(rejected,'잘못된 범위 Google 전송 차단');
  const H=await load('src/lib/holidays.ts','holiday-table');
  check(H.holidayKeys('KR',2024).has('2024-5-6'),'2024 어린이날 대체');
  check(H.holidayKeys('KR',2025).has('2025-6-3'),'2025 대통령선거');
  check(['2026-5-1','2026-6-3','2026-7-17'].every(d=>H.holidayKeys('KR',2026).has(d)),'2026 노동절 선거 제헌절');
  check(['2027-5-3','2027-7-19','2027-8-16','2027-10-4','2027-10-11','2027-12-27'].every(d=>H.holidayKeys('KR',2027).has(d)),'2027 대체공휴일6개');
}
{
  const start = new Date(2026, 9, 14, 10), end = new Date(2026, 9, 14, 11);
  const rule = { frequency: 'weekly', interval: 1, days: [1, 3], startDate: '2026-09-01', until: '2026-09-30' };
  const first = R.repeatWindow(start, end, rule);
  eq(P.ymd(first.start), '2026-09-02', '반복 시작일 이후 선택 요일 첫 회차');
  check(first.start.getHours() === 10 && first.end.getHours() === 11, '과거 반복 시작에도 일정 시간과 길이 유지');
  eq(P.ymd(start), '2026-10-14', '원본 일정 날짜 미변경');
  const list = R.occurrences(start, end, rule, new Date(2026, 8, 1), new Date(2026, 9, 1));
  eq(list.map(x => P.ymd(x.start)).join(), '2026-09-02,2026-09-07,2026-09-09,2026-09-14,2026-09-16,2026-09-21,2026-09-23,2026-09-28,2026-09-30', '원본 일정 날짜 이전의 반복9회');
  eq(P.ymd(R.repeatWindow(start, end, { ...rule, startDate: '2026-10-15', interval: 2, days: [1] }).start), '2026-10-26', '선택 요일 지난 격주 시작은 다음 유효 주');
  const night = R.repeatWindow(new Date(2026,9,14,23),new Date(2026,9,15,1),{...rule,frequency:'daily'});
  eq(`${P.ymd(night.start)} ${night.start.getHours()}/${P.ymd(night.end)} ${night.end.getHours()}`, '2026-09-01 23/2026-09-02 1', '과거 반복 밤샘 길이 유지');
  const payload = P.toGooglePayload({ title: '과거 시작', start, end, allDay: false, repeat: rule });
  eq(payload.start.dateTime,first.start.toISOString(),'구글 첫 실제 회차 DTSTART');
  eq(payload.end.dateTime,first.end.toISOString(),'구글 첫 실제 회차 DTEND');
  const local = await load('src/widgets/planner/local-store.ts','repeat-boundary-local');
  localStorage.removeItem('karmolab_planner_events');
  const id = local.createEvent({title:'과거 반복',start:start.toISOString(),end:end.toISOString(),allDay:false,repeat:rule});
  const reread = await load('src/widgets/planner/local-store.ts','repeat-boundary-reload');
  const events = reread.listEvents('내 일정',new Date(2026,8,1),new Date(2026,9,1));
  eq(events.length,9,'재읽기 후 과거 반복9회');
  check(events.every(e=>e.extendedProps.repeatRule.startDate==='2026-09-01'&&e.extendedProps.seriesStart===start.toISOString()),'반복 시작일과 원본 일정 날짜 별도 보존');
  local.deleteEvent(id);
}
{
  const start = new Date(2026, 9, 14, 10), end = new Date(2026, 9, 14, 11);
  const weekly = { frequency: 'weekly', interval: 1, days: [1, 3], until: '2026-10-26' };
  const list = R.occurrences(start, end, weekly, new Date(2026, 9, 1), new Date(2026, 10, 1));
  eq(list.map(x => P.ymd(x.start)).join(), '2026-10-14,2026-10-19,2026-10-21,2026-10-26', '요일과 종료일 포함, 시작 전 회차 없음');
  check(list.every(x => x.start.getHours() === 10 && x.end.getHours() === 11), '반복 시간 유지');
  const alternate = R.occurrences(start, end, { ...weekly, interval: 2, until: undefined }, new Date(2026, 9, 1), new Date(2026, 10, 1));
  eq(alternate.map(x => P.ymd(x.start)).join(), '2026-10-14,2026-10-26,2026-10-28', '격주와 주 시작 일요일');
  const daily = R.occurrences(new Date(2026,9,14),new Date(2026,9,15),{frequency:'daily',interval:1,days:[],until:'2026-10-16'},new Date(2026,9,1),new Date(2026,10,1));
  eq(daily.length,3,'종일 매일 종료일까지3회');
  check(daily.every(x=>x.end.getDate()===x.start.getDate()+1),'종일 끝 다음날');
  const overnight=R.occurrences(new Date(2026,9,14,23),new Date(2026,9,15,1),{frequency:'daily',interval:1,days:[]},new Date(2026,9,15),new Date(2026,9,16));
  eq(overnight.length,2,'전날 시작해 구간에 걸친 회차 포함');
  const payload=P.toGooglePayload({title:'주간',start,end,allDay:false,repeat:weekly});
  check(payload.recurrence?.[0]?.includes('FREQ=WEEKLY;INTERVAL=1;WKST=SU;BYDAY=MO,WE;UNTIL='),'구글 주간 반복 payload');
  eq(payload.start.timeZone,Intl.DateTimeFormat().resolvedOptions().timeZone,'구글 반복 시간대 명시');
  eq(R.toRRule({frequency:'daily',interval:2,days:[],until:'2026-10-16'},true),'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261016','종일 RRULE 종료일 날짜');
  eq(P.toGooglePayload({title:'해제',start,end,allDay:false,repeat:null}).recurrence.length,0,'반복 해제 명시');
  const instance=P.toFcEvent({id:'instance',recurringEventId:'series',start:{date:'2026-10-14'},end:{date:'2026-10-15'}},CAL);
  eq(instance.extendedProps.recurringEventId,'series','구글 회차 구분 유지');
}
{
  const local=await load('src/widgets/planner/local-store.ts','repeat-local');
  localStorage.removeItem('karmolab_planner_events');
  const id=local.createEvent({title:'반복',start:'2026-10-14',end:'2026-10-15',allDay:true,repeat:{frequency:'weekly',interval:1,days:[1,3],until:'2026-10-26'}});
  const range=[new Date(2026,9,1),new Date(2026,10,1)];
  const events=local.listEvents('내 일정',...range);
  eq(events.length,4,'저장된 규칙 회차4개');
  check(events.every(e=>e.extendedProps.localSeriesId===id&&!e.startEditable),'반복 원본 ID와 끌기 보호');
  eq(new Set(events.map(e=>e.id)).size,4,'회차 ID 고유');
  const reread=await load('src/widgets/planner/local-store.ts','repeat-reload');
  eq(reread.listEvents('내 일정',...range).map(e=>e.id).join(),events.map(e=>e.id).join(),'다시 읽은 회차와 ID 동일');
  local.updateEvent(id,{title:'전체 수정',repeat:null});
  eq(local.listEvents('내 일정',...range).length,1,'반복 해제 후 원본1개');
  local.deleteEvent(id);eq(local.listEvents('내 일정',...range).length,0,'전체 반복 삭제');
}
{
  const previous=process.env.TZ;process.env.TZ='America/New_York';
  const list=R.occurrences(new Date(2026,9,31,9),new Date(2026,9,31,10),{frequency:'daily',interval:1,days:[]},new Date(2026,9,31),new Date(2026,10,3));
  eq(list.map(x=>x.start.toISOString()).join(),'2026-10-31T13:00:00.000Z,2026-11-01T14:00:00.000Z,2026-11-02T14:00:00.000Z','서머타임 종료 뒤 현지9시 유지');
  if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;
}

process.stdout.write('\n');
{
  const anime = await load('src/widgets/planner/anime-calendar.ts', 'anime');
  const source = [{ id: 1, title: '내 작품', publishedAt: '2026-10-14T01:00:00+09:00', weekdays: ['수요일'] }];
  const events = anime.animeEvents(new Date('2026-10-01T00:00:00+09:00'), new Date('2026-10-29T00:00:00+09:00'), source, Date.parse('2026-10-14T09:00:00+09:00'));
  eq(events.map(e => e.start).join(), '2026-10-14,2026-10-21,2026-10-28', '과거 편성 추측 제외, 실제 업로드와 다음 편성');
  eq(events[0].title, '업로드: 내 작품', '실제 업로드 구분');
  eq(events[1].title, '편성 예정: 내 작품', '요일 예정 구분');
  eq(events[0].end, '2026-10-15', '업로드 종일 끝 제외');
  eq(anime.animeEvents(new Date('2026-10-01'), new Date('2026-10-29'), [{ ...source[0], publishedAt: 'invalid' }]).length, 0, '잘못된 업로드 날짜 제외');
  const netflix = [{ id: 'netflix:1', title: '등록 작품', publishedAt: '', weekdays: [], provider: 'netflix', url: 'https://www.netflix.com/title/1', releases: ['2026-10-23T17:00:00+09:00', '2026-10-30T17:00:00+09:00'] }];
  const planned = anime.animeEvents(new Date('2026-10-23T17:00:00+09:00'), new Date('2026-10-30T17:00:00+09:00'), netflix);
  eq(planned.length, 1, '넷플릭스 명시 일정과 범위 끝 제외');
  eq(planned[0].start, '2026-10-23T17:00:00+09:00', '공식 공개 시각 유지');
  eq(planned[0].title, '넷플릭스 공개 예정: 등록 작품', '지난 예정도 실제 업로드로 오표시 제외');
  eq(planned[0].extendedProps.htmlLink, 'https://www.netflix.com/title/1', '넷플릭스 링크');
  eq(anime.animeEvents(new Date('2026-11-01'), new Date('2027-01-01'), netflix).length, 0, '종료 뒤 무한 반복 제외');
}
/* 할 일은 한 페이지 100개. 완료 항목까지 포함한 모든 페이지 수집 확인 */
{
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    const first = Array.from({ length: 100 }, (_, n) => ({ id: `task-${n}`, title: `할 일 ${n}`, status: 'needsAction' }));
    const pages = [
      { items: first, nextPageToken: 'page +/한글' },
      { nextPageToken: 'last-page' },
      { items: [{ id: 'working', title: '진행', notes: '[IN_PROGRESS]', status: 'needsAction' }, { id: 'finished', title: '완료', status: 'completed' }] }
    ];
    globalThis.fetch = async (url, options) => {
      requests.push({ url: new URL(url), options });
      return { ok: true, json: async () => pages[requests.length - 1] };
    };
    const all = await P.fetchTasks('fixture-only');
    eq(requests.length, 3, '빈 중간 페이지도 다음 토큰까지 조회');
    eq(all.todo.length, 100, '첫 페이지 할 일 보존');
    eq(all.inProgress.map(x => x.id).join(), 'working', '뒤 페이지 진행 중 항목 포함');
    eq(all.done.map(x => x.id).join(), 'finished', '뒤 페이지 완료 항목 포함');
    eq(requests[1]?.url.searchParams.get('pageToken'), 'page +/한글', '페이지 토큰 문자 인코딩 보존');
    check(requests.every(r => r.url.searchParams.get('showCompleted') === 'true' && r.url.searchParams.get('showHidden') === 'true' && r.url.searchParams.get('maxResults') === '100'), '매 페이지 완료와 숨김 옵션 유지');
    check(requests.every(r => r.options.headers.Authorization === 'Bearer fixture-only'), '매 페이지 기존 인증 헤더 유지');

    let call = 0, error = '';
    globalThis.fetch = async () => ++call === 1
      ? { ok: true, json: async () => ({ items: first, nextPageToken: 'next' }) }
      : { ok: false, status: 503 };
    try { await P.fetchTasks('fixture-only'); } catch (e) { error = e.message; }
    eq(error, 'tasks 503', '뒤 페이지 실패를 부분 성공으로 반환하지 않음');

    call = 0; error = '';
    globalThis.fetch = async () => {
      call += 1;
      if (call > 4) throw new Error('fixture runaway');
      return { ok: true, json: async () => ({ items: [], nextPageToken: 'same-page' }) };
    };
    try { await P.fetchTasks('fixture-only'); } catch (e) { error = e.message; }
    eq(error, 'tasks repeated page token', '잘못 반복된 페이지 토큰은 무한 조회 중단');
    eq(call, 2, '반복 토큰의 세 번째 요청 없음');
  } finally { globalThis.fetch = originalFetch; }
}

if (failures.length) {
  console.error(`\n[test-planner-core] ${failures.length}건 실패:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[test-planner-core] 다 통과');
