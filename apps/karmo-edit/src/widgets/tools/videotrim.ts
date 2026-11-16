/**
 * 영상 자르기 (TASK-KL-088)
 *
 * 필요한 건 대개 2분짜리 영상의 10초다. 그 10초를 잘라 보내려고 영상 전체를 올리는 건 앞뒤가 안 맞는다.
 *
 * 브라우저에는 영상을 다시 엮는 기능이 없다. 대신 **재생하면서 그 화면과 소리를 그대로 녹화**할 수 있다.
 * 그래서 이 도구는 고른 구간을 실제로 재생하며 담는다. 즉 **자르는 데 그 구간만큼 시간이 걸린다**.
 * 이건 우회가 아니라 브라우저에서 가능한 유일한 길이라, 숨기지 않고 남은 시간을 보여 준다.
 */
import { seekTo, pickRecordType, attachVideo } from '@lab/widgets/tools/shared/video';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { attachMedia } from '@lab/widgets/tools/shared/media';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';


const size = (n: number): string =>
  n>= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n>= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

const mmss = (sec: number): string => {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
};

interface Capturable extends HTMLVideoElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

function setup({ $, say }: ToolContext): ToolHandlers {
  const video = $<Capturable>('#vtVideo');
  const startEl = $<HTMLInputElement>('#vtStart');
  const endEl = $<HTMLInputElement>('#vtEnd');
  const stats = $<HTMLElement>('#vtStats');
  const preview = $<HTMLVideoElement>('#vtPreview');

  let fileName = '';
  let duration = 0;
  let sourceVersion = 0;
  let cancelActive: (() => void) | null = null;
  let rangeTimer = 0;

  const startSec = (): number => (parseInt(startEl.value, 10) / 1000) * duration;
  const endSec = (): number => (parseInt(endEl.value, 10) / 1000) * duration;

  function refresh(): void {
    if (!duration) return;
    if (parseInt(startEl.value, 10)>= parseInt(endEl.value, 10)) {
      if (document.activeElement === startEl) endEl.value = String(Math.min(1000, parseInt(startEl.value, 10) + 10));
      else startEl.value = String(Math.max(0, parseInt(endEl.value, 10) - 10));
    }
    const s = startSec(), e = endSec();
    const span = Math.max(0, e - s);
    $<HTMLElement>('#vtRangeLabel').textContent = t('videotrim.value.rangeOf', { from: mmss(s), to: mmss(e), sec: span.toFixed(1) }) + ``;
    stats.innerHTML =
      statCell(t('videotrim.stat.cut'), t('videotrim.value.sec', { n: span.toFixed(1) }), true) +
      statCell(t('videotrim.stat.total'), mmss(duration)) +
      // 실시간 녹화라 걸리는 시간이 구간 길이와 같다. 미리 알림 멈춘 건가 오해가 없음
      statCell(t('videotrim.stat.eta'), t('videotrim.value.about', { n: Math.ceil(span) }));
  }

  function load(files: File[]): Promise<boolean> {
    const f = files[0];
    sourceVersion++;
    cancelActive?.();
    fileName = f.name;
    duration = 0;
    say(t('videotrim.say.loading'));
    // 녹화한 webm 은 길이가 안 적혀 있음. 되감기는 공용 attachVideo 몫
    return attachVideo(video, f).then(() => {
      duration = video.duration;
      startEl.value = '0';
      endEl.value = '1000';
      video.currentTime = 0;
      refresh();
      say(t('videotrim.say.loaded', { name: f.name, len: mmss(duration) }), 'ok');
      return true;
    }).catch((error: Error) => { if (error.name !== 'AbortError') say(t('videotrim.err.open'), 'error'); return false; });
  }

  async function run(): Promise<ToolResult | null> {
    const version = sourceVersion;
    const s = startSec(), e = endSec();
    const span = e - s;
    if (span <= 0) {
      say(t('videotrim.err.noRange'), 'error');
      return null;
    }
    const grab = video.captureStream || video.mozCaptureStream;
    if (!grab) {
      say(t('videotrim.err.unsupported'), 'error');
      return null;
    }
    const stream = grab.call(video);
    const ownedTracks = stream.getTracks();
    if (!$<HTMLInputElement>('#vtAudio').checked) {
      stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
    }
    const mimeType = pickRecordType();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };

    let cancelBeforeStart!: () => void;
    const finished = new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
      cancelBeforeStart = () => resolve(null);
    });
    let watch = 0;
    let cancelled = false;
    const stop = (cancelledByUser = false): void => {
      cancelled ||= cancelledByUser;
      window.clearInterval(watch);
      if (version === sourceVersion) video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      else if (cancelled) cancelBeforeStart();
      if (cancelled) ownedTracks.forEach(track => track.stop());
    };
    const cancel = (): void => stop(true);
    cancelActive = cancel;
    await seekTo(video, s);
    if (cancelled || version !== sourceVersion) stop(true);
    else {

      recorder.start(200);
      void video.play();
      const t0 = performance.now();
      watch = window.setInterval(() => {
        const left = Math.max(0, span - (performance.now() - t0) / 1000);
        say(t('videotrim.say.recording', { left: left.toFixed(1) }));
        if (video.currentTime >= e - 0.03 || left <= 0) stop();
      }, 100);
    }

    const recorded = await finished;
    ownedTracks.forEach(track => track.stop());
    if (cancelActive === cancel) cancelActive = null;
    if (version !== sourceVersion) return null;
    if (cancelled) {
      say(t('videotrim.say.cancelled'));
      return null;
    }
    if (!recorded || recorded.size < 100) {
      say(t('videotrim.err.empty'), 'error');
      return null;
    }
    attachMedia(preview, recorded);
    say(t('videotrim.say.done', { sec: span.toFixed(1), size: size(recorded.size) }), 'ok');
    Toolbox.trackUse?.('trim');
    return {
      blob: recorded,
      name: fileName.replace(/\.[^.]+$/, '') + t('videotrim.file.suffix'),
      savedMessage: t('videotrim.say.saved'),
    };
  }

  [startEl, endEl].forEach((el) => el.addEventListener('input', refresh));
  startEl.addEventListener('input', () => {
    video.currentTime = startSec();
  });
  endEl.addEventListener('input', () => {
    video.currentTime = endSec();
  });
  $<HTMLButtonElement>('#vtHere').onclick = () => {
    startEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
    refresh();
  };
  $<HTMLButtonElement>('#vtHereEnd').onclick = () => {
    endEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
    refresh();
  };
  $<HTMLButtonElement>('#vtPlayRange').onclick = () => {
    window.clearTimeout(rangeTimer);
    video.currentTime = startSec();
    void video.play();
    rangeTimer = window.setTimeout(() => video.pause(), Math.max(100, (endSec() - startSec()) * 1000));
  };

  return {
    load,
    run: () => run().catch((err: Error) => {
      say(t('videotrim.err.run') + err.message, 'error');
      return null;
    }),
    stop: () => cancelActive?.(),
  };
}

