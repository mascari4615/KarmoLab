/**
 * 영상 용량 줄이기 (TASK-KL-088)
 *
 * 폰으로 찍은 1분 영상이 200MB인데 메일, 메신저, 제출 창구는 대개 그보다 작은 것만 받는다.
 * 그래서 사람들은 낯선 사이트에 영상을 통째로 올린다. 얼굴과 집이 찍힌 파일을.
 *
 * 브라우저에는 영상을 다시 엮는 기능이 없다. 대신 **재생하면서 작은 화면에 다시 그려 담을** 수 있다.
 * 즉 영상 길이만큼 시간이 걸린다. 우회가 아니라 유일한 길이라 숨기지 않고 남은 시간을 보여 준다.
 *
 * 얼마나 줄지는 해 봐야 알기에, 시작 전 어림값을 보여 주고 끝나면 실제 값으로 바꾼다.
 * 이미 잘 눌린 영상은 오히려 커질 수 있는데, 그때 줄었다고 우기지 않는다.
 */
import { attachMedia, fileSize as size, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { pickRecordType, attachVideo } from '@lab/widgets/tools/shared/video';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';


// captureStream 은 브라우저마다 있고 없고가 갈려 표준 타입에 없다. 있는지 보고 씀
type Capturable = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

function setup({ $, say }: ToolContext): ToolHandlers {
  const video = $<HTMLVideoElement>('#vcVideo');
  const scaleEl = $<HTMLInputElement>('#vcScale');
  const rateEl = $<HTMLInputElement>('#vcRate');
  const stats = $<HTMLElement>('#vcStats');
  const preview = $<HTMLVideoElement>('#vcPreview');
  const SCALES: Array<[number, string]> = [
    [0.35, t('videocompress.scale.tiny')],
    [0.5, t('videocompress.scale.half')],
    [0.7, t('videocompress.scale.bitSmall')],
    [1, t('videocompress.scale.same')]
  ];
  // 초당 비트 수가 용량을 좌우. 화면이 작으면 적은 값으로도 깨끗함
  const RATES: Array<[number, string]> = [
    [0.06, t('videocompress.rate.low')],
    [0.1, t('videocompress.rate.normal')],
    [0.16, t('videocompress.rate.good')],
    [0.25, t('videocompress.rate.best')]
  ];

  let fileName = '';
  let sourceSize = 0;
  let duration = 0;
  let sourceVersion = 0;
  let cancelActive: (() => void) | null = null;

  function outSize(): { w: number; h: number } {
    const s = SCALES[parseInt(scaleEl.value, 10) - 1][0];
    // 짝수로 맞춘다. 홀수 크기를 싫어하는 코덱이 있음
    const w = Math.max(2, Math.round((video.videoWidth * s) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * s) / 2) * 2);
    return { w, h };
  }

  function bitsPerSecond(): number {
    const { w, h } = outSize();
    return Math.round(w * h * 30 * RATES[parseInt(rateEl.value, 10) - 1][0]);
  }

  function refresh(): void {
    if (!duration) return;
    $<HTMLElement>('#vcScaleVal').textContent = SCALES[parseInt(scaleEl.value, 10) - 1][1];
    $<HTMLElement>('#vcRateVal').textContent = RATES[parseInt(rateEl.value, 10) - 1][1];
    const { w, h } = outSize();
    const guess = (bitsPerSecond() / 8) * duration;
    stats.innerHTML =
      statCell(t('videocompress.stat.srcSize'), size(sourceSize), true) +
      statCell(t('videocompress.stat.outDim'), `${w}×${h}`) +
      statCell(t('videocompress.stat.guess'), t('videocompress.value.about', { v: size(guess) })) +
      // 실시간으로 다시 담기 때문에 영상 길이만큼 걸린다. 미리 알려야 멈춘 건가 오해가 없음
      statCell(t('videocompress.stat.time'), t('videocompress.value.about', { v: mmss(duration) }));
  }

  function load(files: File[]): Promise<boolean> {
    const f = files[0];
    sourceVersion++;
    cancelActive?.();
    fileName = f.name;
    duration = 0;
    say(t('videocompress.say.loading'));
    sourceSize = f.size;
    // 녹화한 webm 은 길이가 안 적혀 있음. 되감기는 공용 attachVideo 몫
    return attachVideo(video, f).then(() => {
      duration = video.duration;
      refresh();
      say(t('videocompress.say.loaded', { name: f.name, size: size(f.size), w: video.videoWidth, h: video.videoHeight }), 'ok');
      return true;
    }).catch((error: Error) => { if (error.name !== 'AbortError') say(t('videocompress.err.open'), 'error'); return false; });
  }

  async function run(): Promise<ToolResult | null> {
    const version = sourceVersion;
    const { w, h } = outSize();
    const canvas = document.createElement('canvas') as Capturable;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.captureStream) {
      say(t('videocompress.err.unsupported'), 'error');
      return null;
    }
    const out = canvas.captureStream(30);
    const ownedTracks = new Set(out.getTracks());
    // 소리는 원본 영상에서 그대로. 다시 그리는 건 화면뿐
    if ($<HTMLInputElement>('#vcAudio').checked) {
      const withAudio = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      const src = withAudio.captureStream?.();
      src?.getTracks().forEach(track => ownedTracks.add(track));
      src?.getAudioTracks().forEach((t) => out.addTrack(t));
    }

    const mimeType = pickRecordType();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(out, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: bitsPerSecond()
    });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    });

    video.currentTime = 0;

    recorder.start(300);
    void video.play();

    let raf = 0;
    const draw = (): void => {
      ctx.drawImage(video, 0, 0, w, h);
      raf = requestAnimationFrame(draw);
    };
    draw();

    // 다른 탭으로 가면 브라우저가 화면 그리기를 멈춘다. 그 사이 구간이 정지 화면으로 담김
    // 막을 방법이 없으므로 **일어난 사실을 알린다**. 모르고 받아 가는 게 제일 나쁨
    let leftTab = false;
    const onHide = (): void => {
      if (document.hidden) leftTab = true;
    };
    document.addEventListener('visibilitychange', onHide);

    let cancelled = false;
    const stop = (cancelledByUser = false): void => {
      cancelled ||= cancelledByUser;
      cancelAnimationFrame(raf);
      window.clearInterval(watch);
      if (version === sourceVersion) video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      if (cancelled) ownedTracks.forEach(track => track.stop());
    };
    const cancel = (): void => stop(true);
    const onEnded = (): void => stop();

    video.onended = onEnded;

    const watch = window.setInterval(() => {
      const left = Math.max(0, duration - video.currentTime);
      say(t('videocompress.say.progress', { left: mmss(left) }));
    }, 300);
    cancelActive = cancel;

    const recorded = await finished;
    ownedTracks.forEach(track => track.stop());
    window.clearInterval(watch);
    document.removeEventListener('visibilitychange', onHide);
    if (video.onended === onEnded) video.onended = null;
    if (cancelActive === cancel) cancelActive = null;
    if (version !== sourceVersion) return null;
    if (cancelled) {
      say(t('videocompress.say.cancelled'));
      return null;
    }
    if (!recorded || recorded.size < 100) {
      say(t('videocompress.err.empty'), 'error');
      return null;
    }
    const made = recorded;
    attachMedia(preview, made);

    const pct = Math.round(Math.abs(1 - made.size / sourceSize) * 100);
    stats.innerHTML =
      statCell(t('videocompress.stat.srcSize'), size(sourceSize)) +
      statCell(t('videocompress.stat.newSize'), size(made.size), true) +
      statCell(
        t('videocompress.stat.change'),
        t(made.size < sourceSize ? 'videocompress.value.smaller' : 'videocompress.value.bigger', { pct })
      ) +
      statCell(t('videocompress.stat.dim'), `${w}×${h}`);
    // 이미 잘 눌린 영상은 다시 담으면 커짐
    if (leftTab) {
      say(t('videocompress.err.hidden'), 'error');
    } else if (made.size >= sourceSize) {
      say(t('videocompress.say.noGain', { from: size(sourceSize), to: size(made.size) }), 'error');
    } else {
      say(t('videocompress.say.done', { from: size(sourceSize), to: size(made.size), pct }), 'ok');
    }
    Toolbox.trackUse?.('compress');
    return {
      blob: made,
      name: fileName.replace(/\.[^.]+$/, '') + t('videocompress.file.suffix') + '.webm',
      savedMessage: t('videocompress.say.saved'),
    };
  }

  [scaleEl, rateEl].forEach((el) => el.addEventListener('input', refresh));

  return {
    load,
    run: () => run().catch((err: Error) => {
      say(t('videocompress.err.running', { msg: err.message }), 'error');
      return null;
    }),
    stop: () => cancelActive?.(),
  };
}

