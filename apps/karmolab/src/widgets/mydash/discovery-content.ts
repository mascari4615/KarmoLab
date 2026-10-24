import { esc } from './kit';
import { sourceLink, type DiscoveryItem } from './discovery-data';

export const discoveryTitle = (item: DiscoveryItem): string => item.headline || item.title;
export const discoveryIcon = (item: DiscoveryItem): string => `/apps/karmolab/img/shell/menu/${item.kind === 'event' ? 'cal' : 'book'}.png`;
export function discoveryContent(item: DiscoveryItem, includeDates = false): string {
  const date = includeDates && item.kind === 'event' ? `<p class="discovery-meta">행사 기간 ${esc(item.start!)} ~ ${esc(new Date(Date.parse(item.end!) - 86400000).toISOString().slice(0, 10))}</p>` : '';
  return `<div class="discovery-reading">${item.imageUrl ? `<img class="discovery-hero" src="${esc(sourceLink(item.imageUrl))}" alt="${esc(item.sourceName)} 공식 이미지" referrerpolicy="no-referrer" loading="lazy">` : ''}${date}${item.location ? `<p class="discovery-meta">${esc(item.location)}</p>` : ''}${item.summary ? `<p class="discovery-lead">${esc(item.summary)}</p>` : ''}${item.reading ? item.reading.split(/\n+/).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join('') : '<p class="discovery-meta">한국어 요약 준비 전입니다. 아래 공식 원문 내용을 먼저 읽을 수 있습니다.</p>'}${item.contentStatus === 'excerpt' ? '<p class="discovery-meta">현재 공식 소개문 기준. 전체 내용은 원문에서 확인하세요.</p>' : ''}${item.summaryStatus === 'error' ? '<p class="discovery-meta">한국어 요약을 생성하지 못했습니다. 공식 원문을 표시합니다.</p>' : ''}${item.body ? `<details><summary>공식 원문 내용</summary><pre>${esc(item.body)}</pre></details>` : ''}</div>`;
}
export function guardDiscoveryImages(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>('img').forEach(image => {
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
  });
}
export function discoveryStyles(): void {
  if (document.getElementById('discovery-style')) return;
  const style = document.createElement('style'); style.id = 'discovery-style';
  style.textContent = `
    .discovery {max-width:88rem;margin-inline:auto;color:var(--text-primary);background:var(--dash-paper,var(--bg-secondary));border:1px solid var(--border)}
    .discovery-controls {display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap;position:sticky;top:0;z-index:1;background:var(--dash-paper,var(--bg-secondary))}
    .discovery input {margin-left:auto;min-width:0;width:260px;height:44px;padding:8px 12px;background:var(--dash-paper,var(--bg-secondary));border:1px solid var(--border);font:inherit;font-size:var(--font-size-sm);color:var(--text-primary)}
    .discovery input::placeholder{color:var(--text-secondary);opacity:1}.discovery button{font:inherit;color:inherit;cursor:pointer}
    .discovery-tabs{display:flex;gap:4px}.discovery-tabs button{border:0;min-height:44px;padding:6px 12px;background:transparent}
    .discovery-tabs button[aria-pressed=true]{background:var(--bg-hover);box-shadow:inset 0 -2px var(--accent)}
    .discovery-status{font-size:var(--font-size-xs);color:var(--text-secondary);padding:6px 12px;margin:0;border-bottom:1px solid var(--border)}
    .discovery-layout{display:grid;grid-template-columns:minmax(320px,44%) minmax(0,1fr);min-height:400px;height:calc(100dvh - 188px)}
    .discovery-list-pane{overflow:auto;min-width:0;border-right:1px solid var(--border)}.discovery-list{list-style:none;padding:0;margin:0}
    .discovery-row{border-bottom:1px solid var(--border);overflow-wrap:anywhere}.discovery-story{display:grid;grid-template-columns:80px minmax(0,1fr);gap:12px;padding:12px;width:100%;text-align:left;border:0;background:transparent;line-height:1.5}
    .discovery-story:hover,.discovery-story[aria-current=true]{background:var(--bg-hover)}.discovery-story[aria-current=true]{box-shadow:inset 2px 0 var(--accent)}
    .discovery-thumb{width:80px;height:64px;object-fit:cover}.discovery-thumb--icon{object-fit:contain;padding:8px}
    html[data-theme=dark] .discovery-thumb--icon{filter:brightness(0) invert(.85)}
    .discovery-copy{min-width:0}.discovery-story h3{font-size:var(--font-size-sm);line-height:1.4;margin:0 0 4px}.discovery-story p{margin:0;color:var(--text-secondary);font-size:var(--font-size-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.discovery-story small{display:block;color:var(--text-secondary);font-size:var(--font-size-2xs);margin-top:4px}
    .discovery-reader{min-width:0;overflow:auto;padding:20px 24px;scrollbar-color:var(--border) transparent}.discovery-reader h2{font-size:var(--font-size-title);line-height:1.45;margin:0 0 10px;overflow-wrap:anywhere}
    .discovery-meta{font-size:var(--font-size-xs);color:var(--text-secondary);line-height:1.6}.discovery-reading{font-size:var(--font-size-sm);line-height:1.8;overflow-wrap:anywhere}.discovery-reading p{margin:12px 0}.discovery-lead{font-size:var(--font-size-sm)}.discovery-hero{display:block;width:100%;height:120px;object-fit:cover;margin:12px 0 18px}
    .discovery-reading pre{font:14px/1.7 var(--font-mono,monospace);white-space:pre-wrap;overflow-wrap:anywhere}.discovery-reading details{margin-block:18px}.discovery-reading summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
    .discovery-actions{display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid var(--border);margin-top:18px;padding-top:12px}.discovery-actions a,.discovery-back{display:inline-flex;align-items:center;min-height:44px;padding:6px 10px;color:var(--text-primary);border:1px solid var(--border);text-underline-offset:4px}
    .discovery-back{display:none}.discovery-sources{font-size:var(--font-size-xs);padding:12px}.discovery-source-status>summary{min-height:44px;display:flex;align-items:center;padding:8px 12px;cursor:pointer}.discovery-source-status{border-top:1px solid var(--border)}
    .discovery-error{font-weight:600}.discovery a:focus-visible,.discovery button:focus-visible,.discovery input:focus-visible,.discovery summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .pl-pop:has(.discovery-reading){width:min(480px,calc(100vw - 24px));max-height:80dvh;overflow:auto}.pl-pop .discovery-reading{max-width:100%}
    @media(max-width:850px){.discovery-controls input{width:100%;order:2}.discovery-layout{display:block;height:auto;min-height:350px}.discovery-list-pane{border:0;overflow:visible}.discovery-reader{display:none;padding:18px 16px}.discovery--reading .discovery-reader{display:block}.discovery--reading .discovery-list-pane{display:none}.discovery-back{display:inline-flex;margin-bottom:12px;background:transparent}.discovery-story{grid-template-columns:72px minmax(0,1fr);gap:10px}.discovery-thumb{width:72px;height:64px}.discovery-story p{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.discovery-reader h2{font-size:var(--font-size-title)}}
  `;
  document.head.appendChild(style);
}
