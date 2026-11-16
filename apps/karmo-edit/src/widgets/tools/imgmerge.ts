/**
 * 사진 이어 붙이기 (TASK-KL-088)
 *
 * 대화 캡처 세 장, 영수증 두 장, 긴 페이지를 나눠 찍은 것. 한 장으로 합쳐야 보내기 편한데
 * 그러자고 편집 프로그램을 켜거나 사진을 낯선 사이트에 올린다.
 *
 * 신경 쓴 곳: 폭이 다른 캡처를 그냥 붙이면 **들쭉날쭉한 계단**이 된다. 그래서 기준 폭을 정해
 * 나머지를 맞추고, 남는 자리는 배경색으로 채운다. 순서는 넣은 순서대로 두되 끌어서 바꿀 수 있다.
 */
import { fileSize as size } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { attachImage, encode, loadImage } from '@lab/widgets/tools/shared/image';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';

interface Shot {
  name: string;
  img: HTMLImageElement;
}

function setup({ $, say, reset }: ToolContext): ToolHandlers {
  const listEl = $<HTMLElement>('#imList');
  const stats = $<HTMLElement>('#imStats');
  const gapEl = $<HTMLInputElement>('#imGap');

  let shots: Shot[] = [];

  /** 이어 붙인 크기를 미리 계산한다. 만들기 전에 너무 큰가를 알 수 있어야 함 */
  function plan(): { w: number; h: number; base: number } {
    const dir = $<HTMLSelectElement>('#imDir').value;
    const fit = $<HTMLSelectElement>('#imFit').value;
    const gap = parseInt(gapEl.value, 10);
    if (!shots.length) return { w: 0, h: 0, base: 0 };

    const sizes = shots.map((s) => (dir === 'v' ? s.img.naturalWidth : s.img.naturalHeight));
    const base = fit === 'max' ? Math.max(...sizes) : fit === 'min' ? Math.min(...sizes) : 0;

    let along = 0;
    let across = 0;
    for (const s of shots) {
      const w = s.img.naturalWidth;
      const h = s.img.naturalHeight;
      if (dir === 'v') {
        const scale = base ? base / w : 1;
        along += Math.round(h * scale);
        across = Math.max(across, base || w);
      } else {
        const scale = base ? base / h : 1;
        along += Math.round(w * scale);
        across = Math.max(across, base || h);
      }
    }
    along += gap * Math.max(0, shots.length - 1);
    return dir === 'v' ? { w: across, h: along, base } : { w: along, h: across, base };
  }

  function render(): void {
    listEl.innerHTML = shots
      .map(
        (s, i) =>
          `<div class="tool-list-row"><span class="tool-list-key">${esc(t('imgmerge.value.nth', { n: i + 1 }))}</span><span class="tool-list-val">${esc(s.name)} <span class="tool-list-dim">${s.img.naturalWidth}×${s.img.naturalHeight}</span></span></div>`
      )
      .join('');
    $<HTMLElement>('#imGapVal').textContent = gapEl.value + 'px';
    if (!shots.length) {
      stats.innerHTML = '';
      return;
    }
    const { w, h } = plan();
    stats.innerHTML =
      statCell(t('imgmerge.stat.size'), `${w}×${h}`, true) +
      statCell(t('imgmerge.stat.count'), t('imgmerge.value.shots', { n: shots.length })) +
      // 브라우저가 감당 못 하는 크기가 있다. 미리 알림
      statCell(t('imgmerge.stat.state'), w * h> 60_000_000 ? t('imgmerge.verdict.tooBig') : t('imgmerge.verdict.ok'));
  }

  function draw(): HTMLCanvasElement | null {
    const dir = $<HTMLSelectElement>('#imDir').value;
    const gap = parseInt(gapEl.value, 10);
    const { w, h, base } = plan();
    if (!w || !h) return null;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = $<HTMLInputElement>('#imBg').value || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';

    let at = 0;
    for (const s of shots) {
      const iw = s.img.naturalWidth;
      const ih = s.img.naturalHeight;
      if (dir === 'v') {
        const scale = base ? base / iw : 1;
        const dw = Math.round(iw * scale);
        const dh = Math.round(ih * scale);
        // 폭이 다르면 가운데로. 왼쪽에 붙이면 계단처럼 보임
        ctx.drawImage(s.img, Math.round((w - dw) / 2), at, dw, dh);
        at += dh + gap;
      } else {
        const scale = base ? base / ih : 1;
        const dw = Math.round(iw * scale);
        const dh = Math.round(ih * scale);
        ctx.drawImage(s.img, at, Math.round((h - dh) / 2), dw, dh);
        at += dw + gap;
      }
    }
    return cv;
  }

  async function add(list: File[]): Promise<boolean> {
    for (const f of list) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const img = await loadImage(f);
        if (img.naturalWidth) shots.push({ name: f.name, img });
      } catch {
        say(t('imgmerge.err.one', { name: f.name }), 'error');
      }
    }
    render();
    if (shots.length) say(t('imgmerge.say.picked', { n: shots.length }), 'ok');
    return shots.length > 0;
  }

  ['#imDir', '#imFit', '#imBg'].forEach((s) => $<HTMLElement>(s).addEventListener('change', render));
  gapEl.addEventListener('input', render);
  $<HTMLButtonElement>('#imClear').onclick = () => {
    shots = [];
    render();
    reset();
    say(t('imgmerge.say.cleared'));
  };
  render();

  return {
    load: add,
    async run() {
      if (shots.length < 2) {
        say(t('imgmerge.err.needTwo'), 'error');
        return null;
      }
      const { w, h } = plan();
      if (w * h > 60_000_000) {
        say(t('imgmerge.err.tooBig'), 'error');
        return null;
      }
      const cv = draw();
      if (!cv) {
        say(t('imgmerge.err.make'), 'error');
        return null;
      }
      const blob = await encode(cv, 'png');
      attachImage($<HTMLImageElement>('#imPreview'), blob);
      say(t('imgmerge.say.done', { n: shots.length, w: cv.width, h: cv.height, size: size(blob.size) }), 'ok');
      Toolbox.trackUse?.('merge');
      return { blob, name: t('imgmerge.file.name') };
    },
  };
}

