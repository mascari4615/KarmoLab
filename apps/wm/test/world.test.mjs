import test from 'node:test';
import assert from 'node:assert/strict';
import { places, spherePoint, sphereUV } from '../src/world.mjs';
import { sourceCoasts } from '../src/source-coasts.mjs';
test('sphere projection round trips all places, including western and eastern longitudes', () => {
  for (const place of places) {
    const [x, y] = sphereUV(spherePoint(place.x, place.y));
    assert.ok(Math.abs(x - place.x) < 1e-10, place.id);
    assert.ok(Math.abs(y - place.y) < 1e-10, place.id);
  }
});
test('each location has a unique address, valid coordinates and source status', () => {
  assert.equal(new Set(places.map(p => p.id)).size, places.length);
  for (const place of places) { assert.ok(place.x > 0 && place.x < 1 && place.y > 0 && place.y < 1); assert.ok(place.source.length > 8); }
});
test('손그림에서 옮긴 실제 런타임 해안15개와 좌표 범위 보존', () => {
  assert.equal(sourceCoasts.length,15);
  for (const ring of sourceCoasts) assert.ok(ring.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
});
