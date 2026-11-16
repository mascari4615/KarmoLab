/**
 * 가리개. 캡처에서 개인정보 지우기 (TASK-KL-088)
 *
 * 화면 캡처를 올리기 전에 계좌번호, 주소, 이름을 가려야 할 때가 있다. 그림판으로 덮으면 되지만,
 * 급할 때 실수하기 쉽고 사진에 남은 위치 정보까지는 못 뗀다.
 *
 * 신경 쓴 곳. **덮는 게 아니라 지운다.**
 *  - 가린 자리의 원래 점들은 그 자리에서 없어진다. 화면에만 덮어 두면 원본이 파일 안에 남는다.
 *  - 내보낼 때 사진에 붙어 있던 위치, 기기 정보도 같이 떨어진다 (다시 그려 내보내므로).
 *  - 모자이크는 되돌릴 수 있다는 것이 알려져 있다. 그래서 기본은 **검은칠**이고, 모자이크를
 *    고르면 그 사실을 말해 준다. 가린 줄 알았는데 아니었다가 이 도구에서 가장 나쁜 결과다.
 */
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { attachImage, encode, loadImage } from '@lab/widgets/tools/shared/image';
import { fileSize as size } from '@lab/widgets/tools/shared/media';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';


interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function setup({ $, say, publish }: ToolContext): ToolHandlers {
  const canvas = $<HTMLCanvasElement>('#rdCanvas');
  const stats = $<HTMLElement>('#rdStats');
  const undoBtn = $<HTMLButtonElement>('#rdUndo');
  const resetBtn = $<HTMLButtonElement>('#rdReset');

  let img: HTMLImageElement | null = null;
  let boxes: Box[] = [];
  let mode: 'fill' | 'pixel' = 'fill';
  let dragStart: { x: number; y: number } | null = null;
  let dragNow: { x: number; y: number } | null = null;
  // 자판으로 고르는 네모. 끌기와 같은 일을 하는 두 번째 길
  let caret: Box | null = null;
  let sourceName = t('redact.file.fallback');

  /**
   * 가린 자리의 점들을 그 자리에서 없앰
   * 화면 위에 네모를 덮는 방식과 다름. 여기서 지우면 내보낸 파일에도 없음
   */
  function applyBox(ctx: CanvasRenderingContext2D, b: Box): void {
    if (b.w < 1 || b.h < 1) return;
    if (mode === 'fill') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      return;
    }
    const block = parseInt($<HTMLInputElement>('#rdBlock').value, 10);
    const data = ctx.getImageData(b.x, b.y, b.w, b.h);
    const d = data.data;
    for (let by = 0; by < b.h; by += block) {
      for (let bx = 0; bx < b.w; bx += block) {
        let r = 0, g = 0, bl = 0, n = 0;
        const maxY = Math.min(by + block, b.h);
        const maxX = Math.min(bx + block, b.w);
        for (let y = by; y < maxY; y++) {
          for (let x = bx; x < maxX; x++) {
            const i = (y * b.w + x) * 4;
            r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++;
          }
        }
        r = Math.round(r / n); g = Math.round(g / n); bl = Math.round(bl / n);
        for (let y = by; y < maxY; y++) {
          for (let x = bx; x < maxX; x++) {
            const i = (y * b.w + x) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = bl;
          }
        }
      }
    }
    ctx.putImageData(data, b.x, b.y);
  }

  /** 원본에서 다시 그린 뒤 지금까지의 가림을 순서대로 다시 먹인다 (취소를 위해). */
  function redraw(): void {
    if (!img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    for (const b of boxes) applyBox(ctx, b);

    // 끄는 중이면 가려질 자리를 테두리로만 표시. 아직 안 지움
    if (dragStart && dragNow) {
      ctx.save();
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.setLineDash([canvas.width / 80, canvas.width / 80]);
      ctx.strokeRect(
        Math.min(dragStart.x, dragNow.x),
        Math.min(dragStart.y, dragNow.y),
        Math.abs(dragNow.x - dragStart.x),
        Math.abs(dragNow.y - dragStart.y)
      );
      ctx.restore();
    }

    // 자판으로 고르는 중이면 그 네모도 테두리로 표시. 끌기와 같은 모양
    if (caret) {
      ctx.save();
      ctx.strokeStyle = '#5ab0ff';
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.setLineDash([canvas.width / 60, canvas.width / 120]);
      ctx.strokeRect(caret.x, caret.y, caret.w, caret.h);
      ctx.restore();
    }

    const covered = boxes.reduce((s, b) => s + b.w * b.h, 0);
    const pct = canvas.width * canvas.height ? (covered / (canvas.width * canvas.height)) * 100 : 0;
    stats.innerHTML =
      statCell(t('redact.stat.boxes'), t('redact.value.boxes', { n: boxes.length }), true) +
      statCell(t('redact.stat.size'), `${canvas.width}×${canvas.height}`) +
      statCell(
        t('redact.stat.area'),
        `${pct < 0.1 && covered> 0 ? t('redact.value.tiny') : pct.toFixed(1)}%`
      );
    undoBtn.disabled = boxes.length === 0;
    resetBtn.disabled = boxes.length === 0;
    // 가린 자리가 바뀌면 앞 결과는 이미 낡음
    publish(null);
  }

  /**
   * 화면에서 누른 자리를 그림의 점 좌표로 옮긴다 (보이는 크기와 실제 크기가 다르다).
   * 그림 밖은 그림 가장자리로 붙인다. 손가락이 밖으로 나가는 일은 늘 있고,
   * 밖까지 잡힌 상자는 지우려던 자리를 비껴감
   */
  function toImage(e: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * canvas.width, canvas.width),
      y: clamp(((e.clientY - r.top) / r.height) * canvas.height, canvas.height)
    };
  }

  async function load(files: File[]): Promise<boolean> {
    const file = files[0];
    let im: HTMLImageElement;
    try {
      im = await loadImage(file);
    } catch {
      say(t('redact.err.open'), 'error');
      return false;
    }
    img = im;
    boxes = [];
    canvas.width = im.naturalWidth;
    canvas.height = im.naturalHeight;
    sourceName = (file.name || t('redact.file.fallback')).replace(/\.[^.]+$/, '');
    redraw();
    say(t('redact.say.loaded'), 'ok');
    return true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!img) return;
    canvas.setPointerCapture(e.pointerId);
    dragStart = toImage(e);
    dragNow = dragStart;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    dragNow = toImage(e);
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!dragStart || !dragNow) return;
    const b: Box = {
      x: Math.min(dragStart.x, dragNow.x),
      y: Math.min(dragStart.y, dragNow.y),
      w: Math.abs(dragNow.x - dragStart.x),
      h: Math.abs(dragNow.y - dragStart.y)
    };
    dragStart = null;
    dragNow = null;
    // 작은 상자는 잘못 누른 것. 가렸다는 착각 방지
    if (b.w < 3 || b.h < 3) {
      redraw();
      say(t('redact.err.tooSmall'), 'error');
      return;
    }
    boxes.push(b);
    redraw();
    say(t('redact.say.added', { n: boxes.length }), 'ok');
  });

  /* 자판 길. 끌기와 **같은 일**을 자판으로 한다 (2026-08-14, `audit:mouse-only` 가 잡은 자리).
   * 화살표로 옮기기, Shift+화살표로 크기, Enter 로 가리기, Backspace 로 되돌리기
   * 걸음은 그림 크기에 맞춘다(작은 그림에서 한 칸이 화면 절반이 되면 못 쓴다). */
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', t('redact.kb.label'));
  canvas.addEventListener('keydown', (e) => {
    if (!img) return;
    const step = e.shiftKey ? 1 : 1;
    const unit = Math.max(4, Math.round(canvas.width / 50)) * step;
    if (!caret && /^(Arrow|Enter)/.test(e.key)) {
      caret = { x: Math.round(canvas.width / 4), y: Math.round(canvas.height / 4), w: unit * 3, h: unit * 2 };
      e.preventDefault();
      redraw();
      say(t('redact.kb.moved', { x: caret.x, y: caret.y, w: caret.w, h: caret.h }));
      return;
    }
    if (!caret) return;
    const clampBox = (): void => {
      if (!caret) return;
      caret.w = Math.max(4, Math.min(caret.w, canvas.width));
      caret.h = Math.max(4, Math.min(caret.h, canvas.height));
      caret.x = Math.max(0, Math.min(caret.x, canvas.width - caret.w));
      caret.y = Math.max(0, Math.min(caret.y, canvas.height - caret.h));
    };
    switch (e.key) {
      case 'ArrowLeft': if (e.shiftKey) caret.w -= unit; else caret.x -= unit; break;
      case 'ArrowRight': if (e.shiftKey) caret.w += unit; else caret.x += unit; break;
      case 'ArrowUp': if (e.shiftKey) caret.h -= unit; else caret.y -= unit; break;
      case 'ArrowDown': if (e.shiftKey) caret.h += unit; else caret.y += unit; break;
      case 'Enter': {
        boxes.push({ ...caret });
        caret = null;
        e.preventDefault();
        redraw();
        say(t('redact.say.added', { n: boxes.length }), 'ok');
        return;
      }
      case 'Backspace': {
        if (boxes.length> 0) boxes.pop();
        e.preventDefault();
        redraw();
        say(boxes.length ? t('redact.say.left', { n: boxes.length }) : t('redact.say.empty'), 'ok');
        return;
      }
      case 'Escape': {
        caret = null;
        e.preventDefault();
        redraw();
        return;
      }
      default: return;
    }
    clampBox();
    e.preventDefault();
    redraw();
    say(t('redact.kb.moved', { x: caret.x, y: caret.y, w: caret.w, h: caret.h }));
  });


  const setMode = (next: 'fill' | 'pixel'): void => {
    mode = next;
    $<HTMLElement>('#rdModeFill').classList.toggle('active', next === 'fill');
    $<HTMLElement>('#rdModePixel').classList.toggle('active', next === 'pixel');
    $<HTMLElement>('#rdPixelWrap').style.display = next === 'pixel' ? '' : 'none';
    redraw();
    // 가린 줄 알았는데 아니었다가 이 도구에서 가장 나쁜 결과다. 미리 말함
    if (next === 'pixel') {
      say(t('redact.say.pixel'), 'error');
    } else say(t('redact.say.fill'), 'ok');
  };
  $<HTMLElement>('#rdModeFill').onclick = () => setMode('fill');
  $<HTMLElement>('#rdModePixel').onclick = () => setMode('pixel');
  $<HTMLInputElement>('#rdBlock').addEventListener('input', () => {
    $<HTMLElement>('#rdBlockVal').textContent = $<HTMLInputElement>('#rdBlock').value + 'px';
    redraw();
  });

  undoBtn.onclick = () => {
    boxes.pop();
    redraw();
    say(boxes.length ? t('redact.say.left', { n: boxes.length }) : t('redact.say.empty'), 'ok');
  };
  resetBtn.onclick = () => {
    boxes = [];
    redraw();
    say(t('redact.say.reset'), 'ok');
  };

  return {
    load,
    async run() {
      // 끌기와 자판 테두리가 파일에 들어가면 안 됨
      caret = null;
      dragStart = null;
      dragNow = null;
      redraw();
      try {
        const blob = await encode(canvas, 'png');
        attachImage($<HTMLImageElement>('#rdResult'), blob);
        // 다시 그려 내보내므로 사진에 붙은 위치, 기기 정보도 함께 떨어짐
        say(t('redact.say.done', { size: size(blob.size) }), 'ok');
        Toolbox.trackUse?.('save');
        return { blob, name: sourceName + t('redact.file.suffix') + '.png', savedMessage: t('redact.say.saved', { size: size(blob.size) }) };
      } catch {
        say(t('redact.err.render'), 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'redact',
  namespace: 'redact',
  tabLabel: () => t('redact.tab', undefined, '가리기'),
  ids: { drop: 'rdDrop', file: 'rdFile', status: 'rdStatus', run: 'rdRun', save: 'rdSave' },
  accept: 'image/*',
  dropLabel: () => t('redact.drop'),
  dropHint: () => t('redact.status.idle'),
  runLabel: () => t('redact.btn.run'),
  saveLabel: () => t('redact.btn.save'),
  actions: () => `
  <button class="btn btn-ghost" id="rdUndo" disabled>${esc(t('redact.btn.undo'))}</button>
  <button class="btn btn-ghost" id="rdReset" disabled>${esc(t('redact.btn.reset'))}</button>`,
  body: () => `
    <div class="field-group" id="rdControls">
  <div class="tool-chips">
    <button type="button" class="tool-chip active" id="rdModeFill">${esc(t('redact.mode.fill'))}</button>
    <button type="button" class="tool-chip" id="rdModePixel">${esc(t('redact.mode.pixel'))}</button>
  </div>
  <div id="rdPixelWrap" style="display:none;">
    <div class="tool-sublabel">${esc(t('redact.label.block'))} <span id="rdBlockVal" class="range-value">16px</span></div>
    <input type="range" id="rdBlock" aria-label="${esc(t('redact.label.block'))}" min="6" max="48" value="16">
  </div>
    </div>
    <div id="rdStage">
  <div class="tool-sublabel">${esc(t('redact.label.stage'))}</div>
  <canvas id="rdCanvas" style="max-width:100%; border-radius:var(--radius-xl); display:block; cursor:crosshair; border:1px solid var(--border); touch-action:none;"></canvas>
    </div>
    <div class="cc-stats" id="rdStats"></div>`,
  result: () => `<img id="rdResult" alt="" style="max-width:100%; border-radius:var(--radius-lg);">`,
  setup,
});
