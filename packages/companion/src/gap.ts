import type { Today } from './dash-today';
import { whichSlot } from './room';

/**
 * 틈 알림. 게임이나 영상이 끝난 직후, 컴퓨터를 켠 직후에 오늘 할 일을 한 줄로
 *
 * 몰입 중 침묵, 끝난 뒤에만. 하루 횟수 상한, 같은 항목 반복 금지
 * 설계: memo `projects/dash/reference/companion-dash-20261101.md` 2단계
 */

export interface FrontSample {
  title: string;
  exe: string;
  /** 앞 창이 모니터 전체를 덮음. 전체 화면 게임과 영상 */
  full: boolean;
}

export interface GapOptions {
  /** 이만큼 몰입해야 끝났을 때 틈으로 봄 */
  busyAtLeastMs?: number;
  /** 몰입이 끝나고 이만큼 다른 창이어야 틈. 영상 사이 잠깐 전환 무시 */
  settleMs?: number;
  /** 하루 최대 알림 수 */
  perDay?: number;
  /** 알림 사이 최소 간격 */
  spacingMs?: number;
  now?: () => number;
}

export type GapKind = '켬' | '끝남';

/** 몰입 판정. 영상, 게임, 통화, 그리고 제목과 무관한 전체 화면 */
export function isBusy(front: FrontSample | null): boolean {
  if (front === null) return false;
  if (front.full && front.exe !== 'explorer') return true;
  const slot = whichSlot(front.title);
  return slot === '보는중' || slot === '노는중' || slot === '통화';
}

export class Gap {
  private busySince: number | null = null;
  private freeSince: number | null = null;
  private lastBusyMs = 0;
  private started = false;
  private day = '';
  private told = 0;
  private lastToldAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: GapOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /** 앞 창 하나를 먹임. 틈이면 그 종류, 아니면 null */
  feed(front: FrontSample | null): GapKind | null {
    const t = this.now();
    const today = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (today !== this.day) {
      this.day = today;
      this.told = 0;
    }
    const busy = isBusy(front);
    if (busy) {
      this.busySince ??= t;
      this.freeSince = null;
      this.started = true; // 켜자마자 게임이면 켬 알림 생략
      return null;
    }
    if (this.busySince !== null) {
      this.lastBusyMs = t - this.busySince;
      this.busySince = null;
    }
    this.freeSince ??= t;
    if (t - this.freeSince < (this.options.settleMs ?? 20_000)) return null;

    let kind: GapKind | null = null;
    if (!this.started) kind = '켬';
    else if (this.lastBusyMs >= (this.options.busyAtLeastMs ?? 3 * 60_000)) kind = '끝남';
    this.started = true;
    this.lastBusyMs = 0;
    if (kind === null) return null;
    if (this.told >= (this.options.perDay ?? 3)) return null;
    if (this.lastToldAt > 0 && t - this.lastToldAt < (this.options.spacingMs ?? 60 * 60_000)) return null;
    this.told += 1;
    this.lastToldAt = t;
    return kind;
  }
}

/**
 * 오늘 요약에서 할 말 한 줄. 이미 말한 항목은 뺌. 새 항목이 없으면 null (침묵)
 * 두뇌 없이 고정 문형. 안 본 값 지어내기 방지
 */
export function gapLine(today: Today, kind: GapKind, mentioned: Set<string>): { text: string; keys: string[] } | null {
  const keys: string[] = [];
  const parts: string[] = [];
  const freshTasks = today.tasks.filter((t) => !mentioned.has(`할일:${t.title}`));
  if (freshTasks.length > 0) {
    keys.push(...freshTasks.map((t) => `할일:${t.title}`));
    const first = freshTasks[0]!.title;
    parts.push(freshTasks.length === 1 ? `할 일 하나 남았어. ${first}` : `할 일 ${freshTasks.length}개 남았어. ${first} 외 ${freshTasks.length - 1}개`);
  }
  const next = today.events.find((e) => !mentioned.has(`일정:${e.when}:${e.title}`));
  if (next !== undefined) {
    keys.push(`일정:${next.when}:${next.title}`);
    parts.push(`다음 일정은 ${next.when} ${next.title}`);
  }
  if (parts.length === 0) return null;
  const opener = kind === '켬' ? '왔네.' : '한숨 돌렸어?';
  return { text: `${opener} ${parts.join('. ')}.`, keys };
}
