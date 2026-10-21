import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const games = ['airhockey', 'bowling', 'capturego', 'capturego3d', 'darts', 'derby', 'fishing', 'highlow', 'lanterns', 'lineup', 'mancala', 'minesweeper', 'nunchi', 'onestroke', 'pong', 'pool', 'reaction', 'rps', 'shell', 'simon', 'sudoku', 'tanks', 'tuho', 'whack', 'wordchain', 'yut'];
const imports = games.map((id, n) => `import * as view${n} from ${JSON.stringify(root + 'src/widgets/arcade/games/' + (id === 'capturego3d' ? 'capturego-view3d.ts' : id + '-view.ts'))};`).join('\n');
const bundle = await build({ stdin: { resolveDir: root, contents: `${imports}
  import {Match} from ${JSON.stringify(root + 'src/widgets/arcade/kernel.ts')};
  import {gameById} from ${JSON.stringify(root + 'src/widgets/arcade/index.ts')};
  window.nameViews = [${games.map((id, n) => `{id:${JSON.stringify(id)},view:Object.values(view${n}).find(value=>value && typeof value.mount==='function')}`).join(',')}];
  window.makeNameView = (id,name) => { const game=gameById(id); const match=new Match(game,12345,[{name,bot:false},{name,bot:false}]);const view=match.view();return {...view,state:game.redact?game.redact(view.state,0):view.state}; };
` }, bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [{ name: 'no-webgl', setup(context) {
  context.onLoad({ filter: /[\\/]arcade[\\/]three-board\.ts$/ }, () => ({ contents: 'export const mountThreeBoard=()=>({ok:false});', loader: 'js' }));
} }] });
const translations = JSON.parse(await readFile(new URL('../i18n/ko/arcade.json', import.meta.url), 'utf8'));
const name = '이름 <img data-name-fixture="yes" src="fixture-only"> &lt; "한글"';

for (const id of games) test(`${id} displays a player name as literal text`, t => {
  const dom = new JSDOM('<html lang="ko"><main id="view"></main><div id="acSeats"></div></html>', { url: 'http://localhost/name-fixture', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { arcade: translations } };
  window.Toolbox = {};
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.fetch = async () => ({ ok: false, status: 503 });
  window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({ canvas: this, measureText: () => ({ width: 100 }) }, {
      get(target, key) {
        if (key in target) return target[key];
        if (String(key).startsWith('create')) return () => ({ addColorStop() {} });
        return () => {};
      }
    });
  };
  window.eval(bundle.outputFiles[0].text);
  const definition = window.nameViews.find(view => view.id === id).view;
  const host = window.document.getElementById('view');
  const draw = definition.mount(host, () => {});
  const view = window.makeNameView(definition.id, name);
  if (id === 'lineup') view.state.phase = 'order';
  draw(view, 0, 0);
  assert.equal(host.querySelector('[data-name-fixture]'), null);
  assert.ok(host.textContent.includes(name), 'The name must remain visible and retain literal entities');
  if (id === 'nunchi') {
    view.state.log = [{ n: 1, seats: [0, 1], clash: true }];
    draw(view, 0, 0);
    assert.equal(host.querySelector('[data-name-fixture]'), null, 'Call history must also preserve literal player names');
  }
  if (id === 'lineup') {
    host.querySelector('.ac-lup').click();
    draw(view, 0, 0);
    assert.equal(host.querySelector('[data-name-fixture]'), null);
    view.state.phase = 'reveal';
    view.state.picks = [20, 80];
    draw(view, 0, 0);
    assert.equal(host.querySelector('[data-name-fixture]'), null);
    assert.ok(host.textContent.includes(name));
  }
});
