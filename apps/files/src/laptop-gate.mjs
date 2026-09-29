/**
 * 내 PC 거절 응답 -> 입력창 문구
 *
 * - laptop-ops: 비밀번호 5회 초과 실패 IP 에 429 + Retry-After, 막힌 동안 맞는 비밀번호도 429
 * - 2026-09-29 실측: 429 가 "내 PC에 연결할 수 없습니다, list 429" 로 표시, 틀린 저장값 잔류
 * - 401, 403, 429 공통 처리: 저장 비밀번호 삭제, 입력창
 *
 * @param {number} status
 * @param {string | null | undefined} retryAfter Retry-After 머리 (초)
 * @returns {null | { message: string }} null 이면 거절 아님
 */
export function laptopGateFor(status, retryAfter) {
  if (status === 401 || status === 403) {
    return { message: '비밀번호가 틀렸거나 만료되었습니다.' };
  }
  if (status === 429) {
    const sec = Math.ceil(Number(retryAfter));
    const wait = Number.isFinite(sec) && sec > 0 ? sec + '초 뒤에' : '잠시 뒤에';
    return { message: '비밀번호를 여러 번 틀려 잠시 막혔습니다. ' + wait + ' 다시 입력하세요.' };
  }
  return null;
}
