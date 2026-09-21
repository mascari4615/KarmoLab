import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { waitForA11yScreen } from './lib/a11y-ready.mjs';

const require = createRequire(import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html lang="en"><title>Contrast fixture</title>
    <style>body{background:#171821}button{color:#9a9a94;background:#171821;font:14px sans-serif}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>
    <main id="page-planner" class="active"><button>Diary</button></main></html>`);
  await page.evaluate(() => {
    location.hash = 'planner';
    window.fixtureTool = { id: 'planner', _deferred: false };
    window.Toolbox = { findBundleFor: () => null, getTools: () => [window.fixtureTool] };
  });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const contrast = () => page.evaluate(async () => (await axe.run('button', {
    runOnly: { type: 'rule', values: ['color-contrast'] },
  })).violations);

  // Observe the real shell entrance at its midpoint, as a late mount can expose it to axe.
  await page.evaluate(() => {
    const root = document.querySelector('main');
    root.style.animation = 'fadeIn 200ms ease';
    const animation = root.getAnimations()[0];
    animation.pause();
    animation.currentTime = 100;
  });
  const during = await contrast();
  assert.equal(during.length, 1, 'a measurement during entrance must reproduce the contrast failure');
  console.log('[a11y-ready] entrance midpoint:', JSON.stringify(during[0].nodes[0].any[0].data));
  await assert.rejects(waitForA11yScreen(page, { timeout: 100 }), /Timeout/);
  await page.evaluate(() => document.querySelector('main').getAnimations()[0].play());
  await waitForA11yScreen(page);
  assert.equal((await contrast()).length, 0, 'measure the fully visible screen');

  await page.evaluate(() => { window.fixtureTool._deferred = true; });
  await assert.rejects(waitForA11yScreen(page, { timeout: 100 }), /Timeout/);
  const delayed = waitForA11yScreen(page);
  await page.evaluate(() => { window.fixtureTool._deferred = false; });
  await delayed;
  await page.evaluate(() => {
    window.fixtureTool._deferred = true;
    const note = document.createElement('p');
    note.className = 'tool-desktop-only-note';
    note.textContent = 'Available in the desktop app';
    document.querySelector('main').append(note);
  });
  await waitForA11yScreen(page);
  await page.evaluate(() => {
    document.querySelector('.tool-desktop-only-note').remove();
    window.fixtureTool._deferred = false;
  });

  await page.evaluate(() => { location.hash = 'missing'; });
  await assert.rejects(waitForA11yScreen(page, { timeout: 100 }), /Timeout/);
  await page.evaluate(() => {
    window.KARMOLAB_ENTRY_STATIC = 'hub';
    document.querySelector('main').className = 'tool-hub';
  });
  await waitForA11yScreen(page);
  await page.evaluate(() => {
    delete window.KARMOLAB_ENTRY_STATIC;
    document.querySelector('main').className = 'active';
    location.hash = 'planner';
    document.body.style.animation = 'fadeIn 200ms ease';
    const animation = document.body.getAnimations()[0];
    animation.pause();
    animation.currentTime = 100;
  });
  await assert.rejects(waitForA11yScreen(page, { timeout: 100 }), /Timeout/);
  await page.evaluate(() => document.body.getAnimations()[0].play());
  await waitForA11yScreen(page);
  await page.evaluate(() => {
    location.hash = 'planner';
    document.querySelector('button').style.color = '#444';
    document.querySelector('main').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(1px)' }],
      { duration: 1000, iterations: Infinity });
  });
  await waitForA11yScreen(page);
  assert.equal((await contrast()).length, 1, 'a permanent contrast defect must still fail');
  console.log('[a11y-ready] entrance, delayed widget, wrong page, static hub, parent animation, infinite motion, real contrast defect: PASS');
} finally {
  await browser.close();
}
