/**
 * 소리 크기 맞추기 (TASK-KL-088)
 *
 * 강의 녹음이나 회의 녹음은 어떤 대목은 안 들리고 어떤 대목은 귀가 아픈 상태가 되기 쉽다.
 * 볼륨을 올리는 것만으로는 안 된다. 큰 데가 먼저 찌그러지기 때문이다.
 *
 * 그래서 두 단계로 한다:
 *  ① **고르게(압축)**. 큰 소리만 눌러 큰 데와 작은 데의 차이를 좁힌다
 *  ② **키우기(정규화)**. 그 뒤에 전체를 목표 크기까지 올린다
 * 순서가 반대면 찌그러진다. 처리 전후를 **숫자와 파형으로 나란히** 보여 주고, 귀로도 비교하게 한다.
 */
import { attachAudio, audioCtx, encodeAudio, fileSize as size, loadAudio, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';


/** 소리의 체감 크기. 순간 최대값이 아니라 평균 에너지라 사람이 느끼는 크기에 가깝음 */
function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, data.length));
}

function peakOf(data: Float32Array): number {
  let p = 0;
  for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
  return p;
}

const db = (v: number): string => (v <= 0.00001 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}`);

/** 파형을 그린다. 숫자만으로는 고르게 됐다가 안 와닿음 */
function drawWave(canvas: HTMLCanvasElement, data: Float32Array, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth || 600);
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, h / 2 - 0.5, w, 1);
  ctx.fillStyle = color;
  const step = Math.max(1, Math.floor(data.length / w));
  for (let x = 0; x < w; x++) {
    let max = 0;
    for (let i = x * step; i < (x + 1) * step && i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    const bar = Math.max(1, max * h * 0.94);
    ctx.fillRect(x, (h - bar) / 2, 1, bar);
  }
}

function setup({ $, say }: ToolContext): ToolHandlers {
  const stats = $<HTMLElement>('#alStats');
  const evenEl = $<HTMLInputElement>('#alEven');
  const targetEl = $<HTMLInputElement>('#alTarget');

  const EVEN: Array<[number, string]> = [
    [1, t('audiolevel.even.none')],
    [0.7, t('audiolevel.even.light')],
    [0.5, t('audiolevel.even.normal')],
    [0.32, t('audiolevel.even.strong')]
  ];

  let fileName = '';
  let source: AudioBuffer | null = null;

  function labels(): void {
    $<HTMLElement>('#alEvenVal').textContent = EVEN[parseInt(evenEl.value, 10)][1];
    $<HTMLElement>('#alTargetVal').textContent = `${parseFloat(targetEl.value).toFixed(1)} dB`;
  }

  function drawSource(): void {
    if (source) drawWave($<HTMLCanvasElement>('#alBefore'), source.getChannelData(0), '#7a8894');
    drawWave($<HTMLCanvasElement>('#alAfter'), new Float32Array(0), '#4bb3e0');
  }

  /**
   * 큰 소리를 눌러 크고 작음의 차이를 좁힌 뒤(①) 전체를 목표까지 올린다(②).
   * 누르는 정도는 지수로 준다. 곱셈으로 줄이면 작은 소리까지 같이 줄어 아무 소용이 없음
   */
  async function process(buffer: AudioBuffer, ctx: AudioContext): Promise<AudioBuffer> {
    const ratio = EVEN[parseInt(evenEl.value, 10)][0];
    const target = Math.pow(10, parseFloat(targetEl.value) / 20);
    const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    // 표본 하나하나를 만지는 일이라 1시간 녹음이면 3억 번이 넘는다. 한 번에 돌면 그동안
    // 화면이 통째로 멈춰 먹통이 됐나 싶어진다. 조금씩 끊어 돌며 진행률을 표시
    const CHUNK = 2_000_000;
    const total = buffer.length * buffer.numberOfChannels * 2; // 두 번 훑음
    let done = 0;
    const breathe = async (): Promise<void> => {
      say(`맞추는 중... ${Math.min(99, Math.round((done / total) * 100))}%`);
      await new Promise((r) => setTimeout(r, 0));
    };

    let maxAfter = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const from = buffer.getChannelData(c);
      const to = out.getChannelData(c);
      for (let i = 0; i < from.length; i++) {
        const v = from[i];
        // 부호는 그대로 두고 크기만 눌러야 소리가 뒤집히지 않음
        const shaped = ratio === 1 ? v : Math.sign(v) * Math.pow(Math.abs(v), ratio);
        to[i] = shaped;
        const abs = shaped < 0 ? -shaped : shaped;
        if (abs> maxAfter) maxAfter = abs;
        if (++done % CHUNK === 0) await breathe();
      }
    }
    // 목표를 넘지 않도록 한 번에 맞춤. 넘으면 찌그러짐
    const gain = maxAfter> 0 ? target / maxAfter : 1;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const to = out.getChannelData(c);
      for (let i = 0; i < to.length; i++) {
        to[i] = Math.max(-1, Math.min(1, to[i] * gain));
        if (++done % CHUNK === 0) await breathe();
      }
    }
    return out;
  }

  [evenEl, targetEl].forEach((el) => el.addEventListener('input', labels));
  labels();

  return {
    shown: drawSource,
    async load(files) {
      const f = files[0];
      fileName = f.name;
      say(`${f.name}, ${size(f.size)} 를 읽는 중...`);
      try {
        source = await loadAudio(f);
      } catch {
        say(t('audiolevel.err.decode'), 'error');
        return false;
      }
      const ch0 = source.getChannelData(0);
      drawSource();
      stats.innerHTML =
        statCell(t('audiolevel.stat.length'), mmss(source.duration), true) +
        statCell(t('audiolevel.stat.peak'), `${db(peakOf(ch0))} dB`) +
        statCell(t('audiolevel.stat.loudness'), `${db(rms(ch0))} dB`);
      say(t('audiolevel.say.ready'), 'ok');
      return true;
    },
    async run() {
      if (!source) {
        say(t('audiolevel.err.noFile'), 'error');
        return null;
      }
      try {
        const held = source;
        const out = await process(held, audioCtx());
        const before = held.getChannelData(0);
        const after = out.getChannelData(0);
        drawWave($<HTMLCanvasElement>('#alAfter'), after, '#4bb3e0');
        const format = $<HTMLSelectElement>('#alFormat').value as 'wav' | 'mp3';
        say(t(format === 'mp3' ? 'audiolevel.say.encoding' : 'audiolevel.say.saving'));
        const blob = await encodeAudio(out, format);
        attachAudio($<HTMLAudioElement>('#alPreview'), blob);
        // 고른 정도는 큰 소리와 체감 크기의 간격으로 판정
        const spanBefore = 20 * Math.log10(peakOf(before) / Math.max(1e-6, rms(before)));
        const spanAfter = 20 * Math.log10(peakOf(after) / Math.max(1e-6, rms(after)));
        stats.innerHTML =
          statCell(t('audiolevel.stat.loudness'), `${db(rms(before))} → ${db(rms(after))} dB`, true) +
          statCell(t('audiolevel.stat.peak'), `${db(peakOf(before))} → ${db(peakOf(after))} dB`) +
          statCell(t('audiolevel.stat.span'), `${spanBefore.toFixed(1)} → ${spanAfter.toFixed(1)} dB`) +
          statCell(t('audiolevel.stat.size'), size(blob.size));
        say(t('audiolevel.say.done', { before: spanBefore.toFixed(1), after: spanAfter.toFixed(1) }), 'ok');
        Toolbox.trackUse?.('level');
        return {
          blob,
          name: fileName.replace(/\.[^.]+$/, '') + t('audiolevel.file.suffix') + '.' + format,
          savedMessage: `${size(blob.size)} 로 내려받았어요.`,
        };
      } catch (err) {
        say(t('audiolevel.err.leveling', { msg: (err as Error).message }), 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'audiolevel',
  namespace: 'audiolevel',
  tabLabel: () => t('audiolevel.tab', undefined, '크기 맞추기'),
  ids: { drop: 'alDrop', file: 'alFile', status: 'alStatus', run: 'alRun', save: 'alSave' },
  accept: 'audio/*,video/*',
  dropLabel: () => t('audiolevel.drop'),
  dropHint: () => t('audiolevel.status.idle'),
  runLabel: () => t('audiolevel.btn.run'),
  saveLabel: () => t('audiolevel.btn.save'),
  body: () => `
    <div class="tool-sublabel">${esc(t('audiolevel.label.before'))}</div>
    <canvas id="alBefore" height="70" style="width:100%; height:70px; border-radius:var(--radius-lg); background:var(--bg-secondary); display:block;"></canvas>
    <div class="tool-sublabel">${esc(t('audiolevel.label.after'))}</div>
    <canvas id="alAfter" height="70" style="width:100%; height:70px; border-radius:var(--radius-lg); background:var(--bg-secondary); display:block;"></canvas>
    <div class="field-group">
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('audiolevel.label.even'))} <span id="alEvenVal" class="range-value">보통</span></div>
          <input type="range" id="alEven" aria-label="고르게 하는 정도" min="0" max="3" step="1" value="2">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('audiolevel.label.target'))} <span id="alTargetVal" class="range-value">-1.0 dB</span></div>
          <input type="range" id="alTarget" aria-label="목표 크기" min="-12" max="-1" step="1" value="-1">
        </div>
      </div>
      <div class="tool-chips">
        <select id="alFormat" aria-label="저장 형식">
          <option value="mp3">${esc(t('audiolevel.format.mp3'))}</option>
          <option value="wav">${esc(t('audiolevel.format.wav'))}</option>
        </select>
      </div>
    </div>
    <div class="cc-stats" id="alStats"></div>`,
  result: () => `
    <div class="tool-sublabel">${esc(t('audiolevel.label.preview'))}</div>
    <audio class="full" id="alPreview" controls></audio>`,
  setup,
});

