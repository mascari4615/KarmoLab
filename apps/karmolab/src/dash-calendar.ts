/**
 * dash 플래너 달력 번들 (FullCalendar). 플래너 방을 열 때만 `planner/calendar-loader.ts` 가 부름
 * 진입 `dash-app.ts` 에 넣지 않는 이유는 그 파일 머리말 참고
 */
import { buildCalendarView } from './widgets/planner/calendar-view';

(window as unknown as Record<string, unknown>).KarmoDashCalendar = { buildCalendarView };

export {};