defineTool({
  id: 'videocompress',
  namespace: 'videocompress',
  tabLabel: () => t('videocompress.tab', undefined, '용량 줄이기'),
  ids: { drop: 'vcDrop', file: 'vcFile', status: 'vcStatus', run: 'vcRun', save: 'vcSave', stop: 'vcStop' },
  accept: 'video/*',
  dropLabel: () => t('videocompress.drop'),
  dropHint: () => t('videocompress.status.idle'),
  runLabel: () => t('videocompress.btn.run'),
  saveLabel: () => t('videocompress.btn.save'),
  stopLabel: () => t('videocompress.btn.stop'),
  body: () => `
    <video id="vcVideo" playsinline muted style="width:100%; max-height:300px; background:#000; border-radius:var(--radius-lg);"></video>

    <div class="tool-section field-group">
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('videocompress.label.scale'))} <span id="vcScaleVal" class="range-value">절반</span></div>
          <input type="range" id="vcScale" aria-label="화면 크기" min="1" max="4" step="1" value="2">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('videocompress.label.rate'))} <span id="vcRateVal" class="range-value">보통</span></div>
          <input type="range" id="vcRate" aria-label="화질" min="1" max="4" step="1" value="2">
        </div>
      </div>
      <div class="tool-chips">
        <label class="tool-chip"><input type="checkbox" id="vcAudio" checked> ${esc(t('videocompress.opt.audio'))}</label>
      </div>
    </div>

    <div class="cc-stats" id="vcStats"></div>`,
  result: () => `
  <div class="tool-sublabel">${esc(t('videocompress.label.result'))}</div>
  <video id="vcPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:var(--radius-lg);"></video>`,
  setup,
});

