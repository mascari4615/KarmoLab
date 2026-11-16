/**
 * 파비콘 만들기 (TASK-KL-088)
 *
 * 사이트 아이콘은 한 장이 아니라 **여러 크기**가 필요하다. 브라우저 탭은 32px, 폰 홈 화면은 180px,
 * 안드로이드는 192, 512px 을 본다. 하나만 넣으면 어딘가에서 뭉개지거나 안 보인다.
 *
 * 그런데 그걸 만들자고 로고를 낯선 사이트에 올린다. 여기서는 브라우저가 다시 그려 한 번에 낸다.
 * `.ico` 도 함께 만든다. 옛 브라우저와 일부 도구가 아직 그것만 찾는다.
 *
 * 그리고 **붙일 코드까지 준다**. 파일만 받아서는 어디에 어떻게 넣는지가 또 막힌다.
 */
import { fileSize as size } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { download, encode, loadImage } from '@lab/widgets/tools/shared/image';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';
// 왜 이 크기들인지: 탭, 북마크(16, 32), 윈도우 타일(48), 애플 홈 화면(180), 안드로이드(192, 512)

const SIZE_PX = [16, 32, 48, 180, 192, 512];
const sizes = (): Array<[number, string]> => SIZE_PX.map((px) => [px, t(`favicon.use.${px}`)]);

/** PNG 몇 장을 .ico 한 파일로 담는다. ico 는 사실 PNG 를 품을 수 있는 껍데김 */
function buildIco(pngs: Array<{ size: number; bytes: Uint8Array }>): Blob {
  const count = pngs.length;
  const header = 6 + count * 16;
  const total = header + pngs.reduce((a, p) => a + p.bytes.length, 0);
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  view.setUint16(0, 0, true); // 예약
  view.setUint16(2, 1, true); // 1 = 아이콘
  view.setUint16(4, count, true);

  let offset = header;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    // 256 은 0 으로 적는 규격. 한 바이트라 256 이 안 들어감
    out[e] = p.size>= 256 ? 0 : p.size;
    out[e + 1] = p.size>= 256 ? 0 : p.size;
    out[e + 2] = 0; // 색 수
    out[e + 3] = 0; // 예약
    view.setUint16(e + 4, 1, true); // 색 평면
    view.setUint16(e + 6, 32, true); // 비트 수
    view.setUint32(e + 8, p.bytes.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(p.bytes, offset);
    offset += p.bytes.length;
  });
  return new Blob([out as unknown as BlobPart], { type: 'image/x-icon' });
}