defineTool({
  id: 'videotrim',
  namespace: 'videotrim',
  tabLabel: () => t('videotrim.tab', undefined, '자르기'),
  ids: { drop: 'vtDrop', file: 'vtFile', status: 'vtStatus', run: 'vtRun', save: 'vtSave', stop: 'vtStop' },
  accept: 'video/*',
  dropLabel: () => t('videotrim.drop'),
  dropHint: () => t('videotrim.status.idle'),
  runLabel: () => t('videotrim.btn.run'),
  saveLabel: () => t('videotrim.btn.save'),
  stopLabel: () => t('videotrim.btn.stop'),
  body: () => `
    <video id="vtVideo" playsinline controls style="width:100%; max-height:340px; background:#000; border-radius:var(--radius-lg);"></video>

    <div class="tool-section field-group">
      <div class="tool-sublabel">${esc(t('videotrim.label.range'))} <span id="vtRangeLabel" class="range-value">${esc(t('videotrim.value.range'))}</span></div>
      <input type="range" id="vtStart" aria-label="${esc(t('videotrim.aria.start'))}" min="0" max="1000" value="0" step="1">
      <input type="range" id="vtEnd" aria-label="${esc(t('videotrim.aria.end'))}" min="0" max="1000" value="1000" step="1" style="margin-top:6px;">
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="vtHere">${esc(t('videotrim.btn.here'))}</button>
        <button class="btn btn-ghost btn-sm" id="vtHereEnd">${esc(t('videotrim.btn.hereEnd'))}</button>
        <button class="btn btn-ghost btn-sm" id="vtPlayRange">${esc(t('videotrim.btn.play'))}</button>
      </div>
    </div>

    <div class="tool-section-end tool-chips">
      <label class="tool-chip"><input type="checkbox" id="vtAudio" checked> ${esc(t('videotrim.opt.audio'))}</label>
    </div>

    <div class="cc-stats" id="vtStats"></div>`,
  result: () => `
  <div class="tool-sublabel">${esc(t('videotrim.label.result'))}</div>
  <video id="vtPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:var(--radius-lg);"></video>`,
  setup,
});

