import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Dash 원본의 오늘 할 일과 일정 요약. 몸 옆 숫자와 오늘 판의 재료
 *
 * 배경: 사용자가 Dash 웹을 안 염 (2026-11-01, 열 계기 없음). 곁의 몸이 대신 표시
 * 할 일 복사본 없음. 읽기 전용, 원본은 Dash 하나
 * 설계: memo `projects/dash/reference/companion-dash-20261101.md`
 */

export interface TodayItem {
  title: string;
  /** 일정이면 `HH:mm` 또는 `종일`, 내일이면 앞에 `내일`. 할 일이면 없음. */
  when?: string;
}

/** 알림 판 한 줄. 상태 칩은 창이 startAt, endAt 으로 지금 시각에 맞춰 다시 계산 */
export interface NotifyItem {
  id: string;
  kind: '일정' | '할 일' | '새 소식' | 'AI';
  title: string;
  sub: string;
  /** 기본 상태 글자. 일정은 창이 시각으로 덮어씀 */
  label: string;
  tone: '' | 'now' | 'new' | 'late';
  startAt?: string;
  endAt?: string;
  /** 보기 버튼이 여는 주소. 서버가 정한 것만 */
  url?: string;
}

export interface Today {
  /** 알림 판 줄. 종류별 칸 숫자는 이 목록에서 읽음 제외 */
  items: NotifyItem[];
  /** 머리 위 숫자. 남은 할 일 수. 0 이면 숫자를 안 띄운다. */
  badge: number;
  events: TodayItem[];
  tasks: TodayItem[];
  /** 최근 하루 사이 새 화가 나온 애니 제목. */
  anime: string[];
  /** 기한이 된 AI 후속 일정 수. 사람 할 일이 아니라 숫자만. */
  aiDue: number;
  /** 원본이 낡았거나 못 읽은 사정. 숨기지 않고 그대로 띄운다. */
  warnings: string[];
  fetchedAt: string;
}

interface AgendaEvent { id?: string; title?: string; start?: string; end?: string; allDay?: boolean; source?: string }

/**
 * 알림에서 뺄 일정. 사용자 결정 2026-11-02 "둘 다 빼"
 * 달의 위상 캘린더, Dash 반복 일정의 회차 (id 끝이 `::날짜` 또는 `::날짜::link:N`, 출근, 회사, 퇴근 등)
 */
export function skipEvent(e: AgendaEvent): boolean {
  if (e.source === '달의 위상') return true;
  return /::\d{4}-\d{1,2}-\d{1,2}(::|$)/.test(e.id ?? '');
}
interface AgendaTask { id?: string; title?: string; status?: string }
interface AgendaAnime { id?: number | string; title?: string; publishedAt?: string; url?: string }
interface Agenda { events?: AgendaEvent[]; tasks?: AgendaTask[]; anime?: AgendaAnime[]; errors?: string[] }

const KST = 'Asia/Seoul';
const dayOf = (at: Date): string => at.toLocaleDateString('en-CA', { timeZone: KST });
const clockOf = (at: Date): string => at.toLocaleTimeString('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit' });