function setup({ $, say }: ToolContext): ToolHandlers {
  const previewEl = $<HTMLElement>('#fvPreview');
  const padEl = $<HTMLInputElement>('#fvPad');

  let source: HTMLImageElement | null = null;

  function render(px: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d');
    if (!ctx || !source) return cv;
    const bg = $<HTMLSelectElement>('#fvBg').value;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, px, px);
    }
    if ($<HTMLInputElement>('#fvRound').checked) {
      // 둥근 모서리는 잘라 내는 방식이라 배경보다 먼저 잡아야 함
      const r = px * 0.22;
      ctx.globalCompositeOperation = bg ? 'destination-in' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(px, 0, px, px, r);
      ctx.arcTo(px, px, 0, px, r);
      ctx.arcTo(0, px, 0, 0, r);
      ctx.arcTo(0, 0, px, 0, r);
      ctx.closePath();
      if (bg) ctx.fill();
      else ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
    }
    const pad = (parseInt(padEl.value, 10) / 100) * px;
    const inner = px - pad * 2;
    // 원본 비율을 지켜 가운데에. 늘리면 로고가 찌그러짐
    const scale = Math.min(inner / source.naturalWidth, inner / source.naturalHeight);
    const w = source.naturalWidth * scale;
    const h = source.naturalHeight * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (px - w) / 2, (px - h) / 2, w, h);
    return cv;
  }

  function refresh(): void {
    $<HTMLElement>('#fvPadVal').textContent = padEl.value + '%';
    if (!source) return;
    previewEl.innerHTML = '';
    for (const [px, why] of sizes()) {
      if (px> 192) continue; // 실제 크기로 보여 주므로 큰 것은 뺌
      const cv = render(px);
      cv.style.imageRendering = px <= 48 ? 'pixelated' : 'auto';
      const box = document.createElement('div');
      box.style.textAlign = 'center';
      box.appendChild(cv);
      const cap = document.createElement('div');
      cap.className = 'tool-list-dim';
      cap.style.paddingTop = '4px';
      cap.textContent = `${px}px, ${why}`;
      box.appendChild(cap);
      previewEl.appendChild(box);
    }
    $<HTMLTextAreaElement>('#fvCode').value = [
      '<link rel="icon" href="/favicon.ico" sizes="any">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/site.webmanifest">'
    ].join('\n');
  }

  const toBlob = (cv: HTMLCanvasElement): Promise<Blob> => encode(cv, 'png');

  async function load(files: File[]): Promise<boolean> {
    let img: HTMLImageElement;
    try {
      img = await loadImage(files[0]);
    } catch {
      say(t('favicon.err.open'), 'error');
      return false;
    }
    source = img;
    refresh();
    const square = Math.abs(img.naturalWidth - img.naturalHeight) < Math.max(img.naturalWidth, img.naturalHeight) * 0.05;
    say(
      square
        ? `${img.naturalWidth}×${img.naturalHeight}. 설정을 맞추고 만드세요.`
        : `${img.naturalWidth}×${img.naturalHeight} 은 정사각형이 아닙니다. 가운데에 맞춰 넣지만, 정사각형 그림이 가장 깔끔합니다.`,
      square ? 'ok' : ''
    );
    return true;
  }

  [padEl, $<HTMLSelectElement>('#fvBg'), $<HTMLInputElement>('#fvRound')].forEach((el) =>
    el.addEventListener('input', refresh)
  );

  $<HTMLButtonElement>('#fvIco').onclick = () => {
    void (async () => {
      if (!source) return;
      const parts = [];
      for (const px of [16, 32, 48]) {
        parts.push({ size: px, bytes: new Uint8Array(await (await toBlob(render(px))).arrayBuffer()) });
      }
      const blob = buildIco(parts);
      download(blob, 'favicon.ico');
      say(`favicon.ico 를 받았어요 (16, 32, 48 세 크기가 한 파일에 들어 있습니다, ${size(blob.size)}).`, 'ok');
      Toolbox.trackUse?.('ico');
    })().catch((err: Error) => say(t('favicon.err.making', { msg: err.message }), 'error'));
  };

  async function run(): Promise<ToolResult | null> {
    if (!source) {
      say(t('favicon.err.noImage'), 'error');
      return null;
    }
    say(t('favicon.status.working'));
    try {
      await Toolbox.ensureScript?.('vendor/jszip.min');
      const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob | string) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
      const zip = new Z();
      const icoParts = [];
      for (const [px] of sizes()) {
        const blob = await toBlob(render(px));
        const name =
          px === 180 ? 'apple-touch-icon.png' : px === 192 || px === 512 ? `android-chrome-${px}x${px}.png` : `favicon-${px}.png`;
        zip.file(name, blob);
        if (px <= 48) icoParts.push({ size: px, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      zip.file('favicon.ico', buildIco(icoParts));
      zip.file(t('favicon.file.code'), $<HTMLTextAreaElement>('#fvCode').value);
      zip.file(
        'site.webmanifest',
        JSON.stringify(
          {
            icons: [
              { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
            ],
          },
          null,
          2
        )
      );
      const out = await zip.generateAsync({ type: 'blob' });
      say(t('favicon.say.zipDone', { n: sizes().length, size: size(out.size) }), 'ok');
      Toolbox.trackUse?.('zip');
      return { blob: out, name: t('favicon.file.zip') };
    } catch (err) {
      say(t('favicon.err.making', { msg: (err as Error).message }), 'error');
      return null;
    }
  }

  $<HTMLButtonElement>('#fvCopy').onclick = () => {
    void Toolbox.copyText?.($<HTMLTextAreaElement>('#fvCode').value, { message: t('favicon.copy.done') });
  };

  return { load, run };
}

defineTool({
  id: 'favicon',
  namespace: 'favicon',
  tabLabel: () => t('favicon.tab', undefined, '파비콘'),
  ids: { drop: 'fvDrop', file: 'fvFile', status: 'fvStatus', run: 'fvRun', save: 'fvSave' },
  accept: 'image/*',
  dropLabel: () => t('favicon.drop'),
  dropHint: () => t('favicon.status.idle'),
  runLabel: () => t('favicon.btn.run'),
  saveLabel: () => t('favicon.btn.zip'),
  body: () => `
  <div class="field-group">
    <div class="tool-grid-2">
      <div>
        <div class="tool-sublabel">${esc(t('favicon.label.pad'))} <span id="fvPadVal" class="range-value">0%</span></div>
        <input type="range" id="fvPad" aria-label="여백" min="0" max="30" value="0">
      </div>
      <div>
        <div class="tool-sublabel">${esc(t('favicon.label.bg'))}</div>
        <select id="fvBg" aria-label="배경">
          <option value="">${esc(t('favicon.bg.none'))}</option>
          <option value="#ffffff">${esc(t('favicon.bg.white'))}</option>
          <option value="#000000">${esc(t('favicon.bg.black'))}</option>
        </select>
      </div>
    </div>
    <div class="tool-chips">
      <label class="tool-chip"><input type="checkbox" id="fvRound"> ${esc(t('favicon.opt.round'))}</label>
    </div>
  </div>

  <div class="tool-sublabel">${esc(t('favicon.label.preview'))}</div>
  <div id="fvPreview" style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; background:var(--bg-secondary); padding:14px; border-radius:var(--radius-lg);"></div>`,
  result: () => `
  <div class="field-group">
    <label class="field-label" for="fvCode">${esc(t('favicon.label.code'))}</label>
    <textarea class="full" id="fvCode" rows="6" spellcheck="false" readonly></textarea>
    <button class="btn btn-ghost btn-sm" id="fvCopy" style="margin-top:var(--space-sm);">${esc(t('favicon.btn.copy'))}</button>
  </div>`,
  resultActions: () => `<button class="btn btn-ghost" id="fvIco">${esc(t('favicon.btn.ico'))}</button>`,
  setup,
});
