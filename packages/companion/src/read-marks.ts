/**
 * 알림 줄 읽음 표시. 이 컴퓨터의 표시 상태, 원본은 Dash
 *
 * 원본에서 안 보이는 줄도 이틀은 남김. 일정 원본이 잠깐 비거나 일부 캘린더만 실패해도
 * 다시 보일 때 읽음이 그대로라 같은 카드가 또 안 뜸
 */

const KEEP_MS = 2 * 86_400_000;

export class ReadMarks {
  /** id 와 마지막으로 원본에서 본 시각 (ms) */
  private seen = new Map<string, number>();

  /** 저장 파일 값. 옛 형식 (id 배열) 도 받음 */
  constructor(saved: unknown, now: number) {
    if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') this.seen.set(id, now);
    if (saved !== null && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [id, at] of Object.entries(saved as Record<string, unknown>)) {
        if (typeof at === 'number' && Number.isFinite(at)) this.seen.set(id, at);
      }
    }
  }

  has(id: string): boolean { return this.seen.has(id); }

  set(id: string, read: boolean, now: number): void {
    if (read) this.seen.set(id, now); else this.seen.delete(id);
  }

  /** 지금 원본에 있는 줄은 시각 갱신, 이틀 넘게 안 보인 줄은 지움 */
  touch(alive: Set<string>, now: number): void {
    for (const [id, at] of [...this.seen]) {
      if (alive.has(id)) this.seen.set(id, now);
      else if (now - at > KEEP_MS) this.seen.delete(id);
    }
  }

  ids(): string[] { return [...this.seen.keys()]; }

  toJSON(): Record<string, number> { return Object.fromEntries(this.seen); }
}
