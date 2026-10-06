/**
 * 달력 (FullCalendar) 은 따로 묶은 번들 `dash-calendar.js`. 플래너 방을 열 때 한 번 받음
 *
 * 왜: FullCalendar 와 플러그인이 압축 전 약 240KB. dash 번들 하나에 있으면 로그인 문과 홈부터 받음
 * (2026-10-07 실측 dash-app 577KB, gzip 171KB). 쓰는 곳은 플래너 달력 하나
 *
 * 만나는 곳은 전역 `KarmoDashCalendar` (IIFE 번들끼리 모듈을 못 나눔, kit.ts 의 명부와 같은 이유)
 * 주소는 글자 그대로 둠. 배포 가르기 (`site-closure.mjs`) 가 글자로 드러난 주소만 dash 배포에 담음
 */
import type { buildCalendarView } from './calendar-view';

export type BuildCalendarView = typeof buildCalendarView;

const CALENDAR_SCRIPT = '/apps/karmolab/js/dash-calendar.js';
const GLOBAL_KEY = 'KarmoDashCalendar';

let loading: Promise<BuildCalendarView> | null = null;

function found(): BuildCalendarView | null {
    const g = (window as unknown as Record<string, { buildCalendarView?: BuildCalendarView } | undefined>)[GLOBAL_KEY];
    return g && typeof g.buildCalendarView === 'function' ? g.buildCalendarView : null;
}

/** 달력 만드는 함수. 처음 한 번만 받음. 실패하면 다음 부름에서 다시 받음 */
export function loadCalendarView(): Promise<BuildCalendarView> {
    const ready = found();
    if (ready) return Promise.resolve(ready);
    if (loading) return loading;
    loading = new Promise<BuildCalendarView>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CALENDAR_SCRIPT + '?v=' + encodeURIComponent(__KARMOLAB_BUILD__);
        s.async = true;
        s.onload = (): void => {
            const fn = found();
            if (fn) resolve(fn);
            else reject(new Error('달력 번들에 buildCalendarView 없음'));
        };
        s.onerror = (): void => reject(new Error('달력 번들을 못 받음'));
        document.head.appendChild(s);
    }).catch((e: unknown) => {
        loading = null;
        throw e;
    });
    return loading;
}
