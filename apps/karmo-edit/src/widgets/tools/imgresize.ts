/**
 * 사진 크기 맞추기 (TASK-KL-088)
 *
 * 3MB 이하로 올려 주세요, 가로 1024px 로 맞춰 주세요. 서류 접수나 게시판에서 자주 걸린다.
 * 대충 줄이면 기준을 못 맞추거나 필요 이상으로 뭉갠다.
 *
 * 신경 쓴 곳. **목표를 숫자로 준다.**
 *  - 용량 맞추기를 고르면 그 크기 아래로 **떨어질 때까지 스스로 품질을 찾아 준다.**
 *    사람이 슬라이더를 밀어 가며 맞출 일이 아니다.
 *  - 크게 줄일 때는 **여러 번 나눠 줄인다.** 한 번에 확 줄이면 글자와 선이 부서진다.
 *  - 원본보다 커지는 일이 없게 한다. 줄이려고 눌렀는데 커졌다는 배신이다.
 */
import { fileSize as size } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { attachImage, encode, loadImage } from '@lab/widgets/tools/shared/image';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';
/**
 * 여러 번 나눠 줄인다. 한 번에 1/4 로 보내면 글자, 선이 부서지는데,
 * 절반씩 여러 번 거치면 훨씬 곱게 남음
 */
function shrink(src: CanvasImageSource, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
  let cw = sw;
  let ch = sh;
  let cur = document.createElement('canvas');
  cur.width = cw;
  cur.height = ch;
  cur.getContext('2d')?.drawImage(src, 0, 0, cw, ch);
  while (cw> tw * 2 && ch> th * 2) {
    const next = document.createElement('canvas');
    next.width = Math.max(tw, Math.round(cw / 2));
    next.height = Math.max(th, Math.round(ch / 2));
    const nctx = next.getContext('2d');
    if (!nctx) break;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
    cw = next.width;
    ch = next.height;
  }
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const octx = out.getContext('2d');
  if (octx) {
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(cur, 0, 0, tw, th);
  }
  return out;
}

/**
 * 내보내기는 `shared/image` 의 것을 쓴다 (TASK-KL-272).
 *
 * 전에는 여기서 `cv.toBlob(r, type, q)` 를 그냥 불렀다. 그런데 **JPG 는 투명을 못 담는다** . 
 * 투명하던 자리가 **새까맣게** 나왔다. 크기만 줄였는데 그림이 검어지는 조용한 고장이라
 * 눈으로만 보면 놓친다. 공용 쪽은 JPG 일 때 흰 바탕을 먼저 깔고 그림
 */
