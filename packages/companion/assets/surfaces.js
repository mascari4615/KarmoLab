// 창 목록에서 몸이 서고 오를 수 있는 윗면을 계산하는 순수 함수 모음. 화면과 무관, 단독 시험 가능
// 좌표는 모두 페이지 CSS 픽셀(위쪽이 작은 값). 창 순서는 앞쪽(위쪽) 창이 먼저

/** 구간 [l, r] 에서 [cutL, cutR] 를 뺀 나머지 구간들 */
function subtract(intervals, cutL, cutR) {
  const out = [];
  for (const [l, r] of intervals) {
    if (cutR <= l || cutL >= r) {
      out.push([l, r]);
      continue;
    }
    if (cutL > l) out.push([l, cutL]);
    if (cutR < r) out.push([cutR, r]);
  }
  return out;
}

/**
 * 몸이 설 수 있는 창 윗면 토막.
 *
 * 윗면은 위에 다른 창이 덮은 곳에서는 안 보이므로 덮인 부분을 뺀다. 덮는다는 것은
 * 덮는 조건: 앞쪽 창의 세로 범위가 이 윗면의 높이(y)를 지남
 *
 * @param windows `{ id, left, top, right, bottom }`, 앞쪽 창이 먼저
 * @param options.minTop 이보다 위에 있는 윗면은 버린다 (서면 머리가 화면 밖으로 나감)
 * @param options.maxBottom 이 높이 이하(바닥 근처) 윗면 제외
 * @param options.minWidth 이보다 좁은 토막 제외
 * @returns `{ id, y, l, r }` 목록
 */
export function standableSurfaces(windows, { minTop = 0, maxBottom = Infinity, minWidth = 120 } = {}) {
  const surfaces = [];
  for (let i = 0; i < windows.length; i += 1) {
    const w = windows[i];
    const y = w.top;
    if (y < minTop || y >= maxBottom) continue;
    let pieces = [[w.left, w.right]];
    for (let j = 0; j < i; j += 1) {
      const above = windows[j];
      if (above.top <= y && above.bottom > y) pieces = subtract(pieces, above.left, above.right);
      if (pieces.length === 0) break;
    }
    for (const [l, r] of pieces) {
      if (r - l >= minWidth) surfaces.push({ id: w.id, y, l, r });
    }
  }
  return surfaces;
}

const contains = (surface, x, overhang) => x >= surface.l - overhang && x <= surface.r + overhang;

/**
 * 발 밑 받침면. 발보다 아래(또는 `tolerance` 만큼 위까지)에 있는 면 중 가장 높은 것
 * 바닥은 어디에나 있음
 *
 * @param floorY 바닥의 높이
 * @param x 몸 가운데 x
 * @param feetY 발 높이
 * @param options.overhang 몸 가운데가 면 가장자리를 이만큼 벗어나도 선 것으로 침
 */
export function supportAt(surfaces, floorY, x, feetY, { tolerance = 24, overhang = 30 } = {}) {
  let best = { id: 'floor', y: floorY, l: -Infinity, r: Infinity };
  for (const s of surfaces) {
    if (s.y < feetY - tolerance || s.y >= best.y) continue;
    if (contains(s, x, overhang)) best = s;
  }
  return best;
}

/**
 * 하강 중 발이 이번 프레임에 통과한 면 중 가장 높은 것. 없으면 null
 * 상승 중에는 호출 안 함 (창 윗면을 아래에서 통과)
 */
export function landingSurface(surfaces, floorY, x, prevFeetY, newFeetY, { overhang = 30 } = {}) {
  let best = null;
  const all = [...surfaces, { id: 'floor', y: floorY, l: -Infinity, r: Infinity }];
  for (const s of all) {
    if (prevFeetY > s.y + 1 || newFeetY < s.y) continue;
    if (!contains(s, x, overhang)) continue;
    if (best === null || s.y < best.y) best = s;
  }
  return best;
}

/**
 * 지금 자리에서 뛰어 오를 수 있는 윗면 후보. 발보다 `minRise` 이상 높고 `maxRise` 이내이며
 * 가까운 면. 내려설 곳은 면 안쪽 `inset` 지점.
 */
export function jumpTargets(surfaces, x, feetY, currentId, { minRise = 40, maxRise = 480, maxRun = 520, minWidth = 160, inset = 60 } = {}) {
  const out = [];
  for (const s of surfaces) {
    if (s.id === currentId) continue;
    const rise = feetY - s.y;
    if (rise < minRise || rise > maxRise || s.r - s.l < minWidth) continue;
    const landX = Math.min(s.r - inset, Math.max(s.l + inset, x));
    if (Math.abs(landX - x) > maxRun) continue;
    out.push({ surface: s, landX, rise });
  }
  return out;
}

/**
 * 위로 뛰어 `rise` 높이의 면에 `run` 만큼 떨어진 곳에 내리는 초기 속도.
 * 정점을 면보다 `clear` 위로 잡아 면 모서리에 안 걸림
 *
 * @param gravity 중력 가속(px/s², 아래가 양수)
 * @returns `{ vx, vy, time }` (vy 는 위쪽이 음수)
 */
export function jumpVelocity(rise, run, gravity, clear = 80) {
  const apex = rise + clear;
  const vy = -Math.sqrt(2 * gravity * apex);
  const up = -vy / gravity;
  const down = Math.sqrt((2 * clear) / gravity);
  const time = up + down;
  return { vx: run / time, vy, time };
}
