export const LOBBY_BACKGROUNDS = [
  { id: 'auto', name: '테마에 맞춤', image: '/apps/karmolab/img/home/sky-village.webp' },
  { id: 'village', name: '푸른 하늘', image: '/apps/karmolab/img/home/sky-village.webp' },
  { id: 'clouds', name: '구름', image: '/apps/karmolab/img/home/sky-clouds.webp' },
  { id: 'twilight', name: '황혼', image: '/apps/karmolab/img/home/sky-twilight.webp' },
  { id: 'dusk', name: '해질녘', image: '/apps/karmolab/img/home/sky-dusk.webp' },
  { id: 'winter', name: '겨울 들판', image: '/apps/karmolab/img/home/winter-meadow.png' },
] as const;

/**
 * 의상 하나. image 는 io 공개 그림, memo 는 memo `data/dash/lobby/` 의 파일 이름 (로그인 토큰으로 받음).
 * half 는 무릎까지 오는 구도 (마스코트, 티메토). 홈에서 작게, 아래에 붙임
 */
export type LobbyOutfit = { id: string; name: string; image?: string; memo?: string; half?: boolean };
export type LobbyCharacter = { id: string; name: string; outfits: LobbyOutfit[] };

const IMG = '/apps/karmolab/img/widgets/mydash/';
/* 세계관 캐릭터와 프로그램 마스코트 (memo characters/, notes/launcher/mascots/mascots.json).
   io 에 이미 있던 욘, 알리사, 링 그림만 공개 경로. 나머지는 memo 에서 받음 (2026-11-12 사용자 지시) */
export const LOBBY_CHARACTERS: LobbyCharacter[] = [
  { id: 'yon', name: '욘', outfits: [
    { id: 'yon-original', name: '잠옷', image: IMG + 'yawn-stand.webp' },
    { id: 'yon-casual', name: '일상복', image: IMG + 'wardrobe/yon-casual.png' },
    { id: 'yon-casual-manga', name: '일상복 (만화풍)', image: IMG + 'wardrobe/yon-casual-manga-v1.png' },
    { id: 'yon-wm', name: 'WM 로브', memo: 'wm.webp', half: true },
  ] },
  { id: 'alisa', name: '알리사', outfits: [
    { id: 'alisa-original', name: '메이드', image: IMG + 'goals/alisa.webp' },
    { id: 'alisa-coat', name: '외출복', image: IMG + 'wardrobe/alisa-coat.png' },
  ] },
  { id: 'ling', name: '링', outfits: [
    { id: 'ling-casual', name: '평상복', image: IMG + 'wardrobe/ling-casual.png' },
    { id: 'ling-winter', name: '겨울옷', image: IMG + 'wardrobe/ling-winter.png' },
  ] },
  { id: 'timeto', name: '티메토', outfits: [{ id: 'timeto-lab', name: '연구소장', memo: 'timeto.webp', half: true }] },
  { id: 'labo', name: '라보', outfits: [{ id: 'labo-karmolab', name: 'KarmoLab', memo: 'karmolab.webp', half: true }] },
  { id: 'dashie', name: '대시', outfits: [{ id: 'dashie-dash', name: 'Dash', memo: 'dash.webp', half: true }] },
  { id: 'tori', name: '토리', outfits: [{ id: 'tori-companion', name: '동반자', memo: 'companion.webp', half: true }] },
  { id: 'fila', name: '파일라', outfits: [{ id: 'fila-files', name: 'Files', memo: 'files.webp', half: true }] },
  { id: 'caretaker', name: '관리인', outfits: [{ id: 'caretaker-launcher', name: '런처', memo: 'launcher.webp', half: true }] },
  { id: 'art', name: '아트', outfits: [{ id: 'art-karmo-ai', name: 'KarmoAI', memo: 'karmo-ai.webp', half: true }] },
  { id: 'tack', name: '택', outfits: [{ id: 'tack-tactics', name: 'Tactics Lab', memo: 'tactics-lab.webp', half: true }] },
  { id: 'ibul', name: '이불', outfits: [{ id: 'ibul-augment', name: '증강 디펜스', memo: 'augment-defense.webp', half: true }] },
];
export const LOBBY_OUTFIT_KEY = 'dash.lobby.outfit';
/** 홈을 열 때마다 의상 전부 중 하나 (2026-11-12 사용자 요청). 기본값 */
export const LOBBY_RANDOM = 'random';
const BG_KEY = 'toolbox_home_bg';
const ALL_OUTFITS = (): LobbyOutfit[] => LOBBY_CHARACTERS.flatMap(character => character.outfits);
const MEMO_DIR = 'data/dash/lobby/';
let readBlob: ((path: string) => Promise<Blob>) | null = null;
const blobUrls = new Map<string, Promise<string>>();
/** memo 그림을 받을 저장소. 홈과 꾸미기 방이 render 때 넘김 */
export function setLobbyRepo(repo: { readBlob?(path: string): Promise<Blob> }): void {
  if (repo.readBlob) readBlob = path => repo.readBlob!(path);
}
/** 의상 그림 주소. memo 그림은 받은 뒤 data 주소 (내려받기용 object URL 과 수명 관리 분리), 저장소가 없으면 빈 글자 */
export function outfitSrc(outfit: LobbyOutfit): Promise<string> {
  if (!outfit.memo) return Promise.resolve(outfit.image || '');
  if (!readBlob) return Promise.resolve('');
  let url = blobUrls.get(outfit.memo);
  if (!url) {
    const name = outfit.memo;
    url = readBlob(MEMO_DIR + name).then(blob => new Promise<string>((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(blob);
    }));
    url.catch(() => blobUrls.delete(name));
    blobUrls.set(name, url);
  }
  return url;
}
/** img 하나에 의상 그림. 받는 사이 다른 의상으로 바뀌면 늦게 온 그림은 버림 */
export function paintOutfit(image: HTMLImageElement, outfit: LobbyOutfit): void {
  image.dataset.want = outfit.id;
  if (!outfit.memo) { image.src = outfit.image || ''; return; }
  image.removeAttribute('src');
  outfitSrc(outfit).then(src => { if (src && image.dataset.want === outfit.id) image.src = src; }).catch(() => undefined);
}
const known = (id: string): boolean => id === 'none' || id === LOBBY_RANDOM || ALL_OUTFITS().some(item => item.id === id);
export function lobbyLook(): { background: string; outfit: string } {
  const background = localStorage.getItem(BG_KEY) || 'auto';
  const outfit = localStorage.getItem(LOBBY_OUTFIT_KEY) || LOBBY_RANDOM;
  return {
    background: LOBBY_BACKGROUNDS.some(item => item.id === background) ? background : 'auto',
    outfit: known(outfit) ? outfit : LOBBY_RANDOM,
  };
}
export function saveLobbyLook(key: 'background' | 'outfit', value: string): void {
  if (key === 'background' && !LOBBY_BACKGROUNDS.some(item => item.id === value)) throw new Error('없는 배경');
  if (key === 'outfit' && !known(value)) throw new Error('없는 의상');
  localStorage.setItem(key === 'background' ? BG_KEY : LOBBY_OUTFIT_KEY, value);
  applyLobbyLook();
  window.dispatchEvent(new Event('dash-lobby-change'));
}
/** 의상 id 로 캐릭터와 의상. 없으면 null */
export function findOutfit(id: string): { character: LobbyCharacter; outfit: LobbyOutfit } | null {
  for (const character of LOBBY_CHARACTERS) {
    const outfit = character.outfits.find(item => item.id === id);
    if (outfit) return { character, outfit };
  }
  return null;
}
/**
 * 홈 그림에 실릴 의상. 랜덤은 그림마다 한 번 뽑기, 결과는 data-random.
 * 다른 탭의 저장 이벤트로 다시 칠할 때 그림 유지
 */
