import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({ entryPoints: ['src/widgets/tools/loan.ts'], bundle: true, write: false, format: 'iife', logLevel: 'silent', plugins: [{
  name: 'loan-fixture-services', setup(plugin) {
    plugin.onResolve({ filter: /^\.\.\/\.\.\/lib\/(i18n|region|tool-url)$/ }, args => ({ path: args.path.split('/').pop(), namespace: 'fixture' }));
    plugin.onResolve({ filter: /^\.\/shared\/image$/ }, () => ({ path: 'download', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: {
      i18n: "export const t=(key,args)=>key+(args?' '+JSON.stringify(args):''); export const loadNamespace=()=>Promise.resolve(); export const locale=()=>window.__loanFixture.locale;",
      region: "export const regionMeta=()=>({currency:window.__loanFixture.currency});",
      'tool-url': "export const readInvocation=()=>window.__loanFixture.invocation;",
      download: "export const download=(blob,name)=>{window.__loanFixture.download={blob,name};};"
    }[args.path] }));
  }
}] });

async function widget(t, invocation = null) {
  const dom = new JSDOM('<main></main>', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const window = dom.window, counters = { runs: 0, formatters: 0, renders: 0 };
  window.__loanFixture = { locale: 'ko-KR', currency: 'KRW', invocation };
  const NumberFormat = window.Intl.NumberFormat;
  window.Intl.NumberFormat = class extends NumberFormat { constructor(...args) { super(...args); counters.formatters++; } };
  const html = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
  Object.defineProperty(window.Element.prototype, 'innerHTML', { get: html.get, set(value) {
    if (['loStats', 'loCompare', 'loTable'].includes(this.id)) counters.renders++;
    html.set.call(this, value);
  } });
  let definition;
  window.Toolbox = { register(value) { definition = value; }, trackUse() { counters.runs++; } };
  window.eval(bundle.outputFiles[0].text);
  definition.tabs[0].build(window.document.querySelector('main'));
  await Promise.resolve(); await Promise.resolve();
  const element = selector => window.document.querySelector(selector);
  const event = (selector, type) => element(selector).dispatchEvent(new window.Event(type, { bubbles: true }));
  const reset = () => { counters.runs = 0; counters.formatters = 0; counters.renders = 0; };
  reset();
  return { window, element, event, counters, reset };
}

test('loan input/change pair renders once and reuses one currency formatter', async t => {
  const ui = await widget(t);
  ui.element('#loR').value = '4.6';
  ui.event('#loR', 'input');
  const output = ui.element('main').innerHTML;
  const stats = ui.element('#loStats').innerHTML;
  ui.event('#loR', 'change');
  assert.equal(ui.element('main').innerHTML, output);
  assert.deepEqual(ui.counters, { runs: 1, formatters: 1, renders: 3 });
  ui.element('#loR').value = '4.60'; ui.event('#loR', 'change');
  assert.equal(ui.counters.runs, 1);
  ui.element('#loR').value = '5'; ui.event('#loR', 'change');
  assert.equal(ui.counters.runs, 2);
  assert.notEqual(ui.element('#loStats').innerHTML, stats);
});

test('loan schedule expansion, select changes and CSV retain current calculation results', async t => {
  const ui = await widget(t);
  assert.equal(ui.element('#loTable').children.length, 13);
  ui.event('#loAll', 'click'); assert.equal(ui.element('#loTable').children.length, 360);
  ui.event('#loAll', 'click'); assert.equal(ui.element('#loTable').children.length, 13);
  ui.element('#loType').value = 'bu'; ui.event('#loType', 'change');
  assert.match(ui.element('#loStats').textContent, /₩375,000/);
  ui.event('#loCsv', 'click');
  const { blob, name } = ui.window.__loanFixture.download;
  assert.equal(name, '대출상환표.csv'); assert.ok(blob.size > 10000);
  const csv = await new Promise((resolve, reject) => {
    const reader = new ui.window.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(blob);
  });
  assert.equal(csv.trim().split('\n').length, 361);
  assert.match(csv, /360,100375000,100000000,375000,0/);
  assert.equal(ui.counters.runs, 4);
});

test('loan URL inputs and changed locale/currency remain part of the rendered state', async t => {
  const ui = await widget(t, { args: { amount: 1200, rate: 0, months: 12, method: 'principal', grace: 0, extra: 0 } });
  assert.equal(ui.element('#loP').value, '1200'); assert.equal(ui.element('#loType').value, 'pp');
  assert.match(ui.element('#loStats').textContent, /₩100/);
  ui.window.__loanFixture.locale = 'en-US'; ui.window.__loanFixture.currency = 'USD';
  ui.event('#loR', 'change');
  assert.match(ui.element('#loStats').textContent, /\$100/);
  assert.deepEqual(ui.counters, { runs: 1, formatters: 1, renders: 3 });
});
