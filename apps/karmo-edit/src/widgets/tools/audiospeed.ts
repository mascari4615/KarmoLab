/**
 * 소리 속도 바꾸기 (TASK-KL-088)
 *
 * 강의 녹음이나 회의록을 1.5배로 줄여 듣는 일은 흔하다. 그런데 그냥 빨리 돌리면 **목소리가
 * 변한다**. 다람쥐 소리가 되면 오래 못 듣는다. 그건 소리를 통째로 늘였다 줄이는 방식이라
 * 높이(음정)까지 같이 바뀌기 때문이다.
 *
 * 그래서 기본은 **목소리를 그대로 두고 길이만 바꾼다.** 소리를 짧은 조각으로 잘라, 겹치는
 * 부분을 부드럽게 이어 붙이며 조각 사이의 간격만 조절한다(겹쳐 잇기). 높이는 건드리지 않는다.
 * 그냥 빠르게도 남겨 뒀다. 효과음이나 배속 감상용으로 일부러 쓰는 사람이 있다.
 */
import { attachAudio, audioCtx, encodeAudio, fileSize as size, loadAudio, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';


/**
 * 겹쳐 잇기(overlap-add). 조각을 잘라 겹치는 자리를 서로 녹여 붙임
 * 조각을 그냥 이어 붙이면 이음매마다 딱딱 소리가 난다. 그래서 겹치는 구간에서
 * 앞 조각은 서서히 줄이고 뒤 조각은 서서히 키워 서로 넘김
 */
function stretch(input: Float32Array, rate: number, sampleRate: number): Float32Array<ArrayBuffer> {
  // 속도가 1이면 그대로지만, 채널로 넘기려면 자기 버퍼를 가진 사본이어야 함
  if (Math.abs(rate - 1) < 0.001) return input.slice();
  const grain = Math.round(sampleRate * 0.06); // 60ms. 말소리에 무난한 조각 길이
  const overlap = Math.round(grain / 2);
  const hop = grain - overlap; // 결과에서 조각이 나아가는 폭
  const inHop = Math.round(hop * rate); // 원본에서 읽어 나아가는 폭. 여기서 길이가 바뀜
  const outLen = Math.max(1, Math.floor(input.length / rate) + grain);
  const out = new Float32Array(outLen);
  const win = new Float32Array(overlap);
  for (let i = 0; i < overlap; i++) win[i] = i / overlap;

  let readAt = 0;
  let writeAt = 0;
  while (readAt + grain < input.length && writeAt + grain < outLen) {
    for (let i = 0; i < grain; i++) {
      const s = input[readAt + i];
      if (i < overlap) {
        // 겹치는 앞부분. 이미 쓰인 앞 조각과 서로 넘겨받음
        out[writeAt + i] = out[writeAt + i] * (1 - win[i]) + s * win[i];
      } else {
        out[writeAt + i] = s;
      }
    }
    readAt += inHop;
    writeAt += hop;
  }
  // slice 로 새 배열을 준다. subarray 는 원본 버퍼에 묶여 있어 나중에 채널로 못 넘김
  return out.slice(0, Math.max(1, writeAt + overlap));
}

/** 그냥 빨리 돌리기. 높이까지 같이 바뀐다 (일부러 쓰는 사람이 있다) */
function resample(input: Float32Array, rate: number): Float32Array<ArrayBuffer> {
  const outLen = Math.max(1, Math.floor(input.length / rate));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const at = i * rate;
    const i0 = Math.floor(at);
    const f = at - i0;
    out[i] = (input[i0] || 0) * (1 - f) + (input[i0 + 1] || 0) * f;
  }
  return out;
}

