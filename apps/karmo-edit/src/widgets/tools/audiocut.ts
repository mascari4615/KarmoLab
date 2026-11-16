/**
 * 오디오 자르기 (TASK-KL-088)
 *
 * 벨소리나 인용 구간을 만들려고 음원을 사이트에 올리면 저작물이 남의 서버에 남는다.
 * 브라우저는 이미 오디오를 해독할 수 있으므로(Web Audio) 잘라 내는 일은 밖으로 나갈 필요가 없다.
 * 내보내기는 MP3(작아서 보내기 좋음)와 WAV(손실 없음) 중 고른다. MP3 압축기는 그때만 받아 온다.
 */
import { attachAudio, audioCtx, encodeAudio, fileSize as size, loadAudioInfo, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';

function setup({ $, say }: ToolContext): ToolHandlers {
  const player = $<HTMLAudioElement>('#acPlayer');
  const canvas = $<HTMLCanvasElement>('#acWave');
  const startEl = $<HTMLInputElement>('#acStart');
  const endEl = $<HTMLInputElement>('#acEnd');
  const stats = $<HTMLElement>('#acStats');
  let buffer: AudioBuffer | null = null;
  // 파일의 원래 표본률. buffer.sampleRate 는 재생 장치 값
  let rate = 0;
  let fileName = 'audio';

  /** 파형은 최댓값만 훑어 그린다. 전 샘플을 그리면 긴 곡에서 멈춤 */
  function drawWave(): void {
    if (!buffer) return;
    const w = (canvas.width = canvas.clientWidth * 2);
    const h = (canvas.height = 240);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    ctx.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5865F2';
    ctx.fillStyle = accent;
    for (let x = 0; x < w; x++) {
      let peak = 0;
      for (let i = 0; i < step; i++) {
        const v = Math.abs(data[x * step + i] || 0);
        if (v> peak) peak = v;
      }
      const barH = Math.max(1, peak * h * 0.9);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, (h - barH) / 2, 1, barH);
    }
    // 고른 구간을 덮어 표시
    const s = (parseFloat(startEl.value) / 100) * w;
    const e = (parseFloat(endEl.value) / 100) * w;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, h);
    ctx.fillRect(e, 0, w - e, h);
  }

  function times(): [number, number] {
    if (!buffer) return [0, 0];
    const d = buffer.duration;
    let s = (parseFloat(startEl.value) / 100) * d;
    let e = (parseFloat(endEl.value) / 100) * d;
    if (s> e) [s, e] = [e, s];
    return [s, e];
  }

  function refresh(): void {
    if (!buffer) return;
    const [s, e] = times();
    $<HTMLElement>('#acStartVal').textContent = mmss(s);
    $<HTMLElement>('#acEndVal').textContent = mmss(e);
    stats.innerHTML =
      statCell(t('audiocut.stat.picked'), mmss(e - s), true) +
      statCell(t('audiocut.stat.total'), mmss(buffer.duration)) +
      statCell(t('audiocut.stat.rate'), `${(rate / 1000).toFixed(1)} kHz`) +
      statCell(t('audiocut.stat.channels'), buffer.numberOfChannels === 1 ? t('audiocut.value.mono') : t('audiocut.value.stereo'));
    drawWave();
  }

  async function load(files: File[]): Promise<boolean> {
    const file = files[0];
    say(t('audiocut.say.opening'));
    fileName = file.name.replace(/\.[^.]+$/, '');
    try {
      ({ buffer, rate } = await loadAudioInfo(file));
    } catch {
      say(t('audiocut.err.format'), 'error');
      return false;
    }
    attachAudio(player, file);
    startEl.value = '0';
    endEl.value = '100';
    say(t('audiocut.say.loaded', { len: mmss(buffer.duration) }), 'ok');
    Toolbox.trackUse?.('open');
    return true;
  }

  function slice(): AudioBuffer | null {
    if (!buffer) return null;
    const [s, e] = times();
    const rate = buffer.sampleRate;
    const from = Math.floor(s * rate);
    const len = Math.max(1, Math.floor((e - s) * rate));
    const ctx = audioCtx();
    const out = ctx.createBuffer(buffer.numberOfChannels, len, rate);
    const fade = $<HTMLInputElement>('#acFade').checked ? Math.floor(rate * 0.05) : 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < len; i++) {
        let v = src[from + i] || 0;
        // 자른 자리에서 파형이 뚝 끊기면 딸깍 소리가 난다. 앞뒤를 짧게 눕힘
        if (fade) {
          if (i < fade) v *= i / fade;
          else if (i> len - fade) v *= (len - i) / fade;
        }
        dst[i] = v;
      }
    }
    return out;
  }


  [startEl, endEl].forEach((el) => el.addEventListener('input', refresh));

  $<HTMLButtonElement>('#acPreview').onclick = () => {
    const [s, e] = times();
    player.currentTime = s;
    void player.play();
    const stop = (): void => {
      if (player.currentTime>= e) {
        player.pause();
        player.removeEventListener('timeupdate', stop);
      }
    };
    player.addEventListener('timeupdate', stop);
  };

  window.addEventListener('resize', drawWave);

  return {
    load,
    shown: refresh,
    async run() {
      const out = slice();
      if (!out) return null;
      const format = $<HTMLSelectElement>('#acFormat').value as 'wav' | 'mp3';
      say(format === 'mp3' ? t('audiocut.say.encoding') : t('audiocut.say.saving'));
      try {
        const blob = await encodeAudio(out, format);
        attachAudio($<HTMLAudioElement>('#acResult'), blob);
        say(t('audiocut.say.done', { len: mmss(out.duration), size: size(blob.size) }), 'ok');
        Toolbox.trackUse?.('cut');
        return { blob, name: `${fileName}${t('audiocut.file.suffix')}.${format}` };
      } catch (err) {
        say(t('audiocut.err.run') + (err as Error).message, 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'audiocut',
  namespace: 'audiocut',
  tabLabel: () => t('audiocut.tab', undefined, '오디오'),
  ids: { drop: 'acDrop', file: 'acFile', status: 'acStatus', run: 'acRun', save: 'acSave' },
  accept: 'audio/*',
  dropLabel: () => t('audiocut.drop'),
  dropHint: () => t('audiocut.status.idle'),
  runLabel: () => t('audiocut.btn.run'),
  saveLabel: () => t('audiocut.btn.save'),
  actions: () => `<button class="btn btn-ghost" id="acPreview">${esc(t('audiocut.btn.preview'))}</button>`,
  body: () => `
    <audio id="acPlayer" controls style="width:100%"></audio>
    <canvas id="acWave" class="ac-wave"></canvas>
    <div class="field-group">
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('audiocut.label.start'))} <span id="acStartVal" class="range-value">0:00</span></div>
          <input type="range" id="acStart" aria-label="${esc(t('audiocut.aria.start'))}" min="0" max="100" value="0" step="0.1">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('audiocut.label.end'))} <span id="acEndVal" class="range-value">0:00</span></div>
          <input type="range" id="acEnd" aria-label="${esc(t('audiocut.aria.end'))}" min="0" max="100" value="100" step="0.1">
        </div>
      </div>
      <div class="tool-chips">
        <label class="tool-chip"><input type="checkbox" id="acFade" checked> ${esc(t('audiocut.opt.fade'))}</label>
        <select id="acFormat" aria-label="${esc(t('audiocut.label.format'))}"><option value="mp3">${esc(t('audiocut.format.mp3'))}</option><option value="wav">${esc(t('audiocut.format.wav'))}</option></select>
      </div>
    </div>
    <div class="cc-stats" id="acStats"></div>`,
  result: () => `<audio id="acResult" controls style="width:100%"></audio>`,
  setup,
});
