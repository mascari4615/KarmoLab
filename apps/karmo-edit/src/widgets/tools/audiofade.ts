/**
 * 소리 페이드 (TASK-KL-088)
 *
 * 잘라 낸 소리를 그냥 쓰면 시작과 끝에서 툭 하고 끊긴다. 파형이 0 이 아닌 자리에서
 * 갑자기 끝나기 때문인데, 스피커에서는 이게 딱 소리로 들린다.
 *
 * 신경 쓴 곳:
 *  - **끊김을 먼저 짚어 준다.** 시작, 끝 지점의 진폭을 재서 여기 딱 소리가 납니다라고 말해 주고,
 *    필요한 만큼만 페이드를 건다. 무턱대고 3초씩 걸면 짧은 소리가 뭉개진다.
 *  - 페이드 모양은 **귀에 맞춘 곡선**을 쓴다. 소리 크기를 곧게 줄이면 중간이 갑자기 조용해진 듯
 *    들린다. 사람 귀는 소리 세기를 곧게 느끼지 않는다.
 */
import { attachAudio, audioCtx, encodeAudio, fileSize as size, loadAudio, mmss } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';

/**
 * 귀에 맞춘 페이드. 선형은 중간이 툭 꺼진 느낌, 제곱 곡선으로 고른 변화
 */
const curve = (x: number): number => x * x;

