/**
 * 같은 재질 조각을 하나로 모은 인덱스와 그룹
 *
 * 그룹마다 그리기 한 번. 욘 모델의 Cube005 는 재질 2개에 그룹 14개라 매 프레임 14번 그림.
 * 같은 재질 삼각형을 이어 붙이면 재질 수만큼만 그림. 같은 재질 안의 순서는 그대로.
 * 모을 것이 없으면 null
 */
export function groupsByMaterial(index, groups) {
  if (groups.length < 2) return null;
  const byMaterial = new Map();
  for (const g of groups) {
    const list = byMaterial.get(g.materialIndex) ?? [];
    list.push(g);
    byMaterial.set(g.materialIndex, list);
  }
  if (byMaterial.size === groups.length) return null;
  const out = new index.constructor(index.length);
  const merged = [];
  let at = 0;
  for (const [materialIndex, list] of byMaterial) {
    const start = at;
    for (const g of list) {
      const end = Math.min(g.start + g.count, index.length);
      out.set(index.subarray(g.start, end), at);
      at += end - g.start;
    }
    merged.push({ start, count: at - start, materialIndex });
  }
  return { index: out.slice(0, at), groups: merged };
}
