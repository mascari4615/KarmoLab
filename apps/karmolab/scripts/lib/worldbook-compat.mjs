/**
 * 도감 산출의 공개 호환 비교. 이전 커밋 산출 대비 사라진 종류, 문서, 필드
 *
 * 공개 주소 `?wb=<문서 id>` 와 종류 탭은 밖에서 링크됨. 조용히 사라지면 깨진 링크만 남음
 * - 종류 소멸: 실패 (탭이 통째로 사라짐). 의도면 환경 WORLDBOOK_ALLOW_DROP 값 1
 * - 문서 소멸, 필드 소멸: 경고 (이름 바꾸기와 정리는 흔함)
 * 정본 memo projects/karmolab/apps/wm-hub.md
 */

/** @returns {{ problems: string[], notes: string[] }} */
export function worldbookCompat(prev, next, { allowDrop = false } = {}) {
  const problems = [];
  const notes = [];
  if (!prev || !next) return { problems, notes };

  const kindsBefore = new Set((prev.kinds ?? []).map((k) => k.id));
  const kindsNow = new Set((next.kinds ?? []).map((k) => k.id));
  const goneKinds = [...kindsBefore].filter((k) => !kindsNow.has(k));
  if (goneKinds.length > 0) {
    const line = `사라진 종류 ${goneKinds.length}개: ${goneKinds.join(', ')}. 종류 탭과 그 링크가 없어짐`;
    if (allowDrop) notes.push(`${line} (WORLDBOOK_ALLOW_DROP 로 허용)`);
    else problems.push(`${line}. 의도면 WORLDBOOK_ALLOW_DROP 값 1 로 다시`);
  }

  const idsNow = new Set((next.docs ?? []).map((d) => d.id));
  const goneDocs = (prev.docs ?? []).map((d) => d.id).filter((id) => !idsNow.has(id));
  if (goneDocs.length > 0) {
    const shown = goneDocs.slice(0, 10).join(', ');
    notes.push(`사라진 문서 ${goneDocs.length}개 (?wb= 링크 깨짐): ${shown}${goneDocs.length > 10 ? ' 외' : ''}`);
  }

  const fieldsOf = (book) => new Set((book.docs ?? []).flatMap((d) => Object.keys(d)));
  const fieldsNow = fieldsOf(next);
  const goneFields = [...fieldsOf(prev)].filter((f) => !fieldsNow.has(f));
  if (goneFields.length > 0) notes.push(`모든 문서에서 사라진 필드: ${goneFields.join(', ')}`);

  return { problems, notes };
}
