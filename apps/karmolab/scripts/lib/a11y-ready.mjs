import { WAIT } from './waits.mjs';

/** Wait for the requested widget and its finite entrance animations before measuring contrast. */
export async function waitForA11yScreen(page, { timeout = WAIT } = {}) {
  await page.waitForFunction(() => {
    if (typeof Toolbox === 'undefined') return false;
    const requested = window.KARMOLAB_ENTRY_TOOL || location.hash.slice(1) || 'home';
    const id = window.KARMOLAB_ENTRY_TOOL ? requested : (Toolbox.findBundleFor(requested) || requested);
    const staticHub = window.KARMOLAB_ENTRY_STATIC === 'hub';
    const root = staticHub ? document.querySelector('.tool-hub') : document.getElementById('page-' + id);
    if (!root || (!staticHub && !root.classList.contains('active'))) return false;
    if (!root.getBoundingClientRect().width || !root.getBoundingClientRect().height) return false;
    const tool = Toolbox.getTools().find(t => t.id === id);
    // Desktop-only tools deliberately render a browser notice without loading their module.
    if (!staticHub && tool?._deferred && !root.querySelector('.tool-desktop-only-note')) return false;
    if (root.querySelector('[data-kl-load-failed]')) return false;
    const animations = root.getAnimations({ subtree: true });
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      animations.push(...parent.getAnimations());
    }
    return !animations.some(a => {
      const timing = a.effect?.getComputedTiming();
      return timing && Number.isFinite(timing.endTime) && (a.pending || a.playState !== 'finished');
    });
  }, null, { timeout });
}
