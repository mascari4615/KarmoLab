/**
 * 배경 지우기 (TASK-KL-316 / 26, 모양 겹 = 흡혈 원장 14 / TASK-KL-238)
 *
 * 이미지 작업대의 할 일 한 칸. 셈은 `core/bgremove`.
 *
 * 겹이 둘이다. **색**으로 지우는 쪽(`core/bgremove`)이 기본이고. 증명사진, 상품 사진에서는
 * 이게 제일 빠르고 정확하다, 받을 것도 없다. 그 위에 **모양**으로 오려내는 쪽(`lib/ai-cutout`)이
 * 얹힌다. 오래 이 파일에는 사람 형태를 알아보는 것은 학습 모형이 필요하고 이 사이트는 그런 걸
 * 안 받는다고 적혀 있었는데, 그건 **모델을 어디에 둘지가 안 정해져서** 그랬던 것이고
 * (`ai-engine.ts` 2026-08-10) 그 답은 이미 나와 있었다: 켠 사람만 그때 받는다.
 *
 * ★ 철칙은 그대로다. **모양 겹이 없어도 도구는 그대로 열린다.** WebGPU 가 없으면 더 무거운
 * 판(q8)으로 내려가고, 아무 것도 못 하면 그 자리를 **아예 안 보여 준다**(오류 X).
 */
import { apply, guessBackground, maskOf, removedRatio } from '@lab/core/bgremove';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { AiGate } from '@lab/lib/ai-gate';
import { loadEngine, webgpuAvailable } from '@lab/lib/ai-engine';
import {
  CUTOUT_MODELS,
  alphaOf,
  applyAlpha,
  cutout,
  keptRatio,
  resampleAlpha,
  sizeMbFor,
  trimBox,
  type CutoutKind
} from '../../lib/ai-cutout';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';

