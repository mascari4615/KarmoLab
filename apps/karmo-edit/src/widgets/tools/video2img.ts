/**
 * 영상에서 사진 뽑기 (TASK-KL-088)
 *
 * 이 장면 캡처해서 보내 줘가 필요할 때 대개 재생하다 화면을 찍는다. 그러면 화질이 화면 해상도에
 * 묶이고 UI 까지 같이 찍힌다. 영상 안의 원본 화면을 그대로 꺼내면 그럴 이유가 없다.
 *
 * 두 갈래를 다 둔다:
 *  - **지금 이 순간**. 재생하다 멈춘 그 장면 한 장 (섬네일 고를 때)
 *  - **일정 간격**. 몇 초마다 한 장씩 여러 장 (요약, 정리, 연속 동작 확인)
 * 뽑은 장은 눌러 하나씩 받거나 ZIP 으로 한 번에 받는다.
 */
import { fileSize as size, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { seekTo, downloadUrl, attachVideo } from '@lab/widgets/tools/shared/video';
import { encode } from '@lab/widgets/tools/shared/image';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';

interface Shot {
  time: number;
  blob: Blob;
  url: string;
}

function setup({ $, say, publish }: ToolContext): ToolHandlers {
  const video = $<HTMLVideoElement>('#viVideo');
  const grid = $<HTMLElement>('#viGrid');
  const stats = $<HTMLElement>('#viStats');
  const everyEl = $<HTMLInputElement>('#viEvery');
  const everyBtn = $<HTMLButtonElement>('#viEvery2');

  let fileName = '';
  let duration = 0;
  let shots: Shot[] = [];

  const extOf = (): string => {
    const f = $<HTMLSelectElement>('#viFormat').value;
    return f === 'image/png' ? 'png' : f === 'image/webp' ? 'webp' : 'jpg';
  };

  function render(): void {
    grid.innerHTML = shots
      .map(
        (s, i) =>
          `<figure style="margin:0; cursor:pointer;" data-i="${i}" title="${esc(t('video2img.row.download'))}">
             <img src="${s.url}" alt="${esc(t('video2img.alt.shot', { at: mmss(s.time) }))}" style="width:100%; border-radius:var(--radius-md); display:block; background:#000;">
             <figcaption class="tool-list-dim" style="text-align:center; padding-top:4px;">${mmss(s.time)}, ${size(s.blob.size)}</figcaption>
           </figure>`
      )
      .join('');
    grid.querySelectorAll('[data-i]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const s = shots[parseInt((el as HTMLElement).dataset.i || '0', 10)];
        downloadUrl(s.url, `${fileName.replace(/\.[^.]+$/, '')}-${mmss(s.time).replace(':', 'm')}s.${extOf()}`);
      };
    });

    if (shots.length) {
      const total = shots.reduce((a, s) => a + s.blob.size, 0);
      stats.innerHTML = statCell(t('video2img.stat.count'), t('video2img.value.shots', { n: shots.length }), true) + statCell(t('video2img.stat.size'), size(total)) + statCell(t('video2img.stat.duration'), mmss(duration));
    } else {
      stats.innerHTML = '';
    }
  }

  /** 그 시각의 화면을 원본 크기로 꺼낸다. 옮겨지기 전에 그리면 엉뚱한 장면이 담김 */
  async function grab(time: number): Promise<Shot> {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('video2img.err.canvas'));
    await seekTo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    /* 내보내기는 공용 것으로 (TASK-KL-272). JPG 는 투명을 못 담아, 그림이 아직 안 그려진
     * 자리가 있으면 **검게** 나온다. 공용 쪽이 흰 바탕을 먼저 깖 */
    const fmt = $<HTMLSelectElement>('#viFormat').value;
    const blob = await encode(canvas, fmt === 'image/jpeg' ? 'jpeg' : fmt === 'image/webp' ? 'webp' : 'png', 0.92);
    return { time: video.currentTime, blob, url: URL.createObjectURL(blob) };
  }

  function load(files: File[]): Promise<boolean> {
    const f = files[0];
    fileName = f.name;
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    shots = [];
    render();
    // 녹화한 webm 은 길이가 안 적혀 있음. 되감기는 공용 attachVideo 몫
    return attachVideo(video, f).then(() => {
      duration = video.duration;
      render();
      say(t('video2img.say.loaded', { name: f.name, len: mmss(duration), w: video.videoWidth, h: video.videoHeight }), 'ok');
      return true;
    }).catch((error: Error) => { if (error.name !== 'AbortError') say(t('video2img.err.open'), 'error'); return false; });
  }

  /** 한 장이면 그 그림, 여러 장이면 저장을 누를 때 ZIP 으로 묶음 */
  function pack(): ToolResult | null {
    if (!shots.length) return null;
    const base = fileName.replace(/\.[^.]+$/, '');
    if (shots.length === 1) {
      const s = shots[0];
      return { blob: s.blob, name: `${base}-${mmss(s.time).replace(':', 'm')}s.${extOf()}` };
    }
    const held = [...shots];
    const ext = extOf();
    return {
      name: base + t('video2img.file.zip'),
      savedMessage: t('video2img.say.zipped', { n: held.length }),
      blob: async () => {
        await Toolbox.ensureScript?.('vendor/jszip.min');
        const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
        const z = new Z();
        held.forEach((s, i) => z.file(`${String(i + 1).padStart(3, '0')}-${mmss(s.time).replace(':', 'm')}s.${ext}`, s.blob));
        return z.generateAsync({ type: 'blob' });
      },
    };
  }

  async function grabEvery(): Promise<void> {
    const every = parseInt(everyEl.value, 10) / 10;
    const count = Math.floor(duration / every) + 1;
    if (count> 200) {
      say(t('video2img.err.tooMany'), 'error');
      return;
    }
    video.pause();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    shots = [];
    for (let i = 0; i < count; i++) {
      say(t('video2img.say.working', { i: i + 1, n: count }));
      shots.push(await grab(i * every));
    }
    render();
    say(t('video2img.say.done', { n: shots.length }), 'ok');
    Toolbox.trackUse?.('frames');
  }

  everyEl.addEventListener('input', () => {
    $<HTMLElement>('#viEveryVal').textContent = (parseInt(everyEl.value, 10) / 10).toFixed(1) + t('video2img.unit.sec');
  });
  everyBtn.onclick = () => {
    everyBtn.disabled = true;
    void grabEvery()
      .then(() => publish(pack()))
      .catch((err: Error) => say(t('video2img.err.run') + err.message, 'error'))
      .finally(() => {
        everyBtn.disabled = false;
      });
  };
  $<HTMLButtonElement>('#viClear').onclick = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    shots = [];
    render();
    publish(null);
    say(t('video2img.say.cleared'));
  };

  return {
    load,
    async run() {
      video.pause();
      try {
        const s = await grab(video.currentTime);
        shots.push(s);
        render();
        say(t('video2img.say.one', { at: mmss(s.time) }), 'ok');
        Toolbox.trackUse?.('frame');
      } catch (err) {
        say(t('video2img.err.run') + (err as Error).message, 'error');
      }
      return pack();
    },
  };
}

