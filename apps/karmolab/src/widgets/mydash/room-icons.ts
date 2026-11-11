/**
 * 방마다 아이콘 하나. 홈 칸과 ESC 메뉴 칸이 같은 표를 쓴다 (`img/shell/menu/<이름>.png`).
 * 2026-11-11 R3 재설계에서 홈과 메뉴가 같은 방에 다른 그림을 쓰지 않도록 한 곳으로 모음
 */
export const ROOM_ICON_BASE = '/apps/karmolab/img/shell/menu/';

export const ROOM_ICONS: Record<string, string> = {
  today: 'home',
  daily: 'memo',
  planner: 'cal',
  career: 'me',
  goals: 'star',
  bookmarks: 'book',
  'kakao-daily': 'talk',
  'discord-channels': 'talk',
  discovery: 'find',
  machines: 'dash',
  ai: 'stat',
  automations: 'tool',
  byeoru: 'judge',
  'user-presence': 'me',
  appearance: 'set',
};

export function roomIcon(id: string): string {
  return ROOM_ICONS[id] || 'dash';
}