/** 시작, 끝 20ms 의 최대 진폭. 0 에서 멀수록 툭 소리가 큼 */
function edgeLevels(buf: AudioBuffer): { head: number; tail: number } {
  const n = Math.min(Math.round(buf.sampleRate * 0.02), Math.floor(buf.length / 2));
  let head = 0;
  let tail = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      head = Math.max(head, Math.abs(d[i]));
      tail = Math.max(tail, Math.abs(d[d.length - 1 - i]));
    }
  }
  return { head, tail };
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function setup({ $, say }: ToolContext): ToolHandlers {
  const stats = $<HTMLElement>('#afStats');
  const foundEl = $<HTMLElement>('#afFound');
  const after = $<HTMLElement>('#afAfter');
  const player = $<HTMLAudioElement>('#afPlay');
  const inRange = $<HTMLInputElement>('#afIn');
  const outRange = $<HTMLInputElement>('#afOut');
  let buffer: AudioBuffer | null = null;
  let baseName = t('audiofade.file.base');

  function report(buf: AudioBuffer): void {
    const { head, tail } = edgeLevels(buf);
    // 판정 기준: 진폭 0.02
    const rows = [
      [t('audiofade.edge.head'), head, head > 0.02],
      [t('audiofade.edge.tail'), tail, tail > 0.02],
    ] as Array<[string, number, boolean]>;
    foundEl.innerHTML = rows
      .map(
        ([label, v, bad]) =>
          `<div class="tool-list-row"><span class="tool-list-key">${esc(label)}</span><span class="tool-list-val">${pct(v)} ${esc(
            t(bad ? 'audiofade.edge.bad' : 'audiofade.edge.good')
          )}</span></div>`
      )
      .join('');
    stats.innerHTML =
      statCell(t('audiofade.stat.length'), mmss(buf.duration), true) +
      statCell(t('audiofade.stat.headLevel'), pct(head)) +
      statCell(t('audiofade.stat.tailLevel'), pct(tail));
    const bad = head > 0.02 || tail > 0.02;
    say(t(bad ? 'audiofade.say.bad' : 'audiofade.say.good'), bad ? 'error' : 'ok');
  }

  /** 끊기는 만큼만. 진폭이 클수록 길게, 길이의 1/4 이내 */
  function autoSeconds(level: number): number {
    if (!buffer || level <= 0.02) return 0;
    return Math.min(Math.min(0.6, 0.05 + level * 0.5), buffer.duration / 4);
  }

  const showValue = (range: HTMLInputElement, label: string): void => {
    $<HTMLElement>(label).textContent = t('audiofade.value.sec', { n: (parseInt(range.value, 10) / 10).toFixed(1) });
  };
  inRange.addEventListener('input', () => showValue(inRange, '#afInVal'));
  outRange.addEventListener('input', () => showValue(outRange, '#afOutVal'));
  $<HTMLButtonElement>('#afAuto').onclick = () => {
    if (!buffer) return;
    const { head, tail } = edgeLevels(buffer);
    inRange.value = String(Math.round(autoSeconds(head) * 10));
    outRange.value = String(Math.round(autoSeconds(tail) * 10));
    showValue(inRange, '#afInVal');
    showValue(outRange, '#afOutVal');
    say(t('audiofade.say.auto'), 'ok');
  };

  return {
    async load(files) {
      say(t('audiofade.say.reading'));
      try {
        buffer = await loadAudio(files[0]);
      } catch {
        say(t('audiofade.err.decode'), 'error');
        return false;
      }
      baseName = (files[0].name || t('audiofade.file.base')).replace(/\.[^.]+$/, '');
      report(buffer);
      return true;
    },
    async run() {
      if (!buffer) return null;
      say(t('audiofade.say.working'));
      await new Promise((r) => setTimeout(r, 0));
      try {
        const sr = buffer.sampleRate;
        const half = Math.floor(buffer.length / 2);
        const inN = Math.min(Math.round((parseInt(inRange.value, 10) / 10) * sr), half);
        const outN = Math.min(Math.round((parseInt(outRange.value, 10) / 10) * sr), half);
        const out = audioCtx().createBuffer(buffer.numberOfChannels, buffer.length, sr);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const dst = new Float32Array(buffer.getChannelData(c));
          for (let i = 0; i < inN; i++) dst[i] *= curve(i / inN);
          for (let i = 0; i < outN; i++) dst[dst.length - 1 - i] *= curve(i / outN);
          out.copyToChannel(dst, c);
        }
        const blob = await encodeAudio(out, 'wav');
        attachAudio(player, blob);
        const edges = edgeLevels(out);
        after.innerHTML =
          statCell(t('audiofade.stat.headLevel'), pct(edges.head), true) +
          statCell(t('audiofade.stat.tailLevel'), pct(edges.tail)) +
          statCell(t('audiofade.stat.size'), size(blob.size));
        say(t('audiofade.say.done'), 'ok');
        Toolbox.trackUse?.('fade');
        return {
          blob,
          name: baseName + t('audiofade.file.suffix') + '.wav',
          savedMessage: t('audiofade.say.saved', { size: size(blob.size) }),
        };
      } catch (e) {
        say((e as Error).message || t('audiofade.err.generic'), 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'audiofade',
  namespace: 'audiofade',

  tabLabel: () => t('audiofade.tab', undefined, '페이드'),
  ids: { drop: 'afDrop', file: 'afFile', status: 'afStatus', run: 'afRun', save: 'afSave' },
  accept: 'audio/*,video/*',
  dropLabel: () => t('audiofade.drop'),
  dropHint: () => t('audiofade.status.idle'),
  runLabel: () => t('audiofade.btn.run'),
  saveLabel: () => t('audiofade.btn.save'),
  body: () => `
    <div class="tool-list" id="afFound"></div>
    <div class="cc-stats" id="afStats"></div>
    <div class="field-group" id="afControls">
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('audiofade.label.in'))} <span id="afInVal" class="range-value">${esc(t('audiofade.value.sec', { n: '0.5' }))}</span></div>
          <input type="range" id="afIn" aria-label="${esc(t('audiofade.label.in'))}" min="0" max="50" value="5">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('audiofade.label.out'))} <span id="afOutVal" class="range-value">${esc(t('audiofade.value.sec', { n: '0.5' }))}</span></div>
          <input type="range" id="afOut" aria-label="${esc(t('audiofade.label.out'))}" min="0" max="50" value="5">
        </div>
      </div>
      <div class="tool-chips">
        <button type="button" class="tool-chip" id="afAuto">${esc(t('audiofade.btn.auto'))}</button>
      </div>
    </div>`,
  result: () => `
    <audio id="afPlay" controls style="width:100%"></audio>
    <div class="cc-stats" id="afAfter"></div>`,
  setup,
});