function setup({ root: container, $, say, publish }: ToolContext): ToolHandlers {
  const canvas = $<HTMLCanvasElement>('#brCanvas');

  /** 저장은 그때의 캔버스를 투명 PNG 로 */
  function offer(): void {
    publish({
      name: 'no-background.png',
      savedMessage: t('bgremove.status.saved'),
      blob: () =>
        new Promise((resolve, reject) => {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('bgremove.status.badImage')))), 'image/png');
        }),
    });
  }

  let source: ImageData | undefined;
  let pick: { x: number; y: number } | undefined;
  /**
   * 모양 겹이 찾아 준 가리개. 있으면 **색 눈금을 무시한다**. 두 겹을 섞으면 어느 쪽이
   * 지운 건지 알 수 없고, 사람은 눈금만 돌리며 헤맴
   * 그래서 눈금을 건드리는 순간 이걸 버리고 색 겹으로 돌아감
   */
  let aiAlpha: Uint8ClampedArray | undefined;

  /** 남은 것에 맞춰 잘라 그린다. 잘릴 게 없으면 원래 크기 그대로. */
  function paint(rgba: Uint8ClampedArray, width: number, height: number, alpha: Uint8ClampedArray): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return;
    const box = $<HTMLInputElement>('#brTrim').checked ? trimBox(alpha, width, height) : null;
    canvas.width = box === null ? width : box.width;
    canvas.height = box === null ? height : box.height;
    const shown = ctx.createImageData(canvas.width, canvas.height);
    if (box === null) {
      shown.data.set(rgba);
    } else {
      for (let y = 0; y < box.height; y++) {
        const from = ((box.y + y) * width + box.x) * 4;
        shown.data.set(rgba.subarray(from, from + box.width * 4), y * box.width * 4);
      }
    }
    ctx.putImageData(shown, 0, 0);
  }

  function render(): void {
    if (source === undefined) return;
    offer();
    const tolerance = Number($<HTMLInputElement>('#brTol').value);
    const feather = Number($<HTMLInputElement>('#brFeather').value);
    $<HTMLElement>('#brTolVal').textContent = String(tolerance);
    $<HTMLElement>('#brFeatherVal').textContent = String(feather);

    if (aiAlpha !== undefined) {
      /* 모양 겹: **색은 원본에서, 모양만 모델에서.** 모델이 낸 그림을 그대로 쓰면
         줄어든 사진을 저장하게 됨 */
      const out = applyAlpha(source.data, aiAlpha);
      paint(out, source.width, source.height, aiAlpha);
      const kept = Math.round(keptRatio(aiAlpha) * 100);
      say(kept === 0
          ? t('bgremove.ai.empty')
          : kept >= 99
            ? t('bgremove.ai.full')
            : t('bgremove.ai.done', { n: kept }));
      return;
    }

    const options = { tolerance, feather, pick, despill: $<HTMLInputElement>('#brDespill').checked };
    const background = pick === undefined ? guessBackground(source.data, source.width, source.height) : undefined;
    const alpha = maskOf(source.data, source.width, source.height, options);
    const out = apply(source.data, alpha, options, background);
    paint(out, source.width, source.height, alpha);

    const gone = Math.round(removedRatio(alpha) * 100);
    say(gone === 0
        ? t('bgremove.status.nothing')
        : gone> 95
          ? t('bgremove.status.tooMuch', { n: gone })
          : t('bgremove.status.ok', { n: gone }));
  }

  /* ── 모양으로 오려내기 (흡혈 원장 14 / TASK-KL-335) ────────────────────── */

  const aiSay = (msg: string, tone = ''): void => {
    const el = container.querySelector('#brAiSay') as HTMLElement | null;
    if (el === null) return;
    el.textContent = msg;
    el.className = `tool-status${tone === '' ? '' : ' ' + tone}`;
  };

  /** 겹마다 게이트가 따로다. 사람 겹을 받아 뒀다고 물건 겹이 공짜가 되는 건 아님 */
    const gates = new Map<CutoutKind, AiGate>();
    const pendingWork = new Map<CutoutKind, (onProgress: (pct: number) => void) => Promise<void>>();

  /** 사진을 고른 뒤에만 보여 준다. 못 하는 자리에서는 **아예 안 보여 준다**(오류 X). */
  function showAiPanel(): void {
    const panel = container.querySelector('#brAiPanel') as HTMLElement | null;
    if (panel === null) return;
    panel.style.display = '';
    const webgpu = webgpuAvailable();
    const person = CUTOUT_MODELS.person;
    const anything = CUTOUT_MODELS.anything;
    $<HTMLButtonElement>('#brAiPerson').textContent = t('bgremove.ai.person', {
      mb: sizeMbFor(person, webgpu)
    });
    $<HTMLButtonElement>('#brAiAnything').textContent = t('bgremove.ai.anything', {
      mb: sizeMbFor(anything, webgpu)
    });
    aiSay(t('bgremove.ai.hint'));
    /* 라이선스를 화면에 그대로 적는다. 숨기면 나중에 곤란해지는 건 우림 */
    $<HTMLElement>('#brAiLicense').textContent = `${t('bgremove.ai.license', {
      person: `${person.repo}, ${person.license}`,
      anything: `${anything.repo}, ${anything.license}`
    })} ${t('bgremove.ai.noncommercial')}`;
  }

  async function runCutout(kind: CutoutKind): Promise<void> {
    if (source === undefined) return;
    const webgpu = webgpuAvailable();
    const model = CUTOUT_MODELS[kind];
    const buttons = [$<HTMLButtonElement>('#brAiPerson'), $<HTMLButtonElement>('#brAiAnything')];
    buttons.forEach((b) => (b.disabled = true));

    /* 모델에 넘길 그림은 **원본이 아니라 지금 캔버스**다. 그런데 캔버스에는 방금 지운
       결과가 들어 있을 수 있으므로, 원본 색을 한 장 따로 떠서 넘김 */
    const plate = document.createElement('canvas');
    plate.width = source.width;
    plate.height = source.height;
    const plateCtx = plate.getContext('2d');
    if (plateCtx === null) {
      buttons.forEach((b) => (b.disabled = false));
      return;
    }
    plateCtx.putImageData(source, 0, 0);
    const png = plate.toDataURL('image/png');

    // 게이트는 처음 한 번만 받음. 이미 받았으면 accept 가 바로 통과하므로 여기서 직접 실행
    let ran = false;
    const work = async (onProgress: (pct: number) => void): Promise<void> => {
      ran = true;
      const engine = await loadEngine();
      const got = await cutout(engine, png, kind, { onProgress, webgpu });
      const raw = alphaOf(got.rgba);
      // 판에 따라 다른 크기로 돌아옴. 원본 크기로 맞춤
      aiAlpha = resampleAlpha(raw, got.width, got.height, source!.width, source!.height);
      render();
    };
    pendingWork.set(kind, work);
    let gate = gates.get(kind);
    if (gate === undefined) {
      gate = new AiGate({
        sizeMb: sizeMbFor(model, webgpu),
        fetch: (onProgress) => (pendingWork.get(kind) as typeof work)(onProgress),
        onChange: (v) => aiSay(v.say, v.state === 'failed' ? 'error' : ''),
      });
      gates.set(kind, gate);
    }
    try {
      const ok = await gate.accept();
      if (ok && !ran) await work(() => {});
    } catch (err) {
      aiSay((err as Error).message, 'error');
    }
    buttons.forEach((b) => (b.disabled = false));
  }

  $<HTMLButtonElement>('#brAiPerson').onclick = (): void => void runCutout('person');
  $<HTMLButtonElement>('#brAiAnything').onclick = (): void => void runCutout('anything');

  function load(files: File[]): Promise<boolean> {
    say(t('bgremove.status.reading'));
    const url = URL.createObjectURL(files[0]);
    const image = new Image();
    return new Promise((resolve) => {
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        // 큰 사진은 줄여서 셈
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) {
          resolve(false);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        source = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pick = undefined;
        aiAlpha = undefined;
        render();
        showAiPanel();
        resolve(true);
      };
      image.onerror = (): void => {
        say(t('bgremove.status.badImage'), 'error');
        resolve(false);
      };
      image.src = url;
    });
  }

  /*
   * 눈금, 색 관련 손잡이를 건드리면 **색 겹으로 돌아간다.** 안 그러면 모양 겹이 켜진 채로
   * 눈금만 돌아가서 왜 아무 변화가 없지가 된다. 고장 같지만 고장이 아닌, 제일 나쁜 종류.
   * 여백까지 자르기는 어느 겹에서든 뜻이 같으므로 겹을 안 바꿈
   */
  container
    .querySelectorAll('input[type="range"], #brDespill, #brPickMode')
    .forEach((el) =>
      el.addEventListener('input', () => {
        if (aiAlpha !== undefined) {
          aiAlpha = undefined;
          aiSay(t('bgremove.ai.backToColor'));
        }
        render();
      })
    );
  $<HTMLInputElement>('#brTrim').addEventListener('input', render);

  /* 배경을 콕 집기. 모서리가 배경이 아닌 사진(가장자리에 물체가 닿는 사진)에서 필요함 */
  canvas.addEventListener('click', (event) => {
    if (!$<HTMLInputElement>('#brPickMode').checked || source === undefined) return;
    const box = canvas.getBoundingClientRect();
    pick = {
      x: Math.round(((event.clientX - box.left) / box.width) * canvas.width),
      y: Math.round(((event.clientY - box.top) / box.height) * canvas.height)
    };
    render();
  });


  return { load };
}

