/**
 * 서류 스캔 (TASK-KL-316 / 28)
 *
 * 이미지 작업대의 할 일 한 칸. 셈은 `core/docscan`.
 * 네 모서리를 끌어서 종이 귀퉁이에 맞추면 반듯하게 펴진다. PDF 로도 낸다(A4 에 얹어서).
 * 모서리를 자동으로 안 찾는 이유는 알맹이 머리말에 적어 뒀다. 요약하면 **틀렸을 때 이유가 안 보인다**.
 */
import { enhance, fitA4, guessSize, warp, type Corners, type Look } from '@lab/core/docscan';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { loadPdfLib, pdfBlob } from '@lab/widgets/tools/shared/pdf';
import { download } from '@lab/widgets/tools/shared/image';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';
function setup({ $, say, publish }: ToolContext): ToolHandlers {
  const pick = $<HTMLCanvasElement>('#dsPick');
  const out = $<HTMLCanvasElement>('#dsOut');
  let photo: HTMLImageElement | undefined;
  let source: ImageData | undefined;
  let corners: Corners | undefined;
  let dragging = -1;

  function defaultCorners(w: number, h: number): Corners {
    const inset = 0.08;
    return [
      { x: w * inset, y: h * inset },
      { x: w * (1 - inset), y: h * inset },
      { x: w * (1 - inset), y: h * (1 - inset) },
      { x: w * inset, y: h * (1 - inset) }
    ];
  }

  function paintPick(): void {
    if (photo === undefined || corners === undefined) return;
    const ctx = pick.getContext('2d');
    if (ctx === null) return;
    ctx.drawImage(photo, 0, 0, pick.width, pick.height);
    ctx.strokeStyle = 'rgba(70,140,255,.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,140,255,.95)';
    for (const c of corners) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render(): void {
    if (source === undefined || corners === undefined) return;
    const size = guessSize(corners);
    const scale = source.width / pick.width;
    const real: Corners = corners.map((c) => ({ x: c.x * scale, y: c.y * scale })) as Corners;
    const width = Math.round(size.width * scale);
    const height = Math.round(size.height * scale);
    const flat = warp(source.data, source.width, source.height, real, width, height);
    const looked = enhance(flat, width, height, $<HTMLSelectElement>('#dsLook').value as Look);
    out.width = width;
    out.height = height;
    out.style.width = Math.min(360, width) + 'px';
    const ctx = out.getContext('2d');
    if (ctx === null) return;
    const image = ctx.createImageData(width, height);
    image.data.set(looked);
    ctx.putImageData(image, 0, 0);
    paintPick();
    say(t('docscan.status.ready', { w: width, h: height }), 'ok');
    // 저장은 그때의 결과 칸을 PNG 로
    publish({
      name: 'scan.png',
      savedMessage: t('docscan.status.savedPng'),
      blob: () =>
        new Promise((resolve, reject) => {
          out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('docscan.err.png')))), 'image/png');
        }),
    });
  }

  function load(files: File[]): Promise<boolean> {
    const url = URL.createObjectURL(files[0]);
    const image = new Image();
    return new Promise((resolve) => {
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        photo = image;
        // 고르는 화면은 작게, 셈은 원본으로
        const view = Math.min(1, 420 / Math.max(image.width, image.height));
        pick.width = Math.round(image.width * view);
        pick.height = Math.round(image.height * view);
        const tmp = document.createElement('canvas');
        tmp.width = Math.min(image.width, 2000);
        tmp.height = Math.round((tmp.width / image.width) * image.height);
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        if (tctx === null) {
          resolve(false);
          return;
        }
        tctx.drawImage(image, 0, 0, tmp.width, tmp.height);
        source = tctx.getImageData(0, 0, tmp.width, tmp.height);
        corners = defaultCorners(pick.width, pick.height);
        render();
        resolve(true);
      };
      image.onerror = (): void => {
        say(t('docscan.status.badImage'), 'error');
        resolve(false);
      };
      image.src = url;
    });
  }

  pick.addEventListener('pointerdown', (event) => {
    if (corners === undefined) return;
    const box = pick.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * pick.width;
    const y = ((event.clientY - box.top) / box.height) * pick.height;
    let best = 0;
    let bestDist = Infinity;
    corners.forEach((c, i) => {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    dragging = best;
    pick.setPointerCapture(event.pointerId);
  });
  pick.addEventListener('pointermove', (event) => {
    if (dragging < 0 || corners === undefined) return;
    const box = pick.getBoundingClientRect();
    corners[dragging] = {
      x: Math.max(0, Math.min(pick.width, ((event.clientX - box.left) / box.width) * pick.width)),
      y: Math.max(0, Math.min(pick.height, ((event.clientY - box.top) / box.height) * pick.height))
    };
    paintPick();
  });
  pick.addEventListener('pointerup', (event) => {
    if (dragging < 0) return;
    dragging = -1;
    pick.releasePointerCapture(event.pointerId);
    render();
  });

  // 자판 길. Tab 으로 들어와 1~4 로 귀를 고르고 화살표로 옮김. 끌기와 같은 corners
  let pickedEar = 0;
  pick.tabIndex = 0;
  pick.setAttribute('role', 'application');
  pick.setAttribute('aria-label', t('docscan.a11y.pick'));
  pick.addEventListener('keydown', (event: KeyboardEvent) => {
    if (corners === undefined) return;
    if (event.key >= '1' && event.key <= '4') {
      pickedEar = Number(event.key) - 1;
      event.preventDefault();
      paintPick();
      return;
    }
    const step = (event.shiftKey ? 10 : 2) * (pick.width / 600);
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else return;
    event.preventDefault();
    const c = corners[pickedEar];
    corners[pickedEar] = {
      x: Math.max(0, Math.min(pick.width, c.x + dx)),
      y: Math.max(0, Math.min(pick.height, c.y + dy))
    };
    paintPick();
    render();
  });

  $<HTMLSelectElement>('#dsLook').addEventListener('change', render);
  $<HTMLButtonElement>('#dsReset').onclick = (): void => {
    if (photo === undefined) return;
    corners = defaultCorners(pick.width, pick.height);
    render();
  };



  $<HTMLButtonElement>('#dsPdf').onclick = async (): Promise<void> => {
    if (source === undefined) return;
    say(t('docscan.status.pdf'));
    try {
      const library = await loadPdfLib();
      if (library === null) throw new Error(t('docscan.err.pdfLib'));
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (blob === null) throw new Error(t('docscan.err.png'));
      const doc = await library.PDFDocument.create();
      const png = await doc.embedPng(await blob.arrayBuffer());
      const fit = fitA4(out.width, out.height);

      const pageW = fit.landscape ? 842 : 595;
      const pageH = fit.landscape ? 595 : 842;
      const page = doc.addPage([pageW, pageH]);
      const mmToPt = (mm: number): number => (mm / 25.4) * 72;
      const w = mmToPt(fit.widthMm);
      const h = mmToPt(fit.heightMm);
      page.drawImage(png, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      const pdf = pdfBlob(await doc.save());
      download(pdf, 'scan.pdf');
      say(t('docscan.status.savedPdf'), 'ok');
      Toolbox.offerResult?.({ blob: pdf, name: 'scan.pdf', from: 'docscan' });
    } catch (e) {
      say(String((e as Error).message), 'error');
    }
  };

  return { load };
}

defineTool({
  id: 'docscan',
  namespace: 'docscan',
  tabLabel: () => t('docscan.tab', undefined, '스캔'),
  ids: { drop: 'dsDrop', file: 'dsFile', status: 'dsStatus', save: 'dsPng' },
  accept: 'image/*',
  live: true,
  dropLabel: () => t('docscan.label.file'),
  dropHint: () => t('docscan.status.idle'),
  saveLabel: () => t('docscan.btn.png'),
  resultActions: () => `<button class="btn btn-ghost" id="dsPdf">${esc(t('docscan.btn.pdf'))}</button>`,
  body: () => `
    <div class="tool-chips">
    <div>
      <label class="field-label" for="dsLook">${esc(t('docscan.label.look'))}</label>
      <select id="dsLook" name="look" aria-label="${esc(t('docscan.label.look'))}">
        <option value="scan">${esc(t('docscan.look.scan'))}</option>
        <option value="gray">${esc(t('docscan.look.gray'))}</option>
        <option value="color">${esc(t('docscan.look.color'))}</option>
      </select>
    </div>
    <button class="btn btn-ghost" id="dsReset">${esc(t('docscan.btn.reset'))}</button>
    </div>
    <div style="display:flex; gap:16px; flex-wrap:wrap;">
      <div>
        <div class="tool-sublabel">${esc(t('docscan.label.pick'))}</div>
        <canvas id="dsPick" style="border-radius:var(--radius-lg); border:1px solid var(--border); touch-action:none; cursor:crosshair; max-width:100%;"></canvas>
      </div>
      <div>
        <div class="tool-sublabel">${esc(t('docscan.label.result'))}</div>
        <canvas id="dsOut" style="border-radius:var(--radius-lg); border:1px solid var(--border); max-width:100%;"></canvas>
      </div>
    </div>
    <p class="tool-hint">${esc(t('docscan.note.manual'))}</p>`,
  result: () => '',
  setup,
});
