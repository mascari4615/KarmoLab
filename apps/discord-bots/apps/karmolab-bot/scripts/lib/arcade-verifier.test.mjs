import { beforeAll, expect, test } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildArcadeVerifier, projectGameDefinitions, arcadeApp, verifierEntry } from './arcade-verifier.mjs';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch');
const repo = path.resolve(arcadeApp, '..', '..');
let projected, baseline, core, matches, emitted;
function loadCjs(result) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}
beforeAll(async () => {
  const options = { absWorkingDir: repo, bundle: true, write: false, platform: 'node', target: 'node20', format: 'cjs', logLevel: 'silent' };
  const reference = await build({ ...options, entryPoints: [verifierEntry] });
  baseline = loadCjs(reference);
  const actual = await buildArcadeVerifier({ write: false });
  projected = loadCjs(actual);
  emitted = Object.entries(Object.values(actual.metafile.outputs)[0].inputs).filter(([, item]) => item.bytesInOutput > 0).map(([file]) => path.relative(repo, path.resolve(file.replace(/^arcade-core:/, ''))).replaceAll('\\', '/'));
  core = loadCjs(await build({ ...options, entryPoints: [path.join(arcadeApp, 'src/widgets/arcade/index.ts')] }));
  const workflow = (await readFile(path.join(repo, '.github/workflows/deploy-discord-bots.yml'), 'utf8')).split(/\r?\n/);
  const start = workflow.findIndex(line => line === '    paths:');
  if (start < 0) throw new Error('Deploy push paths missing');
  const patterns = [];
  for (const line of workflow.slice(start + 1)) {
    if (line.trim() && !line.startsWith('      ')) break;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const value = line.match(/^      - '([^']+)'$/)?.[1];
    if (!value) throw new Error('Unsupported deploy path syntax: ' + line);
    patterns.push({ negative: value.startsWith('!'), match: picomatch(value.replace(/^!/, '')) });
  }
  matches = files => files.some(file => {
    let included = false;
    for (const pattern of patterns) if (pattern.match(file)) included = !pattern.negative;
    return included;
  });
}, 30000);

test('the server verifier emits no browser game views', () => {
  expect(emitted.filter(file => /-view(3d)?\.ts$/.test(file))).toEqual([]);
  expect(emitted.length).toBeGreaterThan(40);
});
test('catalog projection follows aliases and rejects ambiguous structures', () => {
  expect(projectGameDefinitions("import { first as game } from './games/a'; export const CATALOG = [{ def: game, view: browserView }];")).toContain('import { first as game }');
  for (const source of [
    'const CATALOG = buildCatalog();',
    'const CATALOG = [...extra];',
    'const CATALOG = [{ def: missing }];',
    "import { game } from './a'; const CATALOG = [{ def: game, ...extra }];",
  ]) expect(() => projectGameDefinitions(source)).toThrow();
});
test('every emitted verifier input still triggers a bot deployment', () => {
  expect(emitted.filter(file => !matches([file]))).toEqual([]);
});
test.each([
  [['apps/karmolab/src/widgets/arcade/games/minesweeper-view.ts'], false],
  [['apps/karmolab/src/widgets/arcade/games/capturego-view3d.ts'], false],
  [['apps/karmolab/src/widgets/arcade/arcade.css'], false],
  [['apps/karmolab/src/widgets/arcade/games/minesweeper.ts'], true],
  [['apps/karmolab/src/widgets/arcade/kernel.ts'], true],
  [['apps/karmolab/src/widgets/arcade/verify-entry.ts'], true],
  [['apps/karmolab/src/widgets/arcade/games/minesweeper-view.ts', 'apps/karmolab/src/widgets/arcade/games/minesweeper.ts'], true],
  [['apps/discord-bots/apps/karmolab-bot/src/main.ts'], true],
  [['packages/arcade/src/index.ts'], true],
  [['packages/ai/src/index.ts'], true],
  [['.github/workflows/deploy-discord-bots.yml'], true],
  [['apps/karmolab/src/widgets/planner/planner.ts'], false],
])('deploy paths classify %j as %s', (files, expected) => expect(matches(files)).toBe(expected));

test('every registered game preserves the previous partial-tape verdict', () => {
  expect(core.GAMES.length).toBeGreaterThan(40);
  for (const game of core.GAMES) {
    const tape = { game: game.id, seed: 12345, seats: [{ name: 'fixture', bot: false }], moves: [], end: 0 };
    expect(projected.verifyTape(tape), game.id).toEqual(baseline.verifyTape(tape));
  }
});
test.each(['nim', 'four', 'minesweeper', 'gomoku'])('completed %s tapes keep their score and ranking', id => {
  const seed = 12345;
  const seats = [{ name: 'fixture A', bot: true }, { name: 'fixture B', bot: true }];
  const match = new core.Match(core.gameById(id), seed, seats);
  for (let now = 0; now <= 200000 && !match.view().finished; now += 50) match.step(now);
  expect(match.view().finished).toBe(true);
  const tape = { game: id, seed, seats, opts: match.opts, moves: [...match.tape], end: match.clock() };
  const result = projected.verifyTape(tape);
  expect(result.ok).toBe(true);
  expect(result).toEqual(baseline.verifyTape(tape));
}, 30000);
test.each([null, {}, { game: 'nope', seed: 1, seats: [{}], moves: [] }, { game: 'gomoku', seed: 1, seats: [], moves: [] }])('malformed tape remains rejected: %j', tape => {
  expect(projected.verifyTape(tape).ok).toBe(false);
  expect(projected.verifyTape(tape)).toEqual(baseline.verifyTape(tape));
});
