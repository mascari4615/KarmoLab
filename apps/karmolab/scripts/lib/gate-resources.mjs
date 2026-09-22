import { readFileSync } from 'node:fs';

export function usesBrowserEntry(entry) {
  try {
    // 자식 실행기의 내용은 여기서 확정할 수 없으므로 브라우저 자리를 예약
    return /playwright|lib\/browser|child_process/.test(readFileSync(entry, 'utf8'));
  } catch {
    return true;
  }
}
