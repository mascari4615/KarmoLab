/**
 * AI 후속 일정 (나중에 다시 볼 것). 원본은 private memo 의 `data/followups/followups.json` 하나 (SSOT)
 *
 * - 플래너: 그 파일을 'AI' 캘린더로 표시. 읽기 전용, 수정은 memo 에서
 * - 구글에 이름이 'AI' 인 캘린더가 있으면 원본대로 맞춤 (폰 알림용 복사본)
 *   원본에 없거나 끝난 (`status: done`) 항목은 구글에서도 삭제. 구글 쪽 손편집은 다음 맞춤에 덮어씀
 * - 짝 찾기: 구글 일정의 `extendedProperties.private.karmoFollowup` 에 원본 id
 * 정본: memo `projects/dash/apps/dash.md` 후속 일정 절
 */
import type { FcEvent, GoogleCalendar } from './gcal';

export const FOLLOWUPS_PATH = 'data/followups/followups.json';
/** 플래너 안에서만 쓰는 캘린더 id. 구글 캘린더가 아니다 */
export const AI_CALENDAR_ID = 'karmo-ai';
/** 구글 쪽 복사본 캘린더 이름. 사용자가 구글에서 한 번 만든다 (권한이 일정 쓰기뿐이라 앱이 못 만듦) */
export const AI_GOOGLE_NAME = 'AI';
export const AI_COLOR = '#7c5cff';

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const TAG = 'karmoFollowup';

export interface Followup {
  /** 짝 찾는 열쇠. 영소문자, 숫자, 붙임표 */
  id: string;
  /** `YYYY-MM-DD`. 하루 일정 */
  date: string;
  title: string;
  /** 어느 프로젝트 일인가 (wm, lab, blog, dash, seo, memo ...) */
  project?: string;
  /** memo 안 근거 문서 경로 */
  doc?: string;
  status?: 'open' | 'done';
}

export function openItems(items: Followup[]): Followup[] {
  return items.filter((f) => f && f.id && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.status !== 'done');
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const aiCalendar = (): GoogleCalendar => ({ id: AI_CALENDAR_ID, summary: AI_GOOGLE_NAME, backgroundColor: AI_COLOR });

/** 플래너 달력에 얹을 모양. 끌어 옮기기 없음 */
export function toAiEvents(items: Followup[]): Array<FcEvent & { editable: boolean }> {
  return openItems(items).map((f) => ({
    id: `ai:${f.id}`,
    title: f.project ? `[${f.project}] ${f.title}` : f.title,
    start: f.date,
    end: nextDay(f.date),
    allDay: true,
    backgroundColor: AI_COLOR,
    borderColor: AI_COLOR,
    editable: false,
    extendedProps: { calendarId: AI_CALENDAR_ID, calendarName: AI_GOOGLE_NAME, googleId: `ai:${f.id}`, htmlLink: '', doc: f.doc || '' } as FcEvent['extendedProps'],
  }));
}

interface TaggedEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

function payload(f: Followup): Record<string, unknown> {
  return {
    summary: f.project ? `[${f.project}] ${f.title}` : f.title,
    description: f.doc ? `memo: ${f.doc}` : '',
    start: { date: f.date },
    end: { date: nextDay(f.date) },
    extendedProperties: { private: { [TAG]: f.id } },
  };
}

/**
 * 구글 'AI' 캘린더를 원본에 맞춤. 반환값은 만든 수, 고친 수, 지운 수
 * 하나가 실패해도 나머지는 계속 (다음 열 때 재시도)
 */
export async function syncToGoogle(token: string, calendarId: string, items: Followup[]): Promise<{ made: number; fixed: number; gone: number }> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  /* privateExtendedProperty 필터는 `이름=값` 꼴만 받아 이름만으로는 못 거른다. 전부 받아 표식으로 가른다 */
  const res = await fetch(`${base}?maxResults=2500`, { headers });
  if (!res.ok) throw new Error(`followups list ${res.status}`);
  const data = (await res.json()) as { items?: TaggedEvent[] };
  const mine = new Map<string, TaggedEvent>();
  for (const ev of data.items || []) {
    const key = ev.extendedProperties?.private?.[TAG];
    if (key) mine.set(key, ev);
  }
  const want = new Map(openItems(items).map((f) => [f.id, f]));
  let made = 0;
  let fixed = 0;
  let gone = 0;
  for (const [id, f] of want) {
    const have = mine.get(id);
    const body = payload(f);
    try {
      if (!have) {
        const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
        if (r.ok) made += 1;
      } else if (have.summary !== body.summary || have.start?.date !== f.date || (have.description || '') !== body.description) {
        const r = await fetch(`${base}/${encodeURIComponent(have.id)}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        if (r.ok) fixed += 1;
      }
    } catch {
      /* 다음 맞춤에 다시 */
    }
  }
  for (const [id, ev] of mine) {
    if (want.has(id)) continue;
    try {
      const r = await fetch(`${base}/${encodeURIComponent(ev.id)}`, { method: 'DELETE', headers });
      if (r.ok || r.status === 410) gone += 1;
    } catch {
      /* 다음 맞춤에 다시 */
    }
  }
  return { made, fixed, gone };
}
