/** KarmoEdit 도구 표. 셸과 도구가 이름, 설명, 받는 형식을 여기서 읽음 */
import type { KarmoLabLazyWidgetStub } from '../../karmolab/types/karmolab';
import { t, loadNamespace } from '@lab/lib/i18n';

void loadNamespace('widgets');
void loadNamespace('widgets-desc');

window.KARMOLAB_LAZY_META = [
  {
    id: 'image',
    get title() { return t('widgets.image.title', undefined, "이미지"); },
    category: 'image',
    get desc() { return t('widgets-desc.image.desc', undefined, "편집, 형식 변환, 아스키 아트, AI 생성과 보관함을 한 곳에서"); },
    layout: 'full',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['tools/image']
  },
  {
    id: 'imageedit',
    get title() { return t('widgets.imageedit.title', undefined, "이미지 편집"); },
    category: 'image',
    get desc() { return t('widgets-desc.imageedit.desc', undefined, "편집, 형식, 해상도 변환(PNG, JPEG, WebP 등)을 한 화면에서"); },
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18" stroke="currentColor" stroke-width="1.5"/><path d="M3 15h18" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="9" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['root/gemini', 'imageconvert/imageconvert', 'imageedit']
  },
  {
    id: 'meok',
    get title() { return t('widgets.meok.title', undefined, "먹"); },
    category: 'image',
    get desc() { return t('widgets-desc.meok.desc', undefined, "갈아서 칠하고 칸으로 움직인다. 레이어, 붓, 도트 애니메이션"); },
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 15l3.2-4.2 2.4 3 2-2.4L18 15" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="9" cy="8" r="1.4" fill="currentColor"/>',
    accepts: ['image/*', 'application/json'],
    produces: ['image/png', 'application/json'],
    lazyScriptPaths: ['meok/meok']
  },
  {
    id: 'audiospeed',
    accepts: ['audio/*', 'video/*'],
    get title() { return t('widgets.audiospeed.title', undefined, "소리 속도"); },
    category: 'av',
    get desc() { return t('widgets-desc.audiospeed.desc', undefined, "녹음을 빠르게, 느리게 만듭니다. 목소리는 그대로 두고 길이만 바꿉니다"); },
    layout: 'wide',
    icon: '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 8l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/audiospeed']
  },
  {
    id: 'audiofade',
    accepts: ['audio/*', 'video/*'],
    get title() { return t('widgets.audiofade.title', undefined, "소리 페이드"); },
    category: 'av',
    get desc() { return t('widgets-desc.audiofade.desc', undefined, "시작, 끝의 툭 하는 끊김을 없앱니다. 어디가 끊기는지 먼저 짚습니다"); },
    layout: 'wide',
    icon: '<path d="M3 19L21 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 19h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 19v-3M11 19v-6M15 19v-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/audiofade']
  },
  {
    id: 'audiojoin',
    accepts: ['audio/*'],
    get title() { return t('widgets.audiojoin.title', undefined, "오디오 이어붙이기"); },
    category: 'av',
    get desc() { return t('widgets-desc.audiojoin.desc', undefined, "여러 음원을 하나로 잇습니다. 표본율이 달라도 맞춰서 잇습니다"); },
    layout: 'wide',
    icon: '<path d="M4 12h3l2-4 2 8 2-6 2 4h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4v3M12 17v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/audiojoin']
  },
  {
    id: 'imgbatch',
    get title() { return t('widgets.imgbatch.title', undefined, "이미지 일괄 변환"); },
    category: 'image',
    get desc() { return t('widgets-desc.imgbatch.desc', undefined, "사진 여러 장의 크기와 형식을 한 번에 바꿔 ZIP 으로 받습니다"); },
    layout: 'wide',
    produces: ['image/png', 'image/jpeg', 'image/webp'],
    accepts: ['image/*'],
    icon: '<rect x="3" y="6" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 14l3.5-3.5 2.5 2.5 3-3 4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M7 3h11a2 2 0 0 1 2 2v11" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6"/>',
    lazyScriptPaths: ['tools/imgbatch']
  },
  {
    id: 'audiocut',
    accepts: ['audio/*'],
    get title() { return t('widgets.audiocut.title', undefined, "오디오 자르기"); },
    category: 'av',
    get desc() { return t('widgets-desc.audiocut.desc', undefined, "음원의 원하는 구간만 잘라 냅니다. 파일이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<path d="M3 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/audiocut']
  },
  {
    id: 'favicon',
    get title() { return t('widgets.favicon.title', undefined, "파비콘 만들기"); },
    category: 'image',
    get desc() { return t('widgets-desc.favicon.desc', undefined, "그림 한 장으로 사이트 아이콘 여러 크기와 ico 를 만듭니다. 붙일 코드까지 줍니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.3" opacity="0.6"/><circle cx="6" cy="7" r="0.9" fill="currentColor"/><path d="M9 15l2-2.5L13 15l2-3 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/favicon']
  },
  {
    id: 'imgmerge',
    accepts: ['image/*'],
    get title() { return t('widgets.imgmerge.title', undefined, "사진 이어 붙이기"); },
    category: 'image',
    get desc() { return t('widgets-desc.imgmerge.desc', undefined, "여러 장을 세로나 가로로 한 장에 이어 붙입니다. 사진이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="13" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 7l2-2 2 2M7 17l2-2 2 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['tools/imgmerge']
  },
  {
    id: 'exifclean',
    accepts: ['image/jpeg'],
    get title() { return t('widgets.exifclean.title', undefined, "사진 정보 지우기"); },
    category: 'image',
    get desc() { return t('widgets-desc.exifclean.desc', undefined, "사진에 든 위치, 카메라 정보를 보여 주고 지웁니다. 화질을 건드리지 않고, 사진이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6l1.5-2h5L16 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M18.5 4.5 5.5 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['tools/exifclean']
  },
  {
    id: 'audiolevel',
    accepts: ['audio/*', 'video/*'],
    get title() { return t('widgets.audiolevel.title', undefined, "소리 크기 맞추기"); },
    category: 'av',
    get desc() { return t('widgets-desc.audiolevel.desc', undefined, "들쭉날쭉한 녹음의 크기를 고르게 만듭니다. 전후를 파형과 숫자로 비교하고, 파일이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<path d="M4 14V10M8 17V7M12 19V5M16 16V8M20 13v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/audiolevel']
  },
  {
    id: 'sound',
    get title() { return t('widgets.sound.title', undefined, "소리 도구"); },
    category: 'av',
    get desc() { return t('widgets-desc.sound.desc', undefined, "녹음하고 자르고 크기를 맞추고 잇습니다. MP3, WAV 로 저장하며 파일이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    lazyTabs: true,
    icon: '<path d="M4 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/sound']
  },
  {
    id: 'video2gif',
    accepts: ['video/*'],
    get title() { return t('widgets.video2gif.title', undefined, "영상 → GIF"); },
    category: 'av',
    get desc() { return t('widgets-desc.video2gif.desc', undefined, "영상의 원하는 구간을 GIF 로 만듭니다. 구간, 화질을 보면서 고르고, 받기 전에 결과를 먼저 봅니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/>',
    produces: ['image/gif'],
    lazyScriptPaths: ['tools/gifenc', 'tools/video2gif'] // 압축기가 먼저 있어야 한다
  },
  {
    id: 'video2audio',
    accepts: ['video/*'],
    get title() { return t('widgets.video2audio.title', undefined, "영상에서 소리 추출"); },
    category: 'av',
    get desc() { return t('widgets-desc.video2audio.desc', undefined, "영상 파일의 소리만 뽑아 음원으로 받습니다. 파일이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16 10l5-3v10l-5-3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 14c0-2 1.5-3 2.5-3s2.5 1 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    produces: ['audio/*'],
    lazyScriptPaths: ['tools/video2audio']
  },
  {
    id: 'videotrim',
    accepts: ['video/*'],
    get title() { return t('widgets.videotrim.title', undefined, "영상 자르기"); },
    category: 'av',
    get desc() { return t('widgets-desc.videotrim.desc', undefined, "영상에서 원하는 구간만 잘라 냅니다. 소리도 함께 남고, 영상이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<path d="M6 4v13a3 3 0 1 0 2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M18 4v13a3 3 0 1 1-2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M9 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    produces: ['video/*'],
    lazyScriptPaths: ['tools/videotrim']
  },
  {
    id: 'videorotate',
    accepts: ['video/*'],
    get title() { return t('widgets.videorotate.title', undefined, "영상 돌리기"); },
    category: 'av',
    get desc() { return t('widgets-desc.videorotate.desc', undefined, "누워서 찍힌 영상을 세웁니다. 돌리면 가로세로도 함께 바뀝니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 8a5 5 0 0 1 0 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M19.5 5.5L17 8l2.5 2.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['video/*'],
    lazyScriptPaths: ['tools/videorotate']
  },
  {
    id: 'videocompress',
    accepts: ['video/*'],
    get title() { return t('widgets.videocompress.title', undefined, "영상 용량 줄이기"); },
    category: 'av',
    get desc() { return t('widgets-desc.videocompress.desc', undefined, "영상 용량을 줄입니다. 해상도와 화질을 고르고, 영상이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['video/*'],
    lazyScriptPaths: ['tools/videocompress']
  },
  {
    id: 'video2img',
    accepts: ['video/*'],
    get title() { return t('widgets.video2img.title', undefined, "영상에서 사진 뽑기"); },
    category: 'av',
    get desc() { return t('widgets-desc.video2img.desc', undefined, "영상의 한 장면이나 일정 간격 장면을 원본 화질로 뽑습니다. 영상이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    produces: ['image/png', 'image/jpeg'],
    icon: '<rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15 9l6-3v9l-6-3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><rect x="7" y="12" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="var(--bg-primary)"/><path d="M7 18l3-3 2 2 2.5-2.5L19 18" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/video2img']
  },
  {
    id: 'videotool',
    get title() { return t('widgets.videotool.title', undefined, "영상 도구"); },
    category: 'av',
    get desc() { return t('widgets-desc.videotool.desc', undefined, "영상을 GIF 로 만들고, 구간을 자르고, 소리를 뽑고, 화면을 녹화합니다. 영상이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    lazyTabs: true,
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>',
    lazyScriptPaths: ['tools/videotool']
  },
  {
    id: 'imgresize',
    accepts: ['image/*'],
    get title() { return t('widgets.imgresize.title', undefined, "사진 크기 맞추기"); },
    category: 'image',
    get desc() { return t('widgets-desc.imgresize.desc', undefined, "가로 몇 px, 몇 MB 이하 같은 기준에 맞춰 줄입니다. 용량은 자동으로 찾습니다"); },
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 16l3-3 2 2 3-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 7h3v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['tools/imgresize']
  },
  {
    id: 'bgremove',
    get title() { return t('widgets.bgremove.title', undefined, "배경 지우기"); },
    category: 'ai',
    get desc() { return t('widgets-desc.bgremove.desc', undefined, "배경을 지워 투명 PNG 로 만듭니다. 색으로 지우거나, 모양을 알아보고 오려냅니다. 사진이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    lazyScriptPaths: ['tools/bgremove']
  },
  {
    id: 'idphoto',
    get title() { return t('widgets.idphoto.title', undefined, "증명사진"); },
    category: 'image',
    get desc() { return t('widgets-desc.idphoto.desc', undefined, "여권, 주민증, 이력서 규격에 맞춰 자르고, 배경을 바꾸고, 인화지 한 장에 여러 장을 놓습니다"); },
    layout: 'wide',
    lazyScriptPaths: ['tools/idphoto']
  },
  {
    id: 'docscan',
    get title() { return t('widgets.docscan.title', undefined, "서류 스캔"); },
    category: 'image',
    get desc() { return t('widgets-desc.docscan.desc', undefined, "비스듬히 찍은 서류를 반듯하게 펴고 스캔처럼 다듬어 PNG, PDF 로 냅니다. 사진이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    lazyScriptPaths: ['tools/docscan']
  },
  {
    id: 'redact',
    get title() { return t('widgets.redact.title', undefined, "가리개"); },
    category: 'image',
    get desc() { return t('widgets-desc.redact.desc', undefined, "캡처에서 계좌번호, 이름 같은 것을 지웁니다. 덮는 게 아니라 그 자리를 없앱니다"); },
    layout: 'wide',
    produces: ['image/png'],
    accepts: ['image/*'],
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="6" y="9" width="7" height="4" rx="1" fill="currentColor"/><path d="M15 15h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/redact']
  },
  {
    id: 'asciiart',
    get title() { return t('widgets.asciiart.title', undefined, "이미지 → 아스키 아트"); },
    category: 'image',
    get desc() { return t('widgets-desc.asciiart.desc', undefined, "사진이나 그림을 글자로 그린 아스키 아트로 바꿉니다. 폭, 문자 세트, 반전 조절"); },
    layout: 'wide',
    accepts: ['image/*', 'video/*'],
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 12h6M6 15h4M14 9h4M15 12h3M13 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/gifenc', 'tools/asciiart'] // 압축기가 먼저 있어야 GIF 로 뽑는다
  },
  {
    id: 'subtitle',
    get title() { return t('widgets.subtitle.title', undefined, "자막 시간 맞추기"); },
    category: 'av',
    get desc() { return t('widgets-desc.subtitle.desc', undefined, "어긋난 자막을 밀거나 늘려 맞춥니다. SRT, VTT 를 서로 바꿉니다"); },
    layout: 'wide',
    produces: ['text/plain'],
    accepts: ['text/plain'],
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 14h5M13 14h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/subtitle']
  },
  {
    id: 'heung',
    title: '흥',
    category: '',
    desc: '멀티트랙 녹음, MIDI 편곡, 믹싱, WAV 출력을 한 프로젝트에서 완성하는 브라우저 DAW',
    layout: 'full',
    noHero: true,
    accepts: ['audio/*', 'application/json'],
    produces: ['audio/wav', 'application/json'],
    icon: '<path d="M3 17V7M7 20V4M11 15V9M15 19V5M19 14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 12h20" stroke="currentColor" stroke-width="1" opacity=".35"/>',
    lazyScriptPaths: ['heung/heung']
  },
  {
    id: 'cleanup',
    get title() { return t('widgets.cleanup.title', undefined, "지우개"); },
    category: 'file',
    get desc() { return t('widgets-desc.cleanup.desc', undefined, "사진에서 거슬리는 것을 칠해서 지웁니다. 주변 색으로 덮습니다. 사진이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon:
      '<path d="M8 20H5a1 1 0 0 1-.7-1.7l9-9a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8L13 20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>' +
      '<path d="M8 20h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M10.5 12.5l4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/cleanup']
  },
  {
    id: 'videobg',
    get title() { return t('widgets.videobg.title', undefined, "영상 배경 빼기"); },
    category: 'ai',
    get desc() { return t('widgets-desc.videobg.desc', undefined, "짧은 영상에서 사람이나 물체만 남깁니다. 영상이 브라우저를 벗어나지 않습니다"); },
    layout: 'wide',
    icon:
      '<rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>' +
      '<circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
      '<path d="M7.5 16.5c1.2-2.2 7.8-2.2 9 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/videobg']
  },
] as KarmoLabLazyWidgetStub[];
