/**
 * 영상 돌리기, 뒤집기 (TASK-KL-088)
 *
 * 폰을 옆으로 들고 찍었는데 컴퓨터에서 열면 누워 있는 영상. 흔하고, 그때마다 편집기를 깔기는 아깝다.
 *
 * 신경 쓴 곳:
 *  - **돌리면 가로세로가 바뀐다.** 90도 돌린 뒤에도 원래 틀에 우겨넣으면 찌그러지거나 잘린다.
 *    그래서 90, 270도에서는 내보내는 틀 자체를 뒤집는다.
 *  - 소리는 원본에서 그대로 가져온다. 다시 그리는 건 화면뿐이다.
 *  - 담는 동안 다른 탭으로 가면 브라우저가 화면 그리기를 멈춰 그 구간이 정지 화면이 된다.
 *    막을 방법이 없으므로 **일어났으면 알려 준다.** 모르고 받아 가는 게 제일 나쁘다.
 */
import { pickRecordType } from '@lab/widgets/tools/shared/video';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { attachMedia, fileSize as size, mmss } from '@lab/widgets/tools/shared/media';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';


type Capturable = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

function setup({ root: container, $, say }: ToolContext): ToolHandlers {
  const video = $<HTMLVideoElement>('#vrVideo');
  const canvas = $<HTMLCanvasElement>('#vrCanvas') as Capturable;
  const stats = $<HTMLElement>('#vrStats');
  const result = $<HTMLVideoElement>('#vrResult');

  let turn = 0;
  let baseName = t('videorotate.file.base');
  let recorder: MediaRecorder | null = null;
  let stopActive: (() => void) | null = null;

  /** 90, 270도에서는 가로세로가 바뀐다. 안 바꾸면 찌그러지거나 잘림 */
  function outSize(): { w: number; h: number } {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    return turn === 90 || turn === 270 ? { w: vh, h: vw } : { w: vw, h: vh };
  }

  /** 한 장면을 돌리고 뒤집어 캔버스에 그린다 (미리보기와 담기가 같은 길을 쓴다) */
  function paint(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || !video.videoWidth) return;
    const { w, h } = outSize();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((turn * Math.PI) / 180);
    const fh = $<HTMLInputElement>('#vrFlipH').checked ? -1 : 1;
    const fv = $<HTMLInputElement>('#vrFlipV').checked ? -1 : 1;
    ctx.scale(fh, fv);
    ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
    ctx.restore();
  }

  function showStats(): void {
    const { w, h } = outSize();
    stats.innerHTML =
      statCell(t('videorotate.stat.out'), `${w}×${h}`, true) +
      statCell(t('videorotate.stat.src'), `${video.videoWidth}×${video.videoHeight}`) +
      statCell(t('videorotate.stat.length'), mmss(video.duration || 0));
  }

  function load(files: File[]): Promise<boolean> {
    const file = files[0];
    attachMedia(video, file);
    baseName = (file.name || t('videorotate.file.base')).replace(/\.[^.]+$/, '');
    return new Promise((resolve) => {
      video.onloadeddata = () => {
        // 첫 프레임 seek 완료 뒤 표시. loadeddata 직후에는 빈 그림을 읽을 수 있음
        video.onseeked = () => {
          video.onseeked = () => paint();
          paint();
          showStats();
          say(t('videorotate.say.ready'), 'ok');
          resolve(true);
        };
        video.currentTime = 0;
      };
      video.onerror = () => {
        say(t('videorotate.err.open'), 'error');
        resolve(false);
      };
    });
  }

  async function record(): Promise<ToolResult | null> {
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.captureStream) {
      say(t('videorotate.err.unsupported'), 'error');
      return null;
    }

    const out = canvas.captureStream(30);
    if ($<HTMLInputElement>('#vrAudio').checked) {
      const withAudio = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      withAudio.captureStream?.().getAudioTracks().forEach((t) => out.addTrack(t));
    }
    const mimeType = pickRecordType();
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(out, { ...(mimeType ? { mimeType } : {}) });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    });

    video.currentTime = 0;

    recorder.start(300);
    void video.play();

    let raf = 0;
    const draw = (): void => {
      paint();
      raf = requestAnimationFrame(draw);
    };
    draw();

    // 다른 탭으로 가면 그리기가 멈춰 그 구간이 정지 화면으로 담긴다. 막을 수 없으니 알림
    let leftTab = false;
    const onHide = (): void => {
      if (document.hidden) leftTab = true;
    };
    document.addEventListener('visibilitychange', onHide);

    const stop = (): void => {
      cancelAnimationFrame(raf);
      video.pause();
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    };
    stopActive = stop;
    video.onended = stop;
    say(t('videorotate.say.recording'));

    const made = await finished;
    stopActive = null;
    document.removeEventListener('visibilitychange', onHide);
    attachMedia(result, made);
    const { w, h } = outSize();
    stats.innerHTML =
      statCell(t('videorotate.stat.out'), `${w}×${h}`, true) +
      statCell(t('videorotate.stat.src'), `${video.videoWidth}×${video.videoHeight}`) +
      statCell(t('videorotate.stat.size'), size(made.size));
    say(leftTab ? t('videorotate.say.doneHidden') : t('videorotate.say.done'), leftTab ? 'error' : 'ok');
    Toolbox.trackUse?.('rotate');
    return {
      blob: made,
      name: baseName + t('videorotate.file.suffix') + '.webm',
      savedMessage: t('videorotate.say.saved', { size: size(made.size) }),
    };
  }

  container.querySelectorAll('#vrTurns .tool-chip').forEach((chip) => {
    (chip as HTMLButtonElement).onclick = () => {
      container.querySelectorAll('#vrTurns .tool-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      turn = Number((chip as HTMLElement).dataset.turn);
      paint();
      showStats();
    };
  });
  ['#vrFlipH', '#vrFlipV'].forEach((s) => $<HTMLInputElement>(s).addEventListener('change', () => paint()));

  return { load, run: record, stop: () => stopActive?.() };
}

