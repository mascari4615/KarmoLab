/**
 * blog.mascari4615.com 전용 번들 (memo change.site-split, 2026-09-22)
 *
 * KarmoLab 셸을 안 싣는 장이라 여기서 둘만 한다. 밝기 전환과 답글.
 * 밝기 열쇠는 셸과 같은 `toolbox_theme` (같은 origin 이라 오가도 결이 안 바뀜)
 */
import './blog-comments';

const KEY = 'toolbox_theme';
function apply(theme: string): void {
    document.documentElement.setAttribute('data-theme', theme);
}
try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') apply(saved);
} catch { /* 저장 막힌 브라우저 */ }
document.querySelector('.b-theme')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* 저장 막힌 브라우저 */ }
});

export {};