defineTool({
  id: 'bgremove',
  namespace: 'bgremove',
  tabLabel: () => t('bgremove.tab', undefined, '배경'),
  ids: { drop: 'brDrop', file: 'brFile', status: 'brStatus', save: 'brSave' },
  accept: 'image/*',
  live: true,
  dropLabel: () => t('bgremove.label.file'),
  dropHint: () => t('bgremove.status.idle'),
  saveLabel: () => t('bgremove.btn.save'),
  body: () => `
    <div class="tool-grid-2">
      <div>
        <div class="tool-sublabel">${esc(t('bgremove.label.tolerance'))} <span id="brTolVal" class="range-value">32</span></div>
        <input type="range" id="brTol" name="tolerance" aria-label="${esc(t('bgremove.label.tolerance'))}" min="4" max="120" value="32">
      </div>
      <div>
        <div class="tool-sublabel">${esc(t('bgremove.label.feather'))} <span id="brFeatherVal" class="range-value">2</span></div>
        <input type="range" id="brFeather" name="feather" aria-label="${esc(t('bgremove.label.feather'))}" min="0" max="8" value="2">
      </div>
    </div>
    <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap;">
      <label class="tool-checkline">
        <input type="checkbox" id="brDespill" name="despill" checked> ${esc(t('bgremove.opt.despill'))}
      </label>
      <label class="tool-checkline">
        <input type="checkbox" id="brPickMode" name="pick"> ${esc(t('bgremove.opt.pick'))}
      </label>
      <label class="tool-checkline">
        <input type="checkbox" id="brTrim" name="trim"> ${esc(t('bgremove.opt.trim'))}
      </label>
    </div>
    <div id="brAiPanel" style="display:none; border:1px solid var(--border); border-radius:var(--radius-xl); padding:10px 12px; margin:10px 0;">
      <div class="tool-sublabel">${esc(t('bgremove.ai.title'))}</div>
      <div style="display:flex; gap:8px; margin:8px 0; flex-wrap:wrap;">
        <button class="btn btn-ghost" id="brAiPerson">${esc(t('bgremove.ai.person'))}</button>
        <button class="btn btn-ghost" id="brAiAnything">${esc(t('bgremove.ai.anything'))}</button>
      </div>
      <div class="tool-status" id="brAiSay"></div>
      <p class="tool-hint" id="brAiLicense"></p>
    </div>
    <div style="background-image:linear-gradient(45deg,var(--border) 25%,transparent 25%,transparent 75%,var(--border) 75%),linear-gradient(45deg,var(--border) 25%,transparent 25%,transparent 75%,var(--border) 75%); background-size:16px 16px; background-position:0 0,8px 8px; border-radius:var(--radius-xl); padding:8px; overflow:auto;">
      <canvas id="brCanvas" style="max-width:100%; display:block; margin:0 auto;"></canvas>
    </div>
    <p class="tool-hint">${esc(t('bgremove.note.limits'))}</p>`,
  result: () => '',
  setup,
});
