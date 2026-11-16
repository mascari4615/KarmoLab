/**
 * 오디오 이어붙이기 (TASK-KL-088)
 *
 * 여러 음원을 하나로 잇는 일은 단순해 보이지만 **표본율과 채널 수가 제각각**이면
 * 그대로 이어 붙일 수 없다. 44.1kHz 와 48kHz 를 섞으면 뒤쪽이 빨라지거나 느려진다.
 * 가장 높은 표본율에 맞추고 채널도 통일한 뒤 잇는다. 사이에 무음을 넣는 선택지도 둔다.
 */
import { encodeAudio, fileSize as size, mmss, audioCtx, loadAudioInfo, attachAudio } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';

function setup({ $, say, reset }: ToolContext): ToolHandlers {
  const listEl = $<HTMLElement>('#ajList');
  const stats = $<HTMLElement>('#ajStats');
  const gap = $<HTMLInputElement>('#ajGap');
  let items: Array<{ name: string; buffer: AudioBuffer; rate: number }> = [];

  function render(): void {
    listEl.innerHTML = items
      .map(
        (it, i) =>
          `<div class="tool-list-row"><span class="tool-list-key">${esc(t('audiojoin.value.nth', { n: i + 1 }))}</span><span class="tool-list-val">${esc(it.name)} <span class="tool-list-dim">${mmss(it.buffer.duration)}, ${(it.rate / 1000).toFixed(1)}kHz, ${it.buffer.numberOfChannels === 1 ? t('audiojoin.value.mono') : t('audiojoin.value.stereo')}</span></span></div>`
      )
      .join('');
    if (!items.length) {
      stats.innerHTML = '';
      return;
    }
    const gapSec = parseInt(gap.value, 10) / 10;
    const total = items.reduce((a, i) => a + i.buffer.duration, 0) + gapSec * Math.max(0, items.length - 1);
    const rates = [...new Set(items.map((i) => i.rate))];
    stats.innerHTML =
      statCell(t('audiojoin.stat.length'), mmss(total), true) +
      statCell(t('audiojoin.stat.count'), t('audiojoin.value.count', { n: items.length })) +
      statCell(
        t('audiojoin.stat.rate'),
        rates.length> 1
          ? t('audiojoin.value.matched', {
              kinds: t('audiojoin.value.kinds', { n: rates.length }),
              khz: Math.max(...rates) / 1000
            })
          : `${rates[0] / 1000}kHz`
      );
  }

  async function add(list: File[]): Promise<boolean> {
    for (const f of list) {
      if (!f.type.startsWith('audio/')) continue;
      try {
        // 표본률은 파일 머리에서 읽음. 푼 소리의 값은 전부 재생 장치 값
        const { buffer, rate } = await loadAudioInfo(f);
        items.push({ name: f.name, buffer, rate });
      } catch {
        say(t('audiojoin.err.one', { name: f.name }), 'error');
      }
    }
    render();
    if (items.length) say(t('audiojoin.say.picked', { n: items.length }), 'ok');
    Toolbox.trackUse?.('add');
    return items.length > 0;
  }

  /** 표본율이 다르면 그대로 이으면 안 된다. 가장 높은 쪽 기준으로 다시 표본을 찍음 */
  function resample(src: AudioBuffer, rate: number, ch: number, ctx: AudioContext): AudioBuffer {
    if (src.sampleRate === rate && src.numberOfChannels === ch) return src;
    const len = Math.round(src.duration * rate);
    const out = ctx.createBuffer(ch, len, rate);
    for (let c = 0; c < ch; c++) {
      const from = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
      const to = out.getChannelData(c);
      const ratio = src.sampleRate / rate;
      for (let i = 0; i < len; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        // 이웃 두 표본을 섞음. 가까운 값만 집으면 쇳소리
        to[i] = (from[i0] || 0) * (1 - frac) + (from[i0 + 1] || 0) * frac;
      }
    }
    return out;
  }

  /**
   * 표본을 하나하나 옮기는 일이라 긴 음원 여러 개면 수억 번이 됨
   * 한 번에 돌면 그동안 화면이 통째로 멈춰 먹통이 됐나 싶어지므로,
   * **파일 하나를 옮길 때마다** 숨 쉴 틈을 주고 어디까지 왔는지 알림
   */
  async function join(): Promise<AudioBuffer | null> {
    if (!items.length) return null;
    const rate = Math.max(...items.map((i) => i.buffer.sampleRate));
    const ch = Math.max(...items.map((i) => i.buffer.numberOfChannels));
    const gapLen = Math.round((parseInt(gap.value, 10) / 10) * rate);
    const ctx = audioCtx();
    const parts: AudioBuffer[] = [];
    for (let i = 0; i < items.length; i++) {
      say(t('audiojoin.say.matching', { i: i + 1, n: items.length }));
      await new Promise((r) => setTimeout(r, 0));
      parts.push(resample(items[i].buffer, rate, ch, ctx));
    }
    const total = parts.reduce((a, b) => a + b.length, 0) + gapLen * (parts.length - 1);
    const out = ctx.createBuffer(ch, total, rate);
    const fade = $<HTMLInputElement>('#ajFade').checked ? Math.floor(rate * 0.02) : 0;
    let off = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      say(t('audiojoin.say.joining', { i: pi + 1, n: parts.length }));
      await new Promise((r) => setTimeout(r, 0));
      for (let c = 0; c < ch; c++) {
        const from = part.getChannelData(c);
        const to = out.getChannelData(c);
        for (let i = 0; i < part.length; i++) {
          let v = from[i];
          if (fade) {
            if (i < fade) v *= i / fade;
            else if (i> part.length - fade) v *= (part.length - i) / fade;
          }
          to[off + i] = v;
        }
      }
      off += part.length + (pi < parts.length - 1 ? gapLen : 0);
    }
    return out;
  }

  gap.addEventListener('input', () => {
    $<HTMLElement>('#ajGapVal').textContent = (parseInt(gap.value, 10) / 10).toFixed(1) + t('audiojoin.unit.sec');
    render();
  });
  $<HTMLButtonElement>('#ajClear').onclick = () => {
    items = [];
    render();
    reset();
    say(t('audiojoin.say.cleared'));
  };

  return {
    load: add,
    async run() {
      try {
        const out = await join();
        if (!out) {
          say(t('audiojoin.err.noFile'), 'error');
          return null;
        }
        const format = $<HTMLSelectElement>('#ajFormat').value as 'wav' | 'mp3';
        say(format === 'mp3' ? t('audiojoin.say.encoding') : t('audiojoin.say.saving'));
        const blob = await encodeAudio(out, format);
        attachAudio($<HTMLAudioElement>('#ajResult'), blob);
        say(t('audiojoin.say.done', { len: mmss(out.duration), size: size(blob.size) }), 'ok');
        Toolbox.trackUse?.('join');
        return { blob, name: t('audiojoin.file.name') + format };
      } catch (err) {
        say(t('audiojoin.err.join') + (err as Error).message, 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'audiojoin',
  namespace: 'audiojoin',
  tabLabel: () => t('audiojoin.tab', undefined, '이어붙이기'),
  ids: { drop: 'ajDrop', file: 'ajFile', status: 'ajStatus', run: 'ajRun', save: 'ajSave' },
  accept: 'audio/*',
  multiple: true,
  accumulate: true,
  dropLabel: () => t('audiojoin.drop'),
  dropHint: () => t('audiojoin.status.idle'),
  runLabel: () => t('audiojoin.btn.run'),
  saveLabel: () => t('audiojoin.btn.save'),
  actions: () => `<button class="btn btn-ghost" id="ajClear">${esc(t('audiojoin.btn.clear'))}</button>`,
  body: () => `
    <div class="tool-list" id="ajList"></div>
    <div class="field-group">
      <div class="tool-sublabel">${esc(t('audiojoin.label.gap'))} <span id="ajGapVal" class="range-value">${esc(t('audiojoin.value.gap'))}</span></div>
      <input type="range" id="ajGap" aria-label="${esc(t('audiojoin.label.gap'))}" min="0" max="30" value="0">
      <div class="tool-chips">
        <label class="tool-chip"><input type="checkbox" id="ajFade" checked> ${esc(t('audiojoin.opt.fade'))}</label>
        <select id="ajFormat" aria-label="${esc(t('audiojoin.label.format'))}"><option value="mp3">${esc(t('audiojoin.format.mp3'))}</option><option value="wav">${esc(t('audiojoin.format.wav'))}</option></select>
      </div>
    </div>
    <div class="cc-stats" id="ajStats"></div>`,
  result: () => `<audio id="ajResult" controls style="width:100%"></audio>`,
  setup,
});
