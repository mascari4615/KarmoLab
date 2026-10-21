const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 본문과 따옴표 속성에 넣는 일반 텍스트 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ENTITIES[char]);
}