/** 순수 함수. 받은 원본과 지금 시각만으로 정한다. */
export function summarizeToday(agenda: Agenda | null, aiDue: number, now: Date, warnings: string[] = []): Today {
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000));
  const upcoming: { at: number; item: TodayItem; start?: string; end?: string }[] = [];
  for (const e of agenda?.events ?? []) {
    if (!e.title || !e.start || skipEvent(e)) continue;
    if (e.allDay === true) {
      const day = e.start.slice(0, 10);
      if (day === today) upcoming.push({ at: 0, item: { title: e.title, when: '종일' } });
      else if (day === tomorrow) upcoming.push({ at: 1e15, item: { title: e.title, when: '내일 종일' } });
      continue;
    }
    const start = new Date(e.start);
    const end = new Date(e.end ?? e.start);
    if (Number.isNaN(start.getTime()) || end.getTime() <= now.getTime()) continue;
    const day = dayOf(start);
    const span = { start: start.toISOString(), end: end.toISOString() };
    if (day === today) upcoming.push({ at: start.getTime(), item: { title: e.title, when: clockOf(start) }, ...span });
    else if (day === tomorrow) upcoming.push({ at: start.getTime(), item: { title: e.title, when: `내일 ${clockOf(start)}` }, ...span });
  }
  upcoming.sort((a, b) => a.at - b.at);
  const todayOnly = upcoming.filter((u) => !u.item.when?.startsWith('내일'));
  // 오늘 남은 일정 0이면 내일 첫 일정 하나. 밤의 빈 판 방지
  const shown = (todayOnly.length > 0 ? todayOnly : upcoming.slice(0, 1)).slice(0, 5);
  const events = shown.slice(0, 3).map((u) => u.item);

  const openTasks = (agenda?.tasks ?? []).filter((t) => t.status === 'needsAction' && (t.title ?? '').trim() !== '');
  const tasks = openTasks.map((t) => ({ title: (t.title ?? '').trim() }));

  const freshAnime = (agenda?.anime ?? [])
    .filter((a) => a.title && a.publishedAt && now.getTime() - new Date(a.publishedAt).getTime() < 86_400_000);
  const anime = freshAnime.map((a) => a.title as string);

  const items: NotifyItem[] = [
    ...shown.map((u): NotifyItem => ({
      id: `일정:${u.start ?? u.item.when}:${u.item.title}`,
      kind: '일정',
      title: u.item.title,
      sub: u.item.when ?? '',
      label: u.item.when?.startsWith('내일') ? '내일' : '오늘',
      tone: '',
      startAt: u.start,
      endAt: u.end,
    })),
    ...openTasks.map((t): NotifyItem => ({
      id: `할일:${t.id ?? t.title}`,
      kind: '할 일',
      title: (t.title ?? '').trim(),
      sub: 'Dash 할 일',
      label: '남음',
      tone: '',
    })),
    ...freshAnime.map((a): NotifyItem => ({
      id: `새화:${a.id ?? a.title}:${a.publishedAt}`,
      kind: '새 소식',
      title: a.title as string,
      sub: `새 화 ${clockOf(new Date(a.publishedAt as string))}`,
      label: '새 화',
      tone: 'new',
      url: a.url || (a.id !== undefined ? `https://laftel.net/item/${encodeURIComponent(String(a.id))}` : undefined),
    })),
    ...(aiDue > 0 ? [{ id: `AI:${today}`, kind: 'AI' as const, title: `AI 후속 일정 ${aiDue}개`, sub: '기한 지남', label: '지남', tone: 'late' as const }] : []),
  ];

  return {
    items,
    badge: tasks.length,
    events,
    tasks,
    anime,
    aiDue,
    warnings: [...warnings, ...(agenda?.errors ?? [])],
    fetchedAt: now.toISOString(),
  };
}

type InvokeDash = (name: string, args: Record<string, unknown>) => Promise<any>;

/**
 * memo 저장소의 Dash 공용 호출 경로. 5분 보관 (일정 읽기 약 3초)
 * memo 없음이면 `null`. 알림은 부르는 쪽 몫
 */
export function dashTodaySource(memoDir: string | null, options: { ttlMs?: number; now?: () => Date } = {}): () => Promise<Today | null> {
  const ttl = options.ttlMs ?? 5 * 60_000;
  const clock = options.now ?? (() => new Date());
  let cached: { at: number; value: Today } | null = null;
  let inflight: Promise<Today | null> | null = null;
  let invoke: InvokeDash | null = null;
  let lastAgenda: { at: Date; data: Agenda } | null = null;
  let lastAiDue = 0;

  async function read(): Promise<Today | null> {
    if (memoDir === null) return null;
    invoke ??= (await import(pathToFileURL(join(memoDir, 'scripts', 'lib', 'dash-agent.mjs')).href)).invokeDash as InvokeDash;
    const now = clock();
    const warnings: string[] = [];
    const [agenda, followups] = await Promise.all([
      invoke('dash_read', { resource: 'agenda' }).catch((e: Error) => { warnings.push(`일정 못 읽음: ${e.message}`); return null; }),
      invoke('dash_read', { resource: 'followups', status: 'open', through: dayOf(now) }).catch((e: Error) => { warnings.push(`후속 일정 못 읽음: ${e.message}`); return null; }),
    ]);
    // 통신이 잠깐 끊겨도 판이 비지 않게 마지막으로 받은 값을 씀. 언제 값인지 경고에 적음
    if (agenda?.data) lastAgenda = { at: now, data: agenda.data };
    else if (lastAgenda !== null) warnings.push(`${clockOf(lastAgenda.at)} 에 받은 일정으로 표시`);
    if (Array.isArray(followups?.items)) lastAiDue = followups.items.length;
    return summarizeToday(agenda?.data ?? lastAgenda?.data ?? null, lastAiDue, now, warnings);
  }

  return async () => {
    if (cached !== null && clock().getTime() - cached.at < ttl) return cached.value;
    inflight ??= read().then((value) => {
      if (value !== null) cached = { at: clock().getTime(), value };
      return value;
    }).finally(() => { inflight = null; });
    return inflight;
  };
}
