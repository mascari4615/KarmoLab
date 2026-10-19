import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersonalNotifications, agendaSelection, dueReminders, kstDate, summaryText, summaryEmbed, type AgendaReport } from './personal-notifications';

const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })); });
const now = Date.parse('2026-10-14T09:00:00+09:00');
function fixture(): AgendaReport {
  return { collectedAt: new Date(now).toISOString(), connected: true, settings: { enabled: true, hour: 9, minute: 0, reminderMinutes: 30, animeIds: [1] }, errors: [], anime: [], events: [
    { id: 'day', title: '종일 마감', start: '2026-10-14', end: '2026-10-15', allDay: true },
    { id: 'ended', title: '어제', start: '2026-10-13', end: '2026-10-14', allDay: true },
    { id: 'soon', title: '약속', start: '2026-10-14T09:30:00+09:00', end: '2026-10-14T10:00:00+09:00', allDay: false },
    { id: 'next', title: '다음 약속', start: '2026-10-15T09:30:00+09:00', end: '2026-10-15T10:00:00+09:00', allDay: false },
  ], tasks: [ { id: 'done', title: '완료', status: 'completed' }, { id: 'late', title: '미완 마감', due: '2026-10-13' }, { id: 'future', title: '다음 마감', due: '2026-10-15' } ] };
}
function setup(send = vi.fn(async () => {})): { service: PersonalNotifications; send: typeof send; root: string; request: ReturnType<typeof vi.fn>; setAnime: (at: string) => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-notify-test-')); dirs.push(root);
  fs.mkdirSync(path.join(root, 'data/personal-notifications'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/personal-notifications/settings.json'), JSON.stringify(fixture().settings));
  let episode = '2026-10-13T20:00:00';
  const request = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/google/refresh')) return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    if (u.includes('calendarList')) return Response.json({ items: [{ id: 'primary', summary: '개인' }] });
    if (u.includes('/events?')) return Response.json({ items: [{ id: 'event', summary: '약속', start: { dateTime: '2026-10-14T09:30:00+09:00' }, end: { dateTime: '2026-10-14T10:00:00+09:00' } }, { id: 'cancelled', status: 'cancelled' }] });
    if (u.includes('/users/@me/lists')) return Response.json({ items: [{ id: 'list' }] });
    if (u.includes('/tasks?')) return Response.json({ items: [{ id: 'task', title: '구글 할 일', status: 'needsAction' }, { id: 'done', title: '완료', status: 'completed' }] });
    if (u.includes('api.laftel.net')) return Response.json([{ id: 1, name: '내 작품', latest_episode_created: episode, is_episode_existed: true, distributed_air_times: ['수요일'] }, { id: 2, name: '남의 작품', latest_episode_created: episode, is_episode_existed: true }]);
    throw new Error('unexpected URL');
  });
  const service = new PersonalNotifications(root, send, path.join(root, 'runtime'), request as typeof fetch);
  service.updateConnection({ refreshToken: 'fixture-refresh-token', localEvents: [], localTasks: [], localUpdatedAt: new Date(now).toISOString(), localThrough: '2026-12-01' });
  return { service, send, root, request, setAnime: at => { episode = at; } };
}
describe('개인 안내', () => {
  it('daily embed keeps agenda fields with a visible overflow count and planner link', () => {
    const report = fixture();
    report.tasks = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `할 일 ${i}` }));
    const embed = summaryEmbed(report, now);
    expect(embed.color).toBe(0x8b5cf6);
    expect(embed.description).toContain('#planner');
    expect(embed.fields?.find(field => field.name === '오늘 할 일')?.value).toContain('외 9개');
    expect(embed.fields?.find(field => field.name === '오늘 일정')?.value).toContain('약속');
    expect(embed).not.toHaveProperty('footer');
  });
  it('every send path supplies an embed, including reminders and both episode providers', async () => {
    const send = vi.fn(async (_text: string, _embed: unknown) => {});
    const x = setup(send);
    await x.service.tick(now);
    x.setAnime('2026-10-14T09:01:00');
    fs.writeFileSync(path.join(x.root, 'data/personal-notifications/netflix.json'), JSON.stringify([{ id: '1', title: '넷플릭스 작품', releases: ['2026-10-14T09:02:00+09:00'] }]));
    await x.service.tick(now + 6 * 60000);
    const cards = send.mock.calls.map(call => call[1] as { color: number; description: string });
    expect(cards.some(card => card.color === 0x8b5cf6)).toBe(true);
    expect(cards.some(card => card.color === 0xe67e22 && card.description.includes('일정 임박'))).toBe(true);
    expect(cards.some(card => card.color === 0xec4899 && card.description.includes('새 에피소드'))).toBe(true);
    expect(cards.some(card => card.color === 0xec4899 && card.description.includes('업로드 미확인'))).toBe(true);
  });
  const catalog = (x: ReturnType<typeof setup>): void => {
    fs.writeFileSync(path.join(x.root, 'data/personal-notifications/laftel-catalog.json'), JSON.stringify({ titles: [{ id: 1, title: '내 작품', episodes: [
      { id: 10, number: '1', title: '첫 만남', publishedAt: '2026-10-01T20:00:00', available: true },
      { id: 11, number: '2', title: '다시 만남', publishedAt: '2026-10-13T20:00:00', available: true },
      { id: 12, number: '3', title: '미래 회차', publishedAt: '2026-11-01T20:00:00', available: true },
      { id: 13, number: '특별편', title: '종료', publishedAt: '2026-10-02T20:00:00', available: false },
    ] }] }));
  };
  it('과거 회차는 숙제에서 분리, 기존 날짜 키와 시청 날짜 보존, 번호와 제목 보강', async () => {
    const x = setup(); const first = await x.service.collect(now), key = first.homework![0].key;
    x.service.setAnimeWatched(key, true, '2026-10-13T22:00:00+09:00', now);
    catalog(x);
    const next = await x.service.collect(now);
    expect(next.homework).toHaveLength(2);
    expect(next.homework!.find(e => e.key === key)).toMatchObject({ episodeId: 11, episodeNumber: '2', episodeTitle: '다시 만남', watchedAt: '2026-10-13T13:00:00.000Z', archived: false });
    expect(next.homework!.find(e => e.episodeId === 10)?.archived).toBe(true);
    expect(summaryText(next, now)).toContain('안 본 애니 0회');
    expect(next.errors).toContain('내 작품 회차 갱신 실패, 저장본 표시');
    expect((await x.service.collect(now)).homework).toHaveLength(2);
  });
  it('회차 API 페이지 연결과 캐시, 재시작 뒤 시청값 보존', async () => {
    const x = setup(); catalog(x);
    const base = x.request.getMockImplementation()!;
    x.request.mockImplementation(async url => {
      const u = String(url);
      if (u.includes('/episodes/v3/list/')) return Response.json({ count: 2, next: u.includes('offset=0&') ? 'next-page' : null, results: [u.includes('offset=0&') ? { id: 10, episode_num: '1', subject: '첫 만남', published_datetime: '2026-10-01T20:00:00', is_viewing: true } : { id: 11, episode_num: '2', subject: '다시 만남', published_datetime: '2026-10-13T20:00:00', is_viewing: true }] });
      return base(url);
    });
    const first = await x.service.collect(now), key = first.homework!.find(e => e.episodeId === 11)!.key;
    x.service.setAnimeWatched(key, true, '2026-10-13T22:00:00+09:00', now);
    expect(first.homework).toHaveLength(2);
    expect(x.request.mock.calls.filter(c => String(c[0]).includes('/episodes/'))).toHaveLength(2);
    await x.service.collect(now);
    expect(x.request.mock.calls.filter(c => String(c[0]).includes('/episodes/'))).toHaveLength(2);
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    const report = await restarted.collect(now);
    expect(report.homework!.find(e => e.key === key)?.watchedAt).toBe('2026-10-13T13:00:00.000Z');
    expect(x.send).not.toHaveBeenCalled();
  });
  it('회차 수집 대기 중 저장한 시청 날짜 보존, 시각 정정의 임시 항목 중복 제외', async () => {
    const x = setup(); catalog(x);
    await x.service.collect(now);
    const key = x.service.status().homework!.find(e => e.episodeId === 11)!.key;
    x.setAnime('2026-10-13T20:01:00');
    const base = x.request.getMockImplementation()!;
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    x.request.mockImplementation(async url => {
      if (String(url).includes('/episodes/v3/list/')) {
        started(); await gate;
        return Response.json({ count: 1, next: null, results: [{ id: 11, episode_num: '2', subject: '다시 만남', published_datetime: '2026-10-13T20:01:00', is_viewing: true }] });
      }
      return base(url);
    });
    const collection = x.service.collect(now);
    await paused;
    x.service.setAnimeWatched(key, true, '2026-10-13T22:00:00+09:00', now);
    release();
    const report = await collection;
    expect(report.homework!.filter(e => e.episodeId === 11)).toHaveLength(1);
    expect(report.homework!.find(e => e.key === key)).toMatchObject({ publishedAt: '2026-10-13T11:01:00.000Z', watchedAt: '2026-10-13T13:00:00.000Z' });
    expect(report.homework!.some(e => e.key === 'laftel:1|2026-10-13T11:01:00.000Z')).toBe(false);
  });
  it('넷플릭스 번호는 명시된 시작 회차 기준, 기존 일정 키 유지', async () => {
    const x = setup();
    fs.writeFileSync(path.join(x.root, 'data/personal-notifications/netflix.json'), JSON.stringify([{ id: '1', title: '공식 일정', firstEpisode: 2, releases: ['2026-10-09T17:00:00+09:00', '2026-10-02T17:00:00+09:00'] }]));
    const report = await x.service.collect(now);
    expect(report.homework!.filter(e => e.provider === 'netflix').map(e => e.episodeNumber)).toEqual(['2', '3']);
  });
  const release = '2026-10-23T17:00:00+09:00';
  const netflix = (x: ReturnType<typeof setup>, releases = [release]): void => {
    fs.writeFileSync(path.join(x.root, 'data/personal-notifications/netflix.json'), JSON.stringify([{ id: '1', title: '넷플릭스 작품', releases }]));
  };
  it('넷플릭스 등록 작품과 링크, 오늘 공식 일정 요약, 업로드 확인과 구분', async () => {
    const x = setup(); netflix(x);
    const report = await x.service.collect(Date.parse(release) - 3600000);
    expect(report.anime.map(a => a.id)).toEqual([1, 'netflix:1']);
    expect(report.anime[1].url).toBe('https://www.netflix.com/title/1');
    expect(summaryText(report, Date.parse(release) - 3600000)).toContain('[넷플릭스] 넷플릭스 작품 17:00 공개 예정');
    expect(summaryText(report, Date.parse(release) - 3600000)).not.toContain('넷플릭스 작품 새 에피소드');
  });
  it('예정 시각 전 무전송, 첫 예정 시각 1회, 재시작 중복과 오래된 회차 제외', async () => {
    const x = setup(); netflix(x, ['2026-10-16T17:00:00+09:00', release]);
    const at = Date.parse(release);
    await x.service.tick(at - 60000);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(0);
    await x.service.tick(at);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(1);
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    await restarted.tick(at + 60000);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(1);
    await restarted.tick(at + 8 * 86400000);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(1);
  });
  it('넷플릭스 전송 실패 재시도와 구글 미연결에서도 일정 알림', async () => {
    const x = setup(); netflix(x);
    x.service.disconnect(); x.service.updateConnection({ localUpdatedAt: undefined });
    x.send.mockImplementation(async text => { if (text.startsWith('[넷플릭스]')) throw new Error('offline'); });
    await expect(x.service.tick(Date.parse(release))).rejects.toThrow('offline');
    x.send.mockResolvedValue(undefined);
    await x.service.tick(Date.parse(release) + 60000);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(2);
    await x.service.tick(Date.parse(release) + 120000);
    expect(x.send.mock.calls.filter(c => c[0].startsWith('[넷플릭스]'))).toHaveLength(2);
  });
  it('잘못된 넷플릭스 일정은 오류 표시, 기존 업로드 유지', async () => {
    const x = setup(); netflix(x, ['invalid']);
    const report = await x.service.collect(now);
    expect(report.errors).toContain('넷플릭스 공개 일정 읽기 실패');
    expect(report.anime.map(a => a.id)).toEqual([1]);
  });
  it('등록된 지난 회차만 숙제 생성, 예정 회차 제외와 다시 수집 중복 없음', async () => {
    const x = setup(); netflix(x, ['2026-10-16T17:00:00+09:00', release]);
    const at = Date.parse(release) - 60000;
    const first = await x.service.collect(at);
    expect(first.homework).toHaveLength(2);
    expect(first.homework?.filter(a => a.provider === 'netflix').map(a => a.publishedAt)).toEqual(['2026-10-16T08:00:00.000Z']);
    expect(first.homework?.every(a => !a.watchedAt)).toBe(true);
    expect((await x.service.collect(at)).homework).toHaveLength(2);
    expect(summaryText(first, at)).toContain('안 본 애니 2회');
  });
  it('봤음 체크는 재시작과 새 회차 수집 뒤 유지, 취소와 다른 기기 읽기', async () => {
    const x = setup(); const report = await x.service.collect(now), key = report.homework![0].key;
    expect(x.service.setAnimeWatched(key, true, undefined, now).homework![0].watchedAt).toBe(new Date(now).toISOString());
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    expect(restarted.status().homework![0].watchedAt).toBeTruthy();
    x.setAnime('2026-10-14T09:05:00');
    const next = await restarted.collect(now + 6 * 60000);
    expect(next.homework).toHaveLength(2);
    expect(next.homework!.find(a => a.key === key)?.watchedAt).toBeTruthy();
    expect(next.homework!.filter(a => !a.watchedAt)).toHaveLength(1);
    expect(restarted.setAnimeWatched(key, false).homework!.filter(a => !a.watchedAt)).toHaveLength(2);
    expect(() => restarted.setAnimeWatched('__proto__', true)).toThrow('episode_not_found');
  });
  it('저장 실패는 봤음 완료로 표시하지 않음', async () => {
    const x = setup(); const key = (await x.service.collect(now)).homework![0].key;
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
    try {
      expect(() => x.service.setAnimeWatched(key, true)).toThrow('disk full');
      expect(x.service.status().homework![0].watchedAt).toBeUndefined();
    } finally { write.mockRestore(); }
  });
  it('실제 시청 시각 입력과 수정, 재시작과 재수집 뒤 유지', async () => {
    const x = setup(); const key = (await x.service.collect(now)).homework![0].key;
    const first = x.service.setAnimeWatched(key, true, '2026-10-13T21:30:00+09:00', now);
    expect(first.homework![0].watchedAt).toBe('2026-10-13T12:30:00.000Z');
    x.service.setAnimeWatched(key, true, '2026-10-13T22:10:00+09:00', now);
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    expect((await restarted.collect(now)).homework![0].watchedAt).toBe('2026-10-13T13:10:00.000Z');
    expect(restarted.setAnimeWatched(key, true, undefined, now).homework![0].watchedAt).toBe('2026-10-13T13:10:00.000Z');
  });
  it('미래와 존재하지 않는 날짜, 시간대 없는 입력은 이전 시청 기록 유지', async () => {
    const x = setup(); const key = (await x.service.collect(now)).homework![0].key;
    x.service.setAnimeWatched(key, true, '2026-10-13T21:30:00+09:00', now);
    for (const value of ['2026-10-15T21:30:00+09:00', '2026-02-31T21:30:00+09:00', '2026-10-13T21:30:00', 'invalid']) {
      expect(() => x.service.setAnimeWatched(key, true, value, now)).toThrow('invalid_watched_at');
    }
    expect(x.service.status().homework![0].watchedAt).toBe('2026-10-13T12:30:00.000Z');
  });
  it('손상된 시청 기록은 덮어쓰지 않고 저장 오류 표시', async () => {
    const x = setup(); await x.service.collect(now);
    const file = path.join(x.root, 'runtime/personal-notifications-state.json');
    const saved = { ...JSON.parse(fs.readFileSync(file, 'utf8')), homework: 'broken' };
    fs.writeFileSync(file, JSON.stringify(saved));
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    expect(restarted.status().errors).toContain('알림 저장본 손상, 운영 확인 필요');
    expect(() => restarted.setAnimeWatched('missing', true)).toThrow('notification_storage_invalid');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).homework).toBe('broken');
  });
  it('한국 새벽 날짜와 종일 끝 제외, 완료한 할 일 제외', () => {
    expect(kstDate(Date.parse('2026-10-13T16:00:00Z'))).toBe('2026-10-14');
    const selection = agendaSelection(fixture(), now);
    expect(selection.today.map(e => e.id)).toEqual(['day', 'soon']);
    expect(selection.upcoming.map(e => e.id)).toEqual(['next']);
    expect(selection.tasks.map(t => t.id)).toEqual(['late']);
    expect(summaryText(fixture(), now)).toContain('종일 마감');
  });
  it('30분 전 경계, 시작 지난 일정과 종일 제외, 시작 시간 변경은 새 알림', () => {
    expect(dueReminders(fixture(), {}, now).map(e => e.id)).toEqual(['soon']);
    expect(dueReminders(fixture(), { 'soon|2026-10-14T09:30:00+09:00': 'sent' }, now)).toEqual([]);
    expect(dueReminders(fixture(), {}, now + 30 * 60000)).toEqual([]);
    expect(dueReminders(fixture(), { 'soon|2026-10-14T09:00:00+09:00': 'sent' }, now).map(e => e.id)).toEqual(['soon']);
  });
  it('구글 일정과 할 일, 내 애니만 수집, 토큰 응답 제외', async () => {
    const { service } = setup(); const report = await service.collect(now);
    expect(report.events.map(e => e.title)).toEqual(['약속']);
    expect(report.tasks.map(t => t.title)).toEqual(['구글 할 일']);
    expect(report.anime.map(a => a.title)).toEqual(['내 작품']);
    expect(JSON.stringify(report)).not.toContain('fixture-refresh');
    expect(report.errors).toEqual([]);
  });
  it('재시작해도 오늘 요약과 같은 회차 중복 없음, 새 회차 한 번', async () => {
    const x = setup(); await x.service.tick(now); expect(x.send).toHaveBeenCalledTimes(2);
    const restarted = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    await restarted.tick(now + 60000); expect(x.send).toHaveBeenCalledTimes(2);
    x.setAnime('2026-10-14T09:05:00'); await restarted.tick(now + 6 * 60000);
    expect(x.send).toHaveBeenCalledTimes(3); expect(x.send.mock.calls[2][0]).toContain('새 에피소드');
    await restarted.tick(now + 7 * 60000); expect(x.send).toHaveBeenCalledTimes(3);
  });
  it('전송 거절 뒤 다음 회차 재시도, 성공 전 완료 표식 없음', async () => {
    const send = vi.fn<(_text: string) => Promise<void>>().mockRejectedValueOnce(new Error('Discord offline')).mockResolvedValue(undefined);
    const x = setup(send); await expect(x.service.tick(now)).rejects.toThrow('Discord offline');
    expect(JSON.parse(fs.readFileSync(path.join(x.root, 'runtime/personal-notifications-state.json'), 'utf8')).daily).toBeUndefined();
    await x.service.tick(now + 60000); expect(send).toHaveBeenCalledTimes(3);
  });
  it('미연결은 자동 전송 없이 대기, 해제 즉시 상태 갱신', async () => {
    const x = setup(); x.service.disconnect(); expect(x.service.status().connected).toBe(false);
    x.service.updateConnection({ localUpdatedAt: undefined }); await x.service.tick(now); expect(x.send).not.toHaveBeenCalled();
  });
  it('저장본 손상은 봇 기동 유지, 개인 알림만 중단', async () => {
    const x = setup(); fs.writeFileSync(path.join(x.root, 'runtime/personal-notifications-state.json'), '{broken');
    const next = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    expect(next.status().errors).toContain('알림 저장본 손상, 운영 확인 필요');
    await next.tick(now); expect(x.send).not.toHaveBeenCalled();
  });
  it('폰의 빈 목록은 PC 목록 보존, PC 삭제는 해당 목록만 반영', async () => {
    const x = setup();
    x.service.updateConnection({ deviceId: 'desktop', localEvents: [fixture().events[2]], localTasks: [{ id: 'local-task', title: 'PC 할 일' }], localUpdatedAt: new Date(now).toISOString(), localThrough: '2026-12-01' });
    x.service.updateConnection({ deviceId: 'phone', localEvents: [], localTasks: [], localUpdatedAt: new Date(now).toISOString(), localThrough: '2026-12-01' });
    let report = await x.service.collect(now);
    expect(report.events.some(e => e.id === 'soon')).toBe(true); expect(report.tasks.some(t => t.id === 'local-task')).toBe(true);
    x.service.updateConnection({ deviceId: 'desktop', localEvents: [], localTasks: [] });
    report = await x.service.collect(now);
    expect(report.events.some(e => e.id === 'soon')).toBe(false); expect(report.tasks.some(t => t.id === 'local-task')).toBe(false);
  });
  it('옛 저장본은 같은 원본을 가진 기기 첫 동기화에 이관, 중복 원본 제외', async () => {
    const x = setup();
    fs.writeFileSync(path.join(x.root, 'runtime/personal-notifications-connection.json'), JSON.stringify({ refreshToken: 'fixture-refresh-token', localEvents: [fixture().events[2]], localTasks: [], localUpdatedAt: new Date(now).toISOString(), localThrough: '2026-12-01' }));
    const migrated = new PersonalNotifications(x.root, x.send, path.join(x.root, 'runtime'), x.request as typeof fetch);
    migrated.updateConnection({ deviceId: 'desktop', localEvents: [fixture().events[2]], localTasks: [], localUpdatedAt: new Date(now).toISOString(), localThrough: '2026-12-01' });
    const saved = JSON.parse(fs.readFileSync(path.join(x.root, 'runtime/personal-notifications-connection.json'), 'utf8'));
    expect(Object.keys(saved.snapshots)).toEqual(['desktop']); expect(saved.localEvents).toBeUndefined();
    expect((await migrated.collect(now)).events.filter(e => e.id === 'soon')).toHaveLength(1);
  });
});
