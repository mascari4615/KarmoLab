/**
 * 영상에서 소리만 뽑기 (TASK-KL-088)
 *
 * 강의나 인터뷰를 소리만 남기고 싶을 때, 대개 영상을 통째로 남의 서버에 올린다.
 * 브라우저는 이미 영상 파일의 소리를 해독할 수 있으니 올릴 이유가 없다.
 *
 * 주의: 브라우저가 해독하지 못하는 코덱이 있다(특히 일부 mkv, avi). 그때는 실패를 숨기지 않고
 * 어떤 파일이 되는지 알려 준다. 아무 일도 안 일어남이 제일 나쁜 결과다.
 */
import { attachAudio, encodeAudio, fileSize as size, mmss, loadAudioInfo } from '@lab/widgets/tools/shared/media';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers } from '../../frame/define-tool';

function setup({ $, say }: ToolContext): ToolHandlers {
  const stats = $<HTMLElement>('#vaStats');
  let file: File | null = null;
  let buffer: AudioBuffer | null = null;

  return {
    async load(files) {
      const f = files[0];
      file = f;
      buffer = null;
      stats.innerHTML = '';
      say(t('video2audio.say.looking', { name: f.name, size: size(f.size) }));
      // 파일의 원래 표본률. buffer.sampleRate 는 재생 장치 값
      let rate = 0;
      try {
        ({ buffer, rate } = await loadAudioInfo(f));
      } catch {
        say(t('video2audio.err.decode'), 'error');
        return false;
      }
      stats.innerHTML =
        statCell(t('video2audio.stat.length'), mmss(buffer.duration), true) +
        statCell(t('video2audio.stat.rate'), `${(rate / 1000).toFixed(1)}kHz`) +
        statCell(t('video2audio.stat.channels'), buffer.numberOfChannels === 1 ? t('video2audio.value.mono') : t('video2audio.value.stereo'));
      say(t('video2audio.say.found'), 'ok');
      return true;
    },
    async run() {
      if (!buffer || !file) {
        say(t('video2audio.err.noFile'), 'error');
        return null;
      }
      const format = $<HTMLSelectElement>('#vaFormat').value as 'wav' | 'mp3';
      say(format === 'mp3' ? t('video2audio.say.encoding') : t('video2audio.say.making'));
      try {
        const blob = await encodeAudio(buffer, format);
        attachAudio($<HTMLAudioElement>('#vaResult'), blob);
        say(t('video2audio.say.done', { len: mmss(buffer.duration), size: size(blob.size) }), 'ok');
        Toolbox.trackUse?.('extract');
        return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.' + format };
      } catch (err) {
        say(t('video2audio.err.run') + (err as Error).message, 'error');
        return null;
      }
    },
  };
}

defineTool({
  id: 'video2audio',
  namespace: 'video2audio',
  tabLabel: () => t('video2audio.tab', undefined, '소리 추출'),
  ids: { drop: 'vaDrop', file: 'vaFile', status: 'vaStatus', run: 'vaRun', save: 'vaSave' },
  accept: 'video/*',
  dropLabel: () => t('video2audio.drop'),
  dropHint: () => t('video2audio.status.idle'),
  runLabel: () => t('video2audio.btn.run'),
  saveLabel: () => t('video2audio.btn.save'),
  body: () => `
    <div class="cc-stats" id="vaStats"></div>
    <div class="field-group">
      <label class="field-label" for="vaFormat">${esc(t('video2audio.label.format'))}</label>
      <select id="vaFormat">
        <option value="mp3">${esc(t('video2audio.format.mp3'))}</option>
        <option value="wav">${esc(t('video2audio.format.wav'))}</option>
      </select>
    </div>`,
  result: () => `<audio id="vaResult" controls style="width:100%"></audio>`,
  setup,
});