defineTool({
  id: 'videorotate',
  namespace: 'videorotate',
  tabLabel: () => t('videorotate.tab', undefined, '돌리기'),
  ids: { drop: 'vrDrop', file: 'vrFile', status: 'vrStatus', run: 'vrRun', save: 'vrSave', stop: 'vrStop' },
  accept: 'video/*',
  dropLabel: () => t('videorotate.drop'),
  dropHint: () => t('videorotate.status.idle'),
  runLabel: () => t('videorotate.btn.run'),
  saveLabel: () => t('videorotate.btn.save'),
  stopLabel: () => t('videorotate.btn.stop'),
  body: () => `
    <div class="field-group" id="vrControls">
    <div class="tool-sublabel">${esc(t('videorotate.label.turn'))}</div>
    <div class="tool-chips" id="vrTurns">
      <button type="button" class="tool-chip active" data-turn="0">${esc(t('videorotate.turn.0'))}</button>
      <button type="button" class="tool-chip" data-turn="90">${esc(t('videorotate.turn.90'))}</button>
      <button type="button" class="tool-chip" data-turn="180">${esc(t('videorotate.turn.180'))}</button>
      <button type="button" class="tool-chip" data-turn="270">${esc(t('videorotate.turn.270'))}</button>
    </div>
    <div class="tool-chips">
      <label class="tool-chip"><input type="checkbox" id="vrFlipH"> ${esc(t('videorotate.opt.flipH'))}</label>
      <label class="tool-chip"><input type="checkbox" id="vrFlipV"> ${esc(t('videorotate.opt.flipV'))}</label>
      <label class="tool-chip"><input type="checkbox" id="vrAudio" checked> ${esc(t('videorotate.opt.audio'))}</label>
    </div>
    </div>
    <video id="vrVideo" playsinline muted style="display:none;"></video>
    <div id="vrStage">
    <div class="tool-sublabel">${esc(t('videorotate.label.preview'))}</div>
    <canvas id="vrCanvas" style="max-width:100%; border-radius:var(--radius-xl); display:block; border:1px solid var(--border);"></canvas>
    </div>
    <div class="cc-stats" id="vrStats"></div>`,
  result: () => `<video id="vrResult" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:var(--radius-lg);"></video>`,
  setup,
});

