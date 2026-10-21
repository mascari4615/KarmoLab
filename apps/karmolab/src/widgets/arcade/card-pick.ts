import { Vector2, Vector3, Raycaster, type Camera, type Mesh } from '/packages/3d/vendor/three.module.min.js';

export interface PickRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SAMPLES = [[.5, .5], [.12, .12], [.12, .5], [.12, .88], [.5, .12], [.5, .88], [.88, .12], [.88, .5], [.88, .88]];

/** 다른 카드에 가리지 않은 실제 클릭 지점. 완전히 가려졌으면 없음 */
export function cardPickPoint(mesh: Mesh, cards: Mesh[], camera: Camera, rect: PickRect): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  for (const card of cards) card.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return null;
  const ray = new Raycaster();
  const ndc = new Vector2();
  const point = new Vector3();
  for (const [u, v] of SAMPLES) {
    point.set(bounds.min.x + (bounds.max.x - bounds.min.x) * u, bounds.max.y,
      bounds.min.z + (bounds.max.z - bounds.min.z) * v).applyMatrix4(mesh.matrixWorld).project(camera);
    if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) continue;
    const x = Math.round(rect.left + (point.x + 1) * rect.width / 2);
    const y = Math.round(rect.top + (1 - point.y) * rect.height / 2);
    ndc.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObjects(cards, false)[0]?.object === mesh) return { x, y };
  }
  return null;
}