defineTool({
  id: 'video2img',
  namespace: 'video2img',
  tabLabel: () => t('video2img.tab', undefined, '사진 뽑기'),
  ids: { drop: 'viDrop', file: 'viFile', status: 'viStatus', run: 'viNow', save: 'viZip' },
  accept: 'video/*',
  dropLabel: () => t('video2img.drop'),
  dropHint: () => t('video2img.status.idle'),
  runLabel: () => t('video2img.btn.now'),
  saveLabel: () => t('video2img.btn.zip'),
  actions: () => `<button class="btn btn-ghost" id="viEvery2">${esc(t('video2img.btn.every'))}</button>`,
  body: () => `
    <video id="viVideo" controls playsinline style="width:100%; max-height:340px; background:#000; border-radius:var(--radius-lg);"></video>

    <div class="tool-section field-group">
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('video2img.label.format'))}</div>
          <select id="viFormat" aria-label="${esc(t('video2img.aria.format'))}">
            <option value="image/png">${esc(t('video2img.format.png'))}</option>
            <option value="image/jpeg">${esc(t('video2img.format.jpg'))}</option>
            <option value="image/webp">${esc(t('video2img.format.webp'))}</option>
          </select>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('video2img.label.every'))} <span id="viEveryVal" class="range-value">${esc(t('video2img.value.every'))}</span></div>
          <input type="range" id="viEvery" aria-label="${esc(t('video2img.label.every'))}" min="5" max="300" step="5" value="20">
        </div>
      </div>
    </div>`,
  result: () => `
    <div class="cc-stats" id="viStats"></div>
    <div id="viGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px;"></div>`,
  resultActions: () => `<button class="btn btn-ghost" id="viClear">${esc(t('video2img.btn.clear'))}</button>`,
  setup,
});