const toBlob = (cv: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> =>
  encode(cv, type === 'image/jpeg' ? 'jpeg' : type === 'image/webp' ? 'webp' : 'png', q).catch(() => null);

function setup({ root: container, $, say }: ToolContext): ToolHandlers {
  const stats = $<HTMLElement>('#irStats');
  const preview = $<HTMLImageElement>('#irPreview');

  let img: HTMLImageElement | null = null;
  let originalSize = 0;
  let baseName = t('imgresize.default.name');
  let mode: 'side' | 'percent' | 'bytes' = 'side';

  async function load(files: File[]): Promise<boolean> {
    const file = files[0];
    let im: HTMLImageElement;
    try {
      im = await loadImage(file);
    } catch {
      say(t('imgresize.err.open'), 'error');
      return false;
    }
    img = im;
    originalSize = file.size;
    baseName = (file.name || t('imgresize.default.name')).replace(/\.[^.]+$/, '');
    stats.innerHTML =
      statCell(t('imgresize.stat.srcSize'), `${im.naturalWidth}×${im.naturalHeight}`, true) +
      statCell(t('imgresize.stat.srcBytes'), size(file.size));
    say(t('imgresize.say.ready'), 'ok');
    return true;
  }

  /** 긴 변 목표에 맞춘 크기 (비율은 지킨다) */
  function targetSize(longSide: number): { w: number; h: number } {
    if (!img) return { w: 1, h: 1 };
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const long = Math.max(sw, sh);
    const cap = $<HTMLInputElement>('#irNoUp').checked ? Math.min(longSide, long) : longSide;
    const k = cap / long;
    return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
  }

  async function run(): Promise<ToolResult | null> {
    if (!img) return null;
    const type = $<HTMLSelectElement>('#irType').value;
    try {
      let blob: Blob | null = null;
      let dims = { w: 0, h: 0 };

      if (mode === 'side') {
        dims = targetSize(parseInt($<HTMLInputElement>('#irSide').value, 10));
        const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
        blob = await toBlob(cv, type, 0.92);
      } else if (mode === 'percent') {
        /* 원본 크기를 몰라도 반으로 처럼 말할 수 있어야 한다. 비율은 그대로 지킴 */
        const pct = parseInt($<HTMLInputElement>('#irPercent').value, 10) / 100;
        const noUp = $<HTMLInputElement>('#irNoUp').checked;
        const k = noUp ? Math.min(pct, 1) : pct;
        dims = {
          w: Math.max(1, Math.round(img.naturalWidth * k)),
          h: Math.max(1, Math.round(img.naturalHeight * k))
        };
        const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
        blob = await toBlob(cv, type, 0.92);
      } else {
        const limit = parseInt($<HTMLInputElement>('#irBytes').value, 10) * 1024 * 1024;
        // 품질을 먼저 낮춰 본다. 크기를 줄이는 것보다 잃는 게 적음
        let long = Math.max(img.naturalWidth, img.naturalHeight);
        for (let round = 0; round < 6 && !blob; round++) {
          dims = targetSize(long);
          const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
          for (let q = 92; q>= 40; q -= 8) {
            say(`기준에 맞추는 중... 긴 변 ${long}px, 품질 ${q}%`);
            const b = await toBlob(cv, type === 'image/png' ? 'image/jpeg' : type, q / 100);
            if (b && b.size <= limit) {
              blob = b;
              break;
            }
          }
          // 품질만으로 안 되면 크기도 줄임
          if (!blob) long = Math.round(long * 0.8);
        }
        if (!blob) {
          const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
          blob = await toBlob(cv, 'image/jpeg', 0.4);
        }
      }

      if (!blob) throw new Error(t('imgresize.err.convert'));
      attachImage(preview, blob);

      const pct = Math.round(Math.abs(1 - blob.size / originalSize) * 100);
      // 커졌으면 커졌다고 적는다. -3% 줄었어요는 숫자도 말도 틀림
      const verdict =
        blob.size < originalSize
          ? t('imgresize.verdict.smaller', { pct })
          : blob.size> originalSize
            ? t('imgresize.verdict.bigger', { pct })
            : t('imgresize.verdict.same');
      stats.innerHTML =
        statCell(t('imgresize.stat.outSize'), `${dims.w}×${dims.h}`, true) +
        statCell(t('imgresize.stat.outBytes'), size(blob.size)) +
        statCell(t('imgresize.stat.vsSrc'), verdict);
      const limit = parseInt($<HTMLInputElement>('#irBytes').value, 10) * 1024 * 1024;
      say(
        mode === 'bytes' && blob.size> limit
          ? t('imgresize.say.overLimit')
          : t('imgresize.say.done', { from: size(originalSize), to: size(blob.size), verdict }),
        mode === 'bytes' && blob.size> limit ? 'error' : 'ok'
      );
      Toolbox.trackUse?.('resize');
      const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg';
      return { blob, name: `${baseName}-맞춤.${ext}`, savedMessage: t('imgresize.say.saved', { size: size(blob.size) }) };
    } catch (e) {
      say((e as Error).message || t('imgresize.err.generic'), 'error');
      return null;
    }
  }

  container.querySelectorAll('#irMode .tool-chip').forEach((chip) => {
    (chip as HTMLButtonElement).onclick = () => {
      container.querySelectorAll('#irMode .tool-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      mode = ((chip as HTMLElement).dataset.mode as 'side' | 'percent' | 'bytes') || 'side';
      $<HTMLElement>('#irSideWrap').style.display = mode === 'side' ? '' : 'none';
      $<HTMLElement>('#irPercentWrap').style.display = mode === 'percent' ? '' : 'none';
      $<HTMLElement>('#irBytesWrap').style.display = mode === 'bytes' ? '' : 'none';
    };
  });
  $<HTMLInputElement>('#irSide').addEventListener('input', () => {
    $<HTMLElement>('#irSideVal').textContent = $<HTMLInputElement>('#irSide').value + 'px';
  });
  container.querySelectorAll('[data-side]').forEach((chip) => {
    (chip as HTMLButtonElement).onclick = () => {
      $<HTMLInputElement>('#irSide').value = (chip as HTMLElement).dataset.side as string;
      $<HTMLInputElement>('#irSide').dispatchEvent(new Event('input'));
    };
  });
  $<HTMLInputElement>('#irPercent').addEventListener('input', () => {
    $<HTMLElement>('#irPercentVal').textContent = $<HTMLInputElement>('#irPercent').value + '%';
  });
  container.querySelectorAll('[data-pct]').forEach((chip) => {
    (chip as HTMLButtonElement).onclick = () => {
      $<HTMLInputElement>('#irPercent').value = (chip as HTMLElement).dataset.pct as string;
      $<HTMLInputElement>('#irPercent').dispatchEvent(new Event('input'));
    };
  });
  $<HTMLInputElement>('#irBytes').addEventListener('input', () => {
    $<HTMLElement>('#irBytesVal').textContent = $<HTMLInputElement>('#irBytes').value + 'MB';
  });

  return { load, run };
}

defineTool({
  id: 'imgresize',
  namespace: 'imgresize',
  tabLabel: () => t('imgresize.tab', undefined, '크기 맞추기'),
  ids: { drop: 'irDrop', file: 'irFile', status: 'irStatus', run: 'irRun', save: 'irSave' },
  accept: 'image/*',
  dropLabel: () => t('imgresize.drop'),
  dropHint: () => t('imgresize.status.idle'),
  runLabel: () => t('imgresize.btn.run'),
  saveLabel: () => t('imgresize.btn.save'),
  body: () => `
    <div class="field-group" id="irControls">
  <div class="tool-chips" id="irMode">
    <button type="button" class="tool-chip active" data-mode="side">${esc(t('imgresize.mode.side'))}</button>
    <button type="button" class="tool-chip" data-mode="percent">${esc(t('imgresize.mode.percent'))}</button>
    <button type="button" class="tool-chip" data-mode="bytes">${esc(t('imgresize.mode.bytes'))}</button>
  </div>

  <div id="irSideWrap">
    <div class="tool-sublabel">${esc(t('imgresize.label.side'))} <span id="irSideVal" class="range-value">1024px</span></div>
    <input type="range" id="irSide" aria-label="긴 변 크기" min="200" max="4000" step="20" value="1024">
    <div class="tool-chips" style="margin-top:var(--space-sm);">
      <button type="button" class="tool-chip" data-side="640">640</button>
      <button type="button" class="tool-chip" data-side="1024">1024</button>
      <button type="button" class="tool-chip" data-side="1920">1920</button>
    </div>
  </div>

  <!-- iLoveIMG 등 상위 도구는 픽셀 또는 백분율 둘 다 받는다. 원본 크기를 모르고
       반으로만 줄이고 싶다는 사람에게는 픽셀 칸이 오히려 걸림돌이다. -->
  <div id="irPercentWrap" style="display:none;">
    <div class="tool-sublabel">${esc(t('imgresize.label.percent'))} <span id="irPercentVal" class="range-value">50%</span></div>
    <input type="range" id="irPercent" aria-label="원본 대비 비율 (%)" min="5" max="200" step="5" value="50">
    <div class="tool-chips" style="margin-top:var(--space-sm);">
      <button type="button" class="tool-chip" data-pct="25">25%</button>
      <button type="button" class="tool-chip" data-pct="50">50%</button>
      <button type="button" class="tool-chip" data-pct="75">75%</button>
    </div>
  </div>

  <div id="irBytesWrap" style="display:none;">
    <div class="tool-sublabel">${esc(t('imgresize.label.bytes'))} <span id="irBytesVal" class="range-value">1MB</span></div>
    <input type="range" id="irBytes" aria-label="목표 용량" min="1" max="20" value="4">
    <div class="tool-status" style="margin-top:var(--space-sm);">${esc(t('imgresize.hint.bytes'))}</div>
  </div>

  <div class="tool-grid-2">
    <div>
      <div class="tool-sublabel">${esc(t('imgresize.label.format'))}</div>
      <select id="irType" aria-label="저장 형식">
        <option value="image/jpeg">${esc(t('imgresize.format.jpeg'))}</option>
        <option value="image/webp">${esc(t('imgresize.format.webp'))}</option>
        <option value="image/png">${esc(t('imgresize.format.png'))}</option>
      </select>
    </div>
    <div class="tool-chips" style="align-content:end;">
      <label class="tool-chip"><input type="checkbox" id="irNoUp" checked> ${esc(t('imgresize.opt.noUp'))}</label>
    </div>
  </div>
    </div>
    <div class="cc-stats" id="irStats"></div>`,
  result: () => `<img id="irPreview" alt="바뀐 사진 미리보기" style="max-width:100%; border-radius:var(--radius-xl);">`,
  setup,
});
