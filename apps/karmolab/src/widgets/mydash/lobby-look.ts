export const LOBBY_BACKGROUNDS = [
  { id: 'auto', name: '테마에 맞춤', image: '/apps/karmolab/img/home/sky-village.webp' },
  { id: 'village', name: '푸른 하늘', image: '/apps/karmolab/img/home/sky-village.webp' },
  { id: 'clouds', name: '구름', image: '/apps/karmolab/img/home/sky-clouds.webp' },
  { id: 'twilight', name: '황혼', image: '/apps/karmolab/img/home/sky-twilight.webp' },
  { id: 'dusk', name: '해질녘', image: '/apps/karmolab/img/home/sky-dusk.webp' },
  { id: 'winter', name: '겨울 들판', image: '/apps/karmolab/img/home/winter-meadow.png' },
] as const;

export const LOBBY_CHARACTERS = [
  { id: 'yon', name: '욘', outfits: [
    { id: 'yon-original', name: '잠옷', image: '/apps/karmolab/img/widgets/mydash/yawn-stand.webp' },
    { id: 'yon-casual', name: '일상복', image: '/apps/karmolab/img/widgets/mydash/wardrobe/yon-casual.png' },
    { id: 'yon-casual-manga', name: '일상복 (만화풍)', image: '/apps/karmolab/img/widgets/mydash/wardrobe/yon-casual-manga-v1.png' },
  ] },
  { id: 'alisa', name: '알리사', outfits: [
    { id: 'alisa-original', name: '메이드', image: '/apps/karmolab/img/widgets/mydash/goals/alisa.webp' },
    { id: 'alisa-coat', name: '외출복', image: '/apps/karmolab/img/widgets/mydash/wardrobe/alisa-coat.png' },
  ] },
  { id: 'ling', name: '링', outfits: [
    { id: 'ling-casual', name: '평상복', image: '/apps/karmolab/img/widgets/mydash/wardrobe/ling-casual.png' },
    { id: 'ling-winter', name: '겨울옷', image: '/apps/karmolab/img/widgets/mydash/wardrobe/ling-winter.png' },
  ] },
];
export const LOBBY_OUTFIT_KEY = 'dash.lobby.outfit';
const BG_KEY = 'toolbox_home_bg';
export function lobbyLook(): { background: string; outfit: string } {
  const background = localStorage.getItem(BG_KEY) || 'auto';
  const outfit = localStorage.getItem(LOBBY_OUTFIT_KEY) || 'yon-original';
  return {
    background: LOBBY_BACKGROUNDS.some(item => item.id === background) ? background : 'auto',
    outfit: outfit === 'none' || LOBBY_CHARACTERS.some(character => character.outfits.some(item => item.id === outfit)) ? outfit : 'yon-original',
  };
}
export function saveLobbyLook(key: 'background' | 'outfit', value: string): void {
  if (key === 'background' && !LOBBY_BACKGROUNDS.some(item => item.id === value)) throw new Error('없는 배경');
  if (key === 'outfit' && value !== 'none' && !LOBBY_CHARACTERS.some(character => character.outfits.some(item => item.id === value))) throw new Error('없는 의상');
  localStorage.setItem(key === 'background' ? BG_KEY : LOBBY_OUTFIT_KEY, value);
  applyLobbyLook();
  window.dispatchEvent(new Event('dash-lobby-change'));
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
  const outfit = LOBBY_CHARACTERS.flatMap(character => character.outfits).find(item => item.id === look.outfit);
  document.querySelectorAll<HTMLImageElement>('.mydh-yawn').forEach(image => {
    image.hidden = look.outfit === 'none';
    if (outfit) {
      image.src = outfit.image;
      image.dataset.outfit = outfit.id;
    }
  });
}
