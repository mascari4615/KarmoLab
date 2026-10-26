import { dashRegistry, esc, type DashPanelCtx } from './kit';
import { LOBBY_BACKGROUNDS, LOBBY_CHARACTERS, lobbyLook, saveLobbyLook } from './lobby-look';

function renderAppearance(ctx: DashPanelCtx): void {
  ctx.root.classList.add('mydl');
  ctx.root.innerHTML = `<div class="mydl-layout"><div class="mydl-preview" aria-label="로비 미리보기"><img class="mydl-backdrop" src="${LOBBY_BACKGROUNDS[1].image}" alt=""><img class="mydl-character" src="${LOBBY_CHARACTERS[0].outfits[0].image}" alt=""><span class="mydl-caption"></span></div><div class="mydl-options"><h3>캐릭터</h3><div class="mydl-characters" role="group" aria-label="캐릭터"></div><h3>의상</h3><div class="mydl-outfits" role="group" aria-label="의상"></div><h3>배경</h3><div class="mydl-backgrounds" role="group" aria-label="배경"></div><p class="mydl-status" role="status" aria-live="polite"></p><button type="button" class="mydl-home">홈에서 보기</button></div></div>`;
  const status = ctx.root.querySelector<HTMLElement>('.mydl-status')!;
  let selectedCharacter = 'yon';
  function paint(): void {
    let look;
    try { look = lobbyLook(); }
    catch { status.textContent = '선택을 읽지 못했어요. 브라우저 저장소 설정을 확인해 주세요.'; return; }
    const currentCharacter = LOBBY_CHARACTERS.find(character => character.outfits.some(outfit => outfit.id === look.outfit));
    if (currentCharacter) selectedCharacter = currentCharacter.id;
    const character = LOBBY_CHARACTERS.find(item => item.id === selectedCharacter) || LOBBY_CHARACTERS[0];
    const outfit = LOBBY_CHARACTERS.flatMap(item => item.outfits).find(item => item.id === look.outfit);
    const auto = document.documentElement.dataset.theme === 'dark' ? 'dusk' : 'village';
    const background = LOBBY_BACKGROUNDS.find(item => item.id === (look.background === 'auto' ? auto : look.background)) || LOBBY_BACKGROUNDS[1];
    ctx.root.querySelector<HTMLImageElement>('.mydl-backdrop')!.src = background.image;
    const preview = ctx.root.querySelector<HTMLImageElement>('.mydl-character')!;
    preview.hidden = look.outfit === 'none';
    if (outfit) { preview.src = outfit.image; preview.alt = `${currentCharacter?.name || ''} ${outfit.name}`; }
    ctx.root.querySelector<HTMLElement>('.mydl-caption')!.textContent = outfit && look.outfit !== 'none' ? `${currentCharacter?.name} / ${outfit.name}` : '캐릭터 숨김';
    ctx.root.querySelector<HTMLElement>('.mydl-characters')!.innerHTML = LOBBY_CHARACTERS.map(item => `<button type="button" data-character="${item.id}" aria-pressed="${item.id === currentCharacter?.id}"><img src="${item.outfits[0].image}" alt="" loading="lazy"><span>${esc(item.name)}</span></button>`).join('') + `<button type="button" data-outfit="none" aria-pressed="${look.outfit === 'none'}">숨김</button>`;
    ctx.root.querySelector<HTMLElement>('.mydl-outfits')!.innerHTML = character.outfits.map(item => `<button type="button" data-outfit="${item.id}" aria-pressed="${item.id === look.outfit}">${esc(item.name)}</button>`).join('');
    ctx.root.querySelector<HTMLElement>('.mydl-backgrounds')!.innerHTML = LOBBY_BACKGROUNDS.map(item => `<button type="button" data-background="${item.id}" aria-pressed="${item.id === look.background}"><img src="${item.id === 'auto' ? (LOBBY_BACKGROUNDS.find(bg => bg.id === auto)!.image) : item.image}" alt="" loading="lazy"><span>${esc(item.name)}</span></button>`).join('');
  }
  ctx.root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.classList.contains('mydl-home')) { ctx.openItem('today'); return; }
    const character = LOBBY_CHARACTERS.find(item => item.id === button.dataset.character);
    const key = button.dataset.background ? 'background' : 'outfit';
    const value = button.dataset.background || button.dataset.outfit || character?.outfits[0].id;
    if (!value) return;
    try {
      saveLobbyLook(key, value);
      status.textContent = '선택을 저장했어요. 홈에도 바로 적용됩니다.';
      paint();
    } catch { status.textContent = '선택을 저장하지 못했어요. 이전 선택은 유지됩니다.'; }
  });
  const changed = (): void => { if (ctx.isCurrent()) paint(); };
  window.addEventListener('storage', changed);
  window.addEventListener('dash-lobby-change', changed);
  ctx.onDispose(() => {
    window.removeEventListener('storage', changed);
    window.removeEventListener('dash-lobby-change', changed);
  });
  paint();
}
dashRegistry().register({ id: 'appearance', title: '꾸미기', access: 'read', paths: [], render: renderAppearance });
