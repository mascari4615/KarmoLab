import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Today } from './dash-today';

/**
 * 하루 두 번 먼저 건네는 카드. 저녁 브리핑과 자기 전 한 줄
 *
 * 배경: 알림 칸은 "늘 떠 있어도 잘 안 누름" (2026-11-03). 사용자가 볼 수 있는 틈은 퇴근 뒤 PC 뿐
 * 두뇌 없이 고정 문형, 소리 없음. 하루에 종류별 한 번, 재시작에도 반복 없음
 * 설계: memo `projects/dash/reference/usage-redesign-20261121.md`
 */

export type RhythmKind = 'evening' | 'diary';
export interface RhythmState { evening?: string; diary?: string }
export interface RhythmOptions { eveningOn: boolean; diaryOn: boolean; eveningHour: number; diaryHour: number }

const KST = 'Asia/Seoul';
export const kstDay = (at: Date): string => at.toLocaleDateString('en-CA', { timeZone: KST });
const kstHour = (at: Date): number => Number(at.toLocaleTimeString('en-GB', { timeZone: KST, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

/**
 * 지금 건넬 카드. 자기 전 시각부터 자정까지는 한 줄 질문, 그 앞 저녁 시간은 브리핑
 * 저녁 시각이 자기 전 시각보다 늦게 설정되면 브리핑은 없음
 */
export function rhythmDue(state: RhythmState, now: Date, options: RhythmOptions): RhythmKind | null {
  const day = kstDay(now);
  const hour = kstHour(now);
  if (options.diaryOn && hour >= options.diaryHour && state.diary !== day) return 'diary';
  if (options.eveningOn && hour >= options.eveningHour && hour < options.diaryHour && state.evening !== day) return 'evening';
  return null;
}

/** 저녁 브리핑 한 장. 받은 값만 씀. 비어 있으면 비었다고 말함 */
export function eveningLine(today: Today): string {
  const parts: string[] = [];
  const first = today.events[0];
  if (first !== undefined) {
    const tomorrowOnly = today.events.every((e) => e.when?.startsWith('내일'));
    parts.push(tomorrowOnly ? `오늘 남은 일정 없음. 다음은 ${first.when ?? ''} ${first.title}`.replace(/ +/g, ' ') : `남은 일정 ${today.events.length}개. ${first.when ?? ''} ${first.title}`.replace(/\s+/g, ' '));
  } else {
    parts.push('오늘과 내일 일정 없음');
  }
  if (today.tasks.length > 0) parts.push(today.tasks.length === 1 ? `할 일 하나. ${today.tasks[0]!.title}` : `할 일 ${today.tasks.length}개. ${today.tasks[0]!.title} 외 ${today.tasks.length - 1}개`);
  else parts.push('할 일 없음');
  if (today.anime.length > 0) parts.push(`새 화 ${today.anime.slice(0, 2).join(', ')}${today.anime.length > 2 ? ` 외 ${today.anime.length - 2}개` : ''}`);
  return parts.join('\n');
}

export function loadRhythm(path: string): RhythmState {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RhythmState;
    return { evening: typeof raw.evening === 'string' ? raw.evening : undefined, diary: typeof raw.diary === 'string' ? raw.diary : undefined };
  } catch {
    return {};
  }
}

export function saveRhythm(path: string, state: RhythmState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state), 'utf8');
}

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type InvokeDash = (name: string, args: Record<string, unknown>) => Promise<any>;

/**
 * 한 줄을 Dash 일기에 덧붙임. 원본은 Dash 하나, 복사본 없음
 * 다른 기기가 사이에 쓰면 revision 이 어긋나므로 한 번 다시 읽고 재시도. 같은 requestId 라 두 번 붙지 않음
 */
export function dashDiaryWriter(memoDir: string | null, options: { now?: () => Date; invoke?: InvokeDash } = {}): (text: string, given?: { requestId?: string; date?: string }) => Promise<{ ok: true; date: string } | { ok: false; why: string }> {
  let invoke: InvokeDash | null = options.invoke ?? null;
  return async (raw, given = {}) => {
    const text = raw.trim();
    if (text === '') return { ok: false, why: '빈 글' };
    if (text.length > 2000) return { ok: false, why: '2000자까지' };
    if (memoDir === null && invoke === null) return { ok: false, why: 'memo 저장소를 이웃에서 못 찾음' };
    const now = (options.now ?? (() => new Date()))();
    // 카드를 건넨 날의 일기에. 자정을 넘겨 저장해도 어제 카드면 어제 일기. 그보다 오래된 날짜는 안 받음
    const date = given.date !== undefined && [kstDay(now), kstDay(new Date(now.getTime() - 86_400_000))].includes(given.date) ? given.date : kstDay(now);
    // 창이 준 번호를 쓰면 응답만 실패한 저장을 다시 눌러도 두 번 붙지 않음
    const requestId = given.requestId !== undefined && UUID_V4.test(given.requestId) ? given.requestId : randomUUID();
    try {
      invoke ??= (await import(pathToFileURL(join(memoDir as string, 'scripts', 'lib', 'dash-agent.mjs')).href)).invokeDash as InvokeDash;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const snap = await invoke('dash_read', { resource: 'planner', collection: 'diary', from: date, through: date });
        try {
          const done = await invoke('dash_planner_change', { collection: 'diary', key: date, action: 'append', patch: { text }, revision: snap.revision, requestId, apply: true });
          if (done?.applied === true) return { ok: true, date };
          return { ok: false, why: '저장 확인 못 함' };
        } catch (e) {
          if (attempt === 0 && (e as { code?: string })?.code === 'revision_conflict') continue;
          throw e;
        }
      }
      return { ok: false, why: '다른 기기와 겹침' };
    } catch (e) {
      return { ok: false, why: (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e)) };
    }
  };
}
