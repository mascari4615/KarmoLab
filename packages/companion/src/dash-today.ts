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

export interface Today {
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

interface AgendaEvent { title?: string; start?: string; end?: string; allDay?: boolean }
interface AgendaTask { title?: string; status?: string }
interface AgendaAnime { title?: string; publishedAt?: string }
interface Agenda { events?: AgendaEvent[]; tasks?: AgendaTask[]; anime?: AgendaAnime[]; errors?: string[] }

const KST = 'Asia/Seoul';
const dayOf = (at: Date): string => at.toLocaleDateString('en-CA', { timeZone: KST });
const clockOf = (at: Date): string => at.toLocaleTimeString('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit' });

/** 순수 함수. 받은 원본과 지금 시각만으로 정한다. */
export function summarizeToday(agenda: Agenda | null, aiDue: number, now: Date, warnings: string[] = []): Today {
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000));
  const upcoming: { at: number; item: TodayItem }[] = [];
  for (const e of agenda?.events ?? []) {
    if (!e.title || !e.start) continue;
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
    if (day === today) upcoming.push({ at: start.getTime(), item: { title: e.title, when: clockOf(start) } });
    else if (day === tomorrow) upcoming.push({ at: start.getTime(), item: { title: e.title, when: `내일 ${clockOf(start)}` } });
  }
  upcoming.sort((a, b) => a.at - b.at);
  const todayOnly = upcoming.filter((u) => !u.item.when?.startsWith('내일'));
  // 오늘 남은 일정 0이면 내일 첫 일정 하나. 밤의 빈 판 방지
  const events = (todayOnly.length > 0 ? todayOnly : upcoming.slice(0, 1)).slice(0, 3).map((u) => u.item);

  const tasks = (agenda?.tasks ?? [])
    .filter((t) => t.status === 'needsAction' && (t.title ?? '').trim() !== '')
    .map((t) => ({ title: (t.title ?? '').trim() }));

  const anime = (agenda?.anime ?? [])
    .filter((a) => a.title && a.publishedAt && now.getTime() - new Date(a.publishedAt).getTime() < 86_400_000)
    .map((a) => a.title as string);

  return {
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

  async function read(): Promise<Today | null> {
    if (memoDir === null) return null;
    invoke ??= (await import(pathToFileURL(join(memoDir, 'scripts', 'lib', 'dash-agent.mjs')).href)).invokeDash as InvokeDash;
    const now = clock();
    const warnings: string[] = [];
    const [agenda, followups] = await Promise.all([
      invoke('dash_read', { resource: 'agenda' }).catch((e: Error) => { warnings.push(`일정 못 읽음: ${e.message}`); return null; }),
      invoke('dash_read', { resource: 'followups', status: 'open', through: dayOf(now) }).catch((e: Error) => { warnings.push(`후속 일정 못 읽음: ${e.message}`); return null; }),
    ]);
    return summarizeToday(agenda?.data ?? null, Array.isArray(followups?.items) ? followups.items.length : 0, now, warnings);
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