defineTool({
  id: 'imgmerge',
  namespace: 'imgmerge',
  tabLabel: () => t('imgmerge.tab', undefined, '이어 붙이기'),
  ids: { drop: 'imDrop', file: 'imFile', status: 'imStatus', run: 'imRun', save: 'imSave' },
  accept: 'image/*',
  multiple: true,
  accumulate: true,
  dropLabel: () => t('imgmerge.drop'),
  dropHint: () => t('imgmerge.status.idle'),
  runLabel: () => t('imgmerge.btn.run'),
  saveLabel: () => t('imgmerge.btn.save'),
  actions: () => `<button class="btn btn-ghost" id="imClear">${esc(t('imgmerge.btn.clear'))}</button>`,
  body: () => `
    <div class="tool-list" id="imList"></div>
    <div class="field-group">
    <div class="tool-grid-2">
      <div>
        <div class="tool-sublabel">${esc(t('imgmerge.label.dir'))}</div>
        <select id="imDir" aria-label="${esc(t('imgmerge.aria.dir'))}">
          <option value="v">${esc(t('imgmerge.opt.v'))}</option>
          <option value="h">${esc(t('imgmerge.opt.h'))}</option>
        </select>
      </div>
      <div>
        <div class="tool-sublabel">${esc(t('imgmerge.label.gap'))} <span id="imGapVal" class="range-value">0px</span></div>
        <input type="range" id="imGap" aria-label="${esc(t('imgmerge.label.gap'))}" min="0" max="60" value="0">
      </div>
    </div>
    <div class="tool-grid-2">
      <div>
        <div class="tool-sublabel">${esc(t('imgmerge.label.fit'))}</div>
        <select id="imFit" aria-label="${esc(t('imgmerge.label.fit'))}">
          <option value="max">${esc(t('imgmerge.opt.max'))}</option>
          <option value="min">${esc(t('imgmerge.opt.min'))}</option>
          <option value="none">${esc(t('imgmerge.opt.none'))}</option>
        </select>
      </div>
      <div>
        <div class="tool-sublabel">${esc(t('imgmerge.label.bg'))}</div>
        <input type="text" id="imBg" aria-label="${esc(t('imgmerge.label.bg'))}" value="#ffffff" spellcheck="false">
      </div>
    </div>
    </div>
    <div class="cc-stats" id="imStats"></div>`,
  result: () => `
  <div class="tool-sublabel">${esc(t('imgmerge.label.preview'))}</div>
  <img id="imPreview" alt="${esc(t('imgmerge.alt.preview'))}" style="max-width:100%; border-radius:var(--radius-lg); background:#fff;">`,
  setup,
});