function setup({ root: container, $, say }: ToolContext): ToolHandlers {
  const rateEl = $<HTMLInputElement>('#asRate');
  const stats = $<HTMLElement>('#asStats');
  const player = $<HTMLAudioElement>('#asPlay');
  let buffer: AudioBuffer | null = null;
  let baseName = t('audiospeed.file.base');

  function showStats(): void {
    if (!buffer) return;
    const rate = parseFloat(rateEl.value);
    const after = buffer.duration / rate;
    stats.innerHTML =
      statCell(t('audiospeed.stat.after'), mmss(after), true) +
      statCell(t('audiospeed.stat.before'), mmss(buffer.duration)) +
      statCell(t('audiospeed.stat.saved'), mmss(Math.abs(buffer.duration - after)));
  }

  rateEl.addEventListener('input', () => {
    $<HTMLElement>('#asRateVal').textContent = t('audiospeed.value.rate', {
      n: parseFloat(rateEl.value).toFixed(2).replace(/\.?0+$/, ''),
    });
    container.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
    showStats();
  });
  container.querySelectorAll('[data-preset]').forEach((chip) => {
    (chip as HTMLButtonElement).onclick = () => {
      rateEl.value = (chip as HTMLElement).dataset.preset as string;
      rateEl.dispatchEvent(new Event('input'));
      container.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    };
  });

  return {
    async load(files) {
      const file = files[0];
      say(t('audiospeed.say.reading'));
      try {
        buffer = await loadAudio(file);
      } catch {
        say(t('audiospeed.err.decode'), 'error');
        return false;
      }
      baseName = (file.name || t('audiospeed.file.base')).replace(/\.[^.]+$/, '');
      showStats();
      say(`${mmss(buffer.duration)} 짜리 소리를 읽었어요. 속도를 고르고 바꾸기를 누르세요.`, 'ok');
      return true;
    },
    async run() {
      if (!buffer) return null;
      const rate = parseFloat(rateEl.value);
      const keep = $<HTMLInputElement>('#asKeep').checked;
      say(t(keep ? 'audiospeed.say.workingKeep' : 'audiospeed.say.working'));
      await new Promise((r) => setTimeout(r, 0));
      try {
        const chans: Float32Array<ArrayBuffer>[] = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const src = buffer.getChannelData(c);
          chans.push(keep ? stretch(src, rate, buffer.sampleRate) : resample(src, rate));
        }
        const outBuf = audioCtx().createBuffer(chans.length, chans[0].length, buffer.sampleRate);
        for (let c = 0; c < chans.length; c++) outBuf.copyToChannel(chans[c], c);
        const blob = await encodeAudio(outBuf, 'wav');
        attachAudio(player, blob);
        stats.innerHTML =
          statCell(t('audiospeed.stat.after'), mmss(outBuf.length / outBuf.sampleRate), true) +
          statCell(t('audiospeed.stat.before'), mmss(buffer.duration)) +
          statCell(t('audiospeed.stat.size'), size(blob.size));
        say(keep ? t('audiospeed.say.doneKeep') : t('audiospeed.say.done'), 'ok');
        Toolbox.trackUse?.('speed');
        return {
          blob,
          name: baseName + t('audiospeed.file.suffix', { n: rate }) + '.wav',
          savedMessage: t('audiospeed.say.saved', { size: size(blob.size) }),
        };
      } catch (e) {
        say((e as Error).message || t('audiospeed.err.generic'), 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'audiospeed',
  namespace: 'audiospeed',
  tabLabel: () => t('audiospeed.tab', undefined, '속도 바꾸기'),
  ids: { drop: 'asDrop', file: 'asFile', status: 'asStatus', run: 'asRun', save: 'asSave' },
  accept: 'audio/*,video/*',
  dropLabel: () => t('audiospeed.drop'),
  dropHint: () => t('audiospeed.status.idle'),
  runLabel: () => t('audiospeed.btn.run'),
  saveLabel: () => t('audiospeed.btn.save'),
  body: () => `
    <div class="field-group" id="asControls">
      <div class="tool-sublabel">${esc(t('audiospeed.label.rate'))} <span id="asRateVal" class="range-value">${esc(t('audiospeed.value.rate', { n: '1.5' }))}</span></div>
      <input type="range" id="asRate" aria-label="속도" min="0.5" max="3" step="0.05" value="1.5">
      <div class="tool-chips">
        <button type="button" class="tool-chip" data-preset="0.75">${esc(t('audiospeed.preset.slow'))}</button>
        <button type="button" class="tool-chip active" data-preset="1.5">${esc(t('audiospeed.preset.fast'))}</button>
        <button type="button" class="tool-chip" data-preset="2">${esc(t('audiospeed.preset.double'))}</button>
      </div>
      <div class="tool-chips">
        <label class="tool-chip"><input type="checkbox" id="asKeep" checked> ${esc(t('audiospeed.opt.keep'))}</label>
      </div>
    </div>
    <div class="cc-stats" id="asStats"></div>`,
  result: () => `<audio id="asPlay" controls style="width:100%"></audio>`,
  setup,
});

