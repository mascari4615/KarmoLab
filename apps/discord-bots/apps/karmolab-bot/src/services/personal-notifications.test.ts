import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersonalNotifications, agendaSelection, dueReminders, kstDate, summaryText, type AgendaReport } from './personal-notifications';

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
    expect(fs.existsSync(path.join(x.root, 'runtime/personal-notifications-state.json'))).toBe(false);
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