function outfitFor(image: HTMLImageElement, choice: string): LobbyOutfit | undefined {
  if (choice !== LOBBY_RANDOM) return findOutfit(choice)?.outfit;
  const kept = image.dataset.random && findOutfit(image.dataset.random);
  if (kept) return kept.outfit;
  const all = ALL_OUTFITS().filter(item => !item.memo || readBlob);
  const pick = all[Math.floor(Math.random() * all.length)];
  image.dataset.random = pick.id;
  return pick;
}
export function applyLobbyLook(): void {
  let look;
  try { look = lobbyLook(); } catch { return; }
  if (look.background === 'auto') document.documentElement.removeAttribute('data-home-bg');
  else document.documentElement.setAttribute('data-home-bg', look.background);
  const background = LOBBY_BACKGROUNDS.find(item => item.id === look.background);
  if (background && look.background !== 'auto') document.documentElement.style.setProperty('--dash-photo', `url("${background.image}")`);
  else document.documentElement.style.removeProperty('--dash-photo');
  document.querySelectorAll<HTMLElement>('.mydh').forEach(home => {
    if (background && look.background !== 'auto') home.style.setProperty('--mydh-photo', `url("${background.image}")`);
    else home.style.removeProperty('--mydh-photo');
  });
  document.querySelectorAll<HTMLImageElement>('.mydh-yawn').forEach(image => {
    const hidden = look.outfit === 'none';
    image.hidden = hidden;
    const outfit = hidden ? undefined : outfitFor(image, look.outfit);
    if (outfit) {
      if (image.dataset.outfit !== outfit.id) paintOutfit(image, outfit);
      image.dataset.outfit = outfit.id;
      image.classList.toggle('mydh-yawn--half', !!outfit.half);
    }
    /* 이름표. 그림과 같은 홈 안 */
    const plate = image.closest('.mydh')?.querySelector<HTMLElement>('.mydh-plate');
    if (plate) {
      const found = outfit && findOutfit(outfit.id);
      plate.hidden = !found;
      if (found) {
        plate.querySelector('b')!.textContent = found.character.name;
        plate.querySelector('span')!.textContent = found.outfit.name;
      }
    }
  });
}
