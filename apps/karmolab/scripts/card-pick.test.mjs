import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Mesh, BoxGeometry, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Group }
  from '../../../packages/3d/vendor/three.module.min.js';

const threeUrl = new URL('../../../packages/3d/vendor/three.module.min.js', import.meta.url).href;
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/widgets/arcade/card-pick.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'actual-three-vendor', setup(builder) {
    builder.onResolve({ filter: /^\/packages\/3d\/vendor\/three\.module\.min\.js$/ }, () => ({ path: threeUrl, external: true }));
  } }],
});
const { cardPickPoint } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const rect = { left: 179, top: 32, width: 1101, height: 688 };
const opening = JSON.parse(await readFile(new URL('./fixtures/president-opening.json', import.meta.url), 'utf8'));
const gameBundle = await build({
  stdin: { contents: "export { Match } from './src/widgets/arcade/kernel'; export { president, options } from './src/widgets/arcade/games/president'; export { seedFrom } from './src/widgets/arcade/rng';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const core = await import('data:text/javascript;base64,' + Buffer.from(gameBundle.outputFiles[0].text).toString('base64'));
const seats = count => Array.from({ length: count }, (_, i) => ({ name: 'fixture ' + i, bot: i !== 0 }));
test('president pointer smoke has an actionable opening for either party size', () => {
  const seed = core.seedFrom('president' + String(Date.parse(opening.time)));
  for (const count of [3, 4]) {
    const match = new core.Match(core.president, seed, seats(count));
    assert.equal(match.view().state.turn, 0, 'human opening: ' + count);
    assert.ok(core.options(match.view().state, 0).length > 0);
  }
});
test('a legitimate president turn can have no selectable card and require a pass', () => {
  const match = new core.Match(core.president, 12, seats(4));
  for (let now = 0; now <= 30000 && match.view().state.turn !== 0; now += 50) match.step(now);
  assert.equal(match.view().state.turn, 0);
  assert.equal(match.view().finished, false);
  assert.equal(core.options(match.view().state, 0).length, 0);
  const before = match.view().state.turn;
  match.dispatch(0, { kind: 'pass' });
  assert.notEqual(match.view().state.turn, before);
});
function fixture() {
  const camera = new OrthographicCamera(-2, 2, 2, -2, .1, 20);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const card = () => new Mesh(new BoxGeometry(1, .02, 1.4), new MeshBasicMaterial());
  const target = card();
  const blocker = card();
  blocker.position.set(.3, .04, 0);
  return { camera, target, blocker };
}
function firstHit(point, cards, camera) {
  for (const card of cards) card.updateWorldMatrix(true, false);
  const ndc = new Vector2((point.x - rect.left) / rect.width * 2 - 1, 1 - (point.y - rect.top) / rect.height * 2);
  const ray = new Raycaster();
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(cards, false)[0]?.object;
}

test('a returned point selects an uncovered card with actual Three raycasting', () => {
  const { camera, target } = fixture();
  const point = cardPickPoint(target, [target], camera, rect);
  assert.ok(point);
  assert.equal(firstHit(point, [target], camera), target);
});

test('a partly covered card uses an exposed point rather than its occluded center', () => {
  const { camera, target, blocker } = fixture();
  const point = cardPickPoint(target, [target, blocker], camera, rect);
  assert.ok(point);
  assert.equal(firstHit(point, [target, blocker], camera), target);
});

test('a completely covered card has no clickable point', () => {
  const { camera, target, blocker } = fixture();
  blocker.position.x = 0;
  assert.equal(cardPickPoint(target, [target, blocker], camera, rect), null);
});

test('parent transforms and canvas offsets still produce a real hit', () => {
  const { camera, target } = fixture();
  const group = new Group();
  group.position.set(.25, 0, -.2);
  group.rotation.y = .35;
  group.add(target);
  const point = cardPickPoint(target, [target], camera, rect);
  assert.ok(point);
  assert.equal(firstHit(point, [target], camera), target);
});

test('the perspective table camera hits the intended partially covered card', () => {
  const { target, blocker } = fixture();
  const camera = new PerspectiveCamera(35, rect.width / rect.height, .1, 20);
  camera.position.set(0, 4, 3);
  camera.lookAt(0, 0, 0);
  const point = cardPickPoint(target, [target, blocker], camera, rect);
  assert.ok(point);
  assert.equal(firstHit(point, [target, blocker], camera), target);
});
