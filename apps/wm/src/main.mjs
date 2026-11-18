import { createAtlas } from './atlas.mjs';
import { typeNames, clamp } from './world.mjs';
import { loadInitial, createEditor } from './editor.mjs';
import { observePerformance } from './performance.mjs';
import { createViewSettings, loadViewSettings } from './view-settings.mjs';
import { createWorkspace } from './workspace.mjs';

async function start() {
const $ = selector => document.querySelector(selector);
$('#terrain-retry').addEventListener('click',()=>location.reload());
let world = await loadInitial(), places = world.places, editor, workspace, isEditing = false;
const map = $('#map'), context = map.getContext('2d'), stage = $('#stage');
const brushCursor=document.createElement('div');brushCursor.id='brush-cursor';brushCursor.hidden=true;brushCursor.setAttribute('aria-hidden','true');stage.append(brushCursor);
observePerformance(stage);
const state = { mode: 'map', selected: null, filter: 'all', labels: true, zoom: 1, center: [.5, .5] };
let width = 0, height = 0, baseWidth = 0, baseHeight = 0, originX = 0, originY = 0, atlas, planet, planetLoading = false, atlasDirty = false, planetDirty = false, placesSignature = '';
const mobile = () => matchMedia('(max-width: 780px)').matches;
let previousMobile = null;
const viewOptions = loadViewSettings();
const viewSettings = createViewSettings(viewOptions, () => { planet?.setDisplay(viewOptions); atlas?.setDisplay(viewOptions); drawMap(); });
viewSettings.setMode('map');
const iconPaths = {
  home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
  forest: '<path d="m12 2-6 8h3l-5 7h6v5h4v-5h6l-5-7h3Z"/>',
  desert: '<path d="m2 20 9-16 11 16Zm9-16 3 16M3 14h3"/>',
  city: '<path d="M3 21V10h6v11m0 0V3h7v18m0 0V9h5v12M2 21h20M11 7h3m-3 4h3m-3 4h3"/>',
  mountain: '<path d="m2 20 7-14 5 9 3-6 5 11ZM7 10l3 2 2-1"/>',
  ice: '<path d="M12 2v20M3 7l18 10M3 17 21 7M8 4l4 3 4-3M8 20l4-3 4 3"/>',
  sea: '<path d="M2 8q3-4 6 0t6 0 8 0M2 14q3-4 6 0t6 0 8 0M2 20q3-4 6 0t6 0 8 0"/>',
  island: '<path d="M2 19q5 4 10 0t10 0M5 18l5-9 6 9M10 9l2-5 4 2"/>',
  grass: '<path d="M3 20q9-8 18 0M8 17v-7m0 3-4-4m4 5 4-6M17 18V9"/>',
  anomaly: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><path d="m12 6 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"/>',
  mist: '<path d="M3 8h14M7 12h14M2 16h15M8 20h11"/>',
  volcano: '<path d="m3 21 6-13h6l6 13ZM9 8l3 3 3-3M10 4 8 2m6 2 2-2M12 5V1"/>',
};
const icon = type => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[type] || iconPaths.grass}</svg>`;

const markers = new Map();let labelCandidates=[];
function buildMarkers() {
$('#labels').replaceChildren(); markers.clear();
for (const place of places) {
  const button = document.createElement('button'); button.className = 'marker'; button.dataset.type = place.type;button.dataset.place=place.id;
  button.setAttribute('aria-label', `${place.name}, ${typeNames[place.type]}`);
  button.innerHTML = `<span class="marker-dot">${icon(place.type)}</span><span class="marker-name"></span>`;
  button.querySelector('.marker-name').textContent = place.name;
  button.addEventListener('click', () => select(place.id)); $('#labels').append(button); markers.set(place.id, button);
}
}
buildMarkers();

function matches(place) {
  const query = $('#search').value.trim().toLocaleLowerCase();
  const sea = ['sea', 'anomaly', 'island'].includes(place.type);
  return (state.filter === 'all' || (state.filter === 'sea' ? sea : !sea)) && `${place.name} ${place.area} ${typeNames[place.type]}`.toLocaleLowerCase().includes(query);
}
function renderList() {
  const found = places.filter(matches);
  labelCandidates=[...found].sort((a,b)=>Number(b.id===state.selected||b.featured)-Number(a.id===state.selected||a.featured));
  for(const place of places){if(!found.includes(place))markers.get(place.id).hidden=true;}
  $('#place-count').textContent = found.length;
  $('#place-list').replaceChildren();
  for (const place of found) {
    const row = document.createElement('button'); row.className = 'place-row'; row.dataset.id = place.id;
    row.setAttribute('aria-pressed', String(state.selected === place.id));
    row.innerHTML = `<span class="place-icon">${icon(place.type)}</span><span><strong></strong><small></small></span><span class="arrow">↗</span>`;
    row.querySelector('strong').textContent = place.name; row.querySelector('small').textContent = place.area || '미분류';
    row.addEventListener('click', () => { select(place.id); focusPlace(place); }); $('#place-list').append(row);
  }
  if (!found.length) { const message = document.createElement('p'); message.className = 'no-results'; message.textContent = '일치하는 장소가 없어요. 다른 이름이나 지역을 찾아보세요.'; $('#place-list').append(message); }
  updateLabels();
}
function mapPosition(x, y) { return { x: originX + (x - state.center[0]) * baseWidth * state.zoom, y: originY + (y - state.center[1]) * baseHeight * state.zoom, visible: true }; }
function updateLabels() {
  if(height){
    const span=state.mode==='planet'&&planet?planet.view().spanV:height/(baseHeight*state.zoom),degrees=span*180*80/height;
    const scale=`${degrees>=1?degrees.toFixed(1):degrees>=.01?degrees.toFixed(2):degrees.toPrecision(2)}°`,label=$('#terrain-scale span');
    if(label.textContent!==scale)label.textContent=scale;
    document.body.classList.toggle('terrain-close',span<.12);
  }
  if(!state.labels){for(const node of markers.values())if(!node.hidden)node.hidden=true;return;}
  const placed = [];
  for (const place of labelCandidates) {
    const node = markers.get(place.id);
    const point = state.mode === 'planet' && planet ? planet.project(place.x, place.y) : mapPosition(place.x, place.y);
    let visible = point.visible && point.x > 16 && point.x < width - 20 && point.y > 80 && point.y < height - 62;
    const important = place.id === state.selected || place.featured;
    const minDistance = mobile() ? 62 : 65;
    if (placed.some(p => Math.abs(point.x - p.x) < minDistance && Math.abs(point.y - p.y) < 40)) visible = false;
    if (visible) placed.push(point);
    if(node.hidden===visible)node.hidden = !visible;
    if(!visible)continue;
    node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    node.classList.toggle('selected', place.id === state.selected);
    node.setAttribute('aria-pressed', String(place.id === state.selected));
  }
}
let mapFrame=0;
function drawMap(){if(!mapFrame)mapFrame=requestAnimationFrame(renderMap);}
function renderMap() {
  mapFrame=0;
  if (!atlas || state.mode !== 'map') return;
  const started = performance.now();
  if (atlasDirty) { atlas = createAtlas(world, atlasReady, viewOptions); atlasDirty = false; }
  const ratio = Math.min(devicePixelRatio, 2);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0,0,width,height);
  // 도곽과 좌표선은 거리 척도가 아닌 탐색 보조선
  const w = baseWidth * state.zoom, h = baseHeight * state.zoom;
  const x = originX - state.center[0] * w, y = originY - state.center[1] * h;
  atlas.draw(context, x, y, w, h,{direct:true});
  context.save(); context.beginPath(); context.rect(x, y, w, h); context.clip();
  context.strokeStyle = '#263f3313'; context.lineWidth = .7;
  context.restore();
  context.strokeStyle = '#5d71593f'; context.lineWidth = .8; context.strokeRect(x - 5, y - 5, w + 10, h + 10);
  context.strokeStyle = '#f9f3da99'; context.strokeRect(x - 1, y - 1, w + 2, h + 2);
  updateLabels();
  stage.dataset.mapDrawMs = (performance.now() - started).toFixed(2);
}
function atlasReady() { stage.dataset.reliefReady = 'true'; drawMap(); }
function resize() {
  width = stage.clientWidth; height = stage.clientHeight;
  if (previousMobile !== mobile()) { previousMobile = mobile(); setExplorer(!previousMobile); }
  const ratio = Math.min(devicePixelRatio, 2); map.width = Math.round(width * ratio); map.height = Math.round(height * ratio);
  const left = 24, right = 24;
  const availableHeight = Math.max(80, height - 100);
  const aspect=world.width/world.height;
  baseWidth = Math.min(width - left - right, availableHeight * aspect);
  baseHeight = baseWidth / aspect;
  originX = width / 2; originY = 58 + availableHeight / 2;
  planet?.resize(width, height); drawMap();
}
function updateURL() {
  const parameters = new URLSearchParams();
  parameters.set('world',world.id);
  if (state.mode === 'planet') parameters.set('view', 'planet');
  if (state.selected) parameters.set('place', state.selected);
  if(state.record?.startsWith('entry:'))parameters.set('record',state.record);
  history.replaceState(null, '', `${location.pathname}${parameters.size ? `?${parameters}` : ''}`);
}
async function select(id) {
  const place = places.find(item => item.id === id); if (!place) return;
  if(workspace){if(!await workspace.openPlace(id))return;state.selected=id;$('#detail').hidden=true;renderList();updateURL();return;}
  state.selected = id; $('#detail').hidden = false;
  $('#detail-title').textContent = place.name; $('#detail-kind').textContent = `${place.area} / ${typeNames[place.type]}`;
  $('#detail-text').textContent = place.text; $('#detail-source').textContent = place.source;
  $('#detail-art').hidden=Boolean(place.viewSpan&&place.viewSpan<.005);
  const preview = document.createElement('canvas'); preview.width = 600; preview.height = 240;
  if (atlasDirty) { atlas = createAtlas(world, atlasReady, viewOptions); atlasDirty = false; }
  atlas.draw(preview.getContext('2d'), 300 - place.x * 2200, 120 - place.y * 1237, 2200, 1237, { preview: true });
  $('#detail-art').replaceChildren(preview); preview.style.width = '100%'; preview.style.height = '100%'; preview.style.objectFit = 'cover';
  drawMap();
  $('#announcement').textContent = `${place.name} 선택. ${place.text}`;
  renderList(); updateURL();
}
function focusPlace(place) {
  if (state.mode === 'planet') {if(place.viewSpan)planet?.focusView(place.x,place.y,place.viewSpan);else planet?.focus(place.x, place.y);}
  else { state.center = [place.x, place.y]; state.zoom = place.viewSpan?clamp(height/(baseHeight*place.viewSpan),.7,8192):mobile()?2.5:1.8; drawMap(); }
}
function reset() { state.center = [.5, .5]; state.zoom = 1; if (state.mode === 'planet') planet?.reset(); else drawMap(); }
function zoom(factor, anchor) {
  if (state.mode === 'planet') { planet?.zoom(factor); return; }
  const old = state.zoom, next = clamp(old * factor, .7, 8192);
  if (anchor) { state.center[0] += (anchor.x - originX) / baseWidth * (1 / old - 1 / next); state.center[1] += (anchor.y - originY) / baseHeight * (1 / old - 1 / next); }
  state.zoom = next; drawMap();
}
async function setMode(mode) {
  if (mode === state.mode || planetLoading) return;
  if (mode === 'planet' && !planet) {
    planetLoading = true; $('#planet-mode').disabled = true;$('#planet-mode').setAttribute('aria-busy','true');$('#planet-mode').lastChild.textContent='준비 중';
    try { const { createPlanet } = await import('./planet.mjs'); planet = createPlanet($('#planet'), world, updateLabels, (phase, point) => editor?.brush(phase, point),()=>editor?.brushSettings(),viewOptions); planet.resize(width, height); planet.setEditing(isEditing);await planet.ready; }
    catch (error) {planet?.dispose();planet=null;$('#planet').replaceChildren(); openDialog('<span class="eyebrow">PLANET VIEW</span><h2>행성을 열지 못했어요</h2><p>이 브라우저에서 3D 그래픽을 시작하지 못했습니다. 지도는 계속 사용할 수 있어요. 브라우저의 그래픽 가속 설정을 확인하거나 새로고침해 주세요.</p>'); console.error(error); return; }
    finally { planetLoading = false; $('#planet-mode').disabled = false;$('#planet-mode').setAttribute('aria-busy','false');$('#planet-mode').lastChild.textContent='행성'; }
  }
  if(mode==='map'&&planet){const view=planet.view();state.center=view.center;state.zoom=clamp(height/(baseHeight*view.spanV),.7,8192);}
  state.mode = mode; document.body.classList.toggle('planet-mode', mode === 'planet');
  atlas?.setActive(mode==='map');
  viewSettings.setMode(mode);
  map.hidden = mode !== 'map'; $('#planet').hidden = mode !== 'planet';
  $('#map-mode').setAttribute('aria-pressed', String(mode === 'map')); $('#planet-mode').setAttribute('aria-pressed', String(mode === 'planet'));
  $('#view-description').textContent = `${world.star}의 빛, ${world.moon || '위성 없는'} 하늘,  동주기자전`;
  $('#interaction-hint').textContent = mode === 'planet' ? '드래그로 회전,  스크롤로 확대' : '드래그로 이동,  스크롤로 확대';
  if (mode === 'planet') { if (planetDirty) { planet.update(world); planetDirty = false; } if (state.zoom === 1 && state.center[0] === .5 && state.center[1] === .5) planet.reset(); else planet.focusView(...state.center,height/(baseHeight*state.zoom)); planet.start(); }
  else { planet?.stop(); drawMap(); }
  updateLabels(); updateURL(); $('#announcement').textContent = mode === 'planet' ? '행성 보기' : '지도 보기';
}

const pointers = new Map(); let lastPinch = 0, brushStarted = false;
function mapUV(event) { const rect = map.getBoundingClientRect(); const u = state.center[0] + (event.clientX - rect.left - originX) / (baseWidth * state.zoom); const v = state.center[1] + (event.clientY - rect.top - originY) / (baseHeight * state.zoom); return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null; }
map.addEventListener('pointerdown', event => { if (isEditing && pointers.size) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); map.setPointerCapture(event.pointerId); if (isEditing) { const point = mapUV(event); brushStarted = Boolean(point); if (point) editor.brush('start', point); } });
map.addEventListener('pointermove', event => {
  const settings=editor?.brushSettings(),uv=mapUV(event);
  brushCursor.hidden=!settings?.enabled||!uv;
  if(!brushCursor.hidden){const point=mapPosition(...uv);brushCursor.style.left=`${point.x}px`;brushCursor.style.top=`${point.y}px`;brushCursor.style.width=`${Math.min(baseWidth*state.zoom,settings.radius*baseWidth*state.zoom/Math.max(.06,Math.sin(uv[1]*Math.PI)))}px`;brushCursor.style.height=`${settings.radius*2*baseHeight*state.zoom}px`;}
  const previous = pointers.get(event.pointerId); if (!previous) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (isEditing) { const point = mapUV(event); if (point && brushStarted) editor.brush('move', point); return; }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinch) zoom(distance / lastPinch); lastPinch = distance;
  } else {
    state.center[0] = clamp(state.center[0] - (event.clientX - previous.x) / (baseWidth * state.zoom), -.2, 1.2);
    state.center[1] = clamp(state.center[1] - (event.clientY - previous.y) / (baseHeight * state.zoom), -.2, 1.2); drawMap();
  }
});
map.addEventListener('pointerleave',()=>{brushCursor.hidden=true;});
const release = event => { if (!pointers.has(event.pointerId)) return; if (isEditing && brushStarted) editor.brush('end'); brushStarted = false; pointers.delete(event.pointerId); lastPinch = 0; };
map.addEventListener('pointerup', release); map.addEventListener('pointercancel', release); map.addEventListener('lostpointercapture', release);
map.addEventListener('wheel', event => { event.preventDefault(); const rect = map.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }); }, { passive: false });
map.addEventListener('keydown', event => {
  const delta = { ArrowLeft: [-.06, 0], ArrowRight: [.06, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] }[event.key];
  if (delta) { event.preventDefault(); state.center = state.center.map((v, i) => clamp(v + delta[i] / state.zoom, -.2, 1.2)); drawMap(); }
});
function switchView(mode) {
  if (mode === state.mode || planetLoading) return;
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => setMode(mode));
  else setMode(mode);
}
$('#map-mode').addEventListener('click', () => switchView('map')); $('#planet-mode').addEventListener('click', () => switchView('planet'));
$('#zoom-in').addEventListener('click', () => zoom(1.3)); $('#zoom-out').addEventListener('click', () => zoom(1 / 1.3)); $('#reset').addEventListener('click', reset);
$('#toggle-labels').addEventListener('click', () => { state.labels = !state.labels; $('#toggle-labels').setAttribute('aria-pressed', String(state.labels)); updateLabels(); });
$('#search').addEventListener('input', renderList);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); renderList(); }));
function setExplorer(open) { $('#explorer-toggle').setAttribute('aria-expanded', String(open)); $('#explorer-content').hidden = !open; }
$('#explorer-toggle').addEventListener('click', () => setExplorer($('#explorer-content').hidden));
function updateListOverflow(){const list=$('#place-list');$('#more-places').hidden=list.scrollHeight-list.clientHeight-list.scrollTop<4;}
$('#place-list').addEventListener('scroll',updateListOverflow,{passive:true});
new ResizeObserver(updateListOverflow).observe($('#place-list'));
$('#more-places').addEventListener('click',()=>{$('#place-list').scrollBy({top:Math.max(100,$('#place-list').clientHeight*.75),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
function closeDetail() { $('#detail').hidden = true; state.selected = null; renderList(); updateURL(); }
$('#close-detail').addEventListener('click', closeDetail); $('#focus-place').addEventListener('click', () => focusPlace(places.find(p => p.id === state.selected)));

function openDialog(html) { $('#dialog-body').innerHTML = html; $('#dialog').showModal(); }
$('#close-dialog').addEventListener('click', () => $('#dialog').close());
$('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) { const rect = $('#dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#dialog').close(); } });
function showSource() {
  if(world.terrainSource){
    openDialog('<span class="eyebrow">TERRAIN SOURCES</span><h2>샘플 지형의 출처</h2><p>대륙과 화산호는 절차적으로 생성한 예제입니다. 상세 산악 지역은 알프스의 고도 수치자료를 새로운 위치와 높이로 재구성했습니다. 모두 운도의 세계관과 별도로 편집하고 저장됩니다.</p><p><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a><br>Produced using Copernicus data and information funded by the European Union - EU-DEM layers.</p><p>원본 고도는 미터 단위로 반올림했으며, 세계 안의 위치와 고도 배율, 가장자리 연결을 변경했습니다. 가까운 급경사면에는 생성한 작은 굴곡을 더했습니다. 지표 색상과 눈은 수치로 계산하며 위성사진은 사용하지 않습니다.</p><p><a href="'+import.meta.env.BASE_URL+'data/alpine-v1.json" target="_blank" rel="noopener">수치자료 기록과 원본 타일</a></p>');return;
  }
  openDialog(`<span class="eyebrow">THE FIRST MAP</span><h2>세계의 첫 번째 모습</h2><p>한 장의 종이에 그려진 숲과 바다, 도시와 산맥. 이 지도에서 WM의 세계가 시작됩니다.</p><div class="image-scroll"><img class="reference-image" src="${import.meta.env.BASE_URL}reference/original-photo.png" alt="사용자가 직접 그린 WM 세계 지도 원본. 북서쪽 숲, 중앙 내해와 반도, 동쪽 큰바다, 남쪽 산맥." tabindex="0" role="button" aria-label="원본 지도 확대 또는 축소" aria-pressed="false"></div><p>사진을 누르면 원본 크기로 볼 수 있어요. 디지털 지도의 일부 이름과 위치는 확인 중입니다. 행성은 현재 지도를 구면에 펼친 탐색용 표현이며, 실제 거리와 행성 전체 범위는 아직 미정입니다.</p>`);
  const image = $('.reference-image'); const toggle = () => { image.classList.toggle('full-size'); image.setAttribute('aria-pressed', String(image.classList.contains('full-size'))); };
  image.addEventListener('click', toggle); image.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
}
$('#source-button').addEventListener('click', showSource);
$('#help').addEventListener('click', () => openDialog('<span class="eyebrow">EXPLORING THE WORLD</span><h2>지도 읽는 법</h2><div class="key-guide"><kbd>드래그 / 방향키</kbd><span>지도 이동, 행성 회전</span><kbd>스크롤 / + / −</kbd><span>확대와 축소</span><kbd>두 손가락</kbd><span>폰에서 확대와 축소</span><kbd>/</kbd><span>장소 검색</span><kbd>Esc</kbd><span>장소 정보 닫기</span><kbd>Aa</kbd><span>지명 표시와 숨기기</span></div><p>장소를 고르면 설명을 볼 수 있어요. 지도와 행성을 바꿔도 선택한 장소는 유지됩니다.</p>'));
$('#about-button').addEventListener('click', () => openDialog('<span class="eyebrow">WITCH MENDOKUSAI</span><h2>이 세계에 관하여</h2><p>숲속의 마녀 욘과 함께 사는 인형들. 서로 다른 놀이와 이야기가 같은 세계에 쌓이는 Witch Mendokusai의 기록입니다.</p><p>이곳은 WM의 세계, 인물, 역사와 게임을 담는 공간입니다. 지금은 첫 번째 지도를 펼치고 있습니다.</p><button class="text-button" id="about-map">첫 번째 지도 보기 ↗</button>'));
$('#dialog-body').addEventListener('click', event => { if (event.target.id === 'about-map') { $('#dialog').close(); showSource(); } });
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
  workspace?.show({world:'place',characters:'person',archive:'lore'}[button.dataset.page]);
  document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b===button);if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}));
document.addEventListener('keydown', event => {
  if ($('#dialog').open || ['INPUT', 'TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === '/') { event.preventDefault(); document.body.classList.add('outline-open');document.querySelector('.record-search input')?.focus(); }
  if (event.key === '+' || event.key === '=') zoom(1.3);
  if (event.key === '-') zoom(1 / 1.3);
  if (event.key === 'Escape' && state.selected) closeDetail();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) planet?.stop(); else if (state.mode === 'planet') planet?.start(); });
new ResizeObserver(resize).observe(stage);
function changedWorld(next, rebuild,detailOnly=false) {
  const started = performance.now();
  const changedId = world.id !== next.id;
  world = next; places = world.places;
  $('#source-button').innerHTML=world.terrainSource?'지형 자료 출처 <span>↗</span>':'첫 번째 지도 <span>↗</span>';
  if(rebuild&&detailOnly){atlas?.updateDetails(world);planet?.updateDetails(world);}
  else if (rebuild) { atlasDirty = true; planetDirty = true; if (state.mode === 'planet' && planet) { planet.update(world); planetDirty = false; } }
  planet?.configure(world);
  document.querySelector('.atlas-heading h1').textContent = world.name;
  $('#view-description').textContent = `${world.star}의 빛, ${world.moon || '위성 없는'} 하늘,  동주기자전`;
  document.title = `${world.name}, WM 세계`;
  if (changedId || !places.some(p => p.id === state.selected)) { state.selected = null; $('#detail').hidden = true; }
  if(changedId)state.record=null;
  const signature = JSON.stringify(places);
  if (signature !== placesSignature) { placesSignature = signature; buildMarkers(); renderList(); }
  workspace?.update(world);
  drawMap(); updateURL();
  if(changedId)resize();
  stage.dataset.updateMs = (performance.now() - started).toFixed(2);
}
function placeForm(point, save, existing) {
  openDialog('<span class="eyebrow">A PLACE IN THE WORLD</span><h2>장소 기록</h2><form id="place-form" class="world-form"><label>이름<input name="name" required maxlength="100"></label><label>지역<input name="area" maxlength="5000"></label><label>분류<select name="type"></select></label><div class="field-pair"><label>경도<input name="longitude" type="number" min="-180" max="180" step=".01" required></label><label>위도<input name="latitude" type="number" min="-90" max="90" step=".01" required></label></div><label>설명<textarea name="text" rows="4" maxlength="30000"></textarea></label><button type="submit" class="primary-button">장소 저장</button></form>');
  const form = $('#place-form'); form.elements.name.value = existing?.name || ''; form.elements.area.value = existing?.area || ''; form.elements.text.value = existing?.text || '';
  for (const [value, label] of Object.entries(typeNames)) { const option = document.createElement('option'); option.value = value; option.textContent = label; form.elements.type.append(option); }
  form.elements.type.value = existing?.type || 'city'; form.elements.longitude.value = (point[0] * 360 - 180).toFixed(2); form.elements.latitude.value = (90 - point[1] * 180).toFixed(2);
  if (existing) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '장소 삭제'; form.append(remove); remove.addEventListener('click', () => { editor.removePlace(existing.id); $('#dialog').close(); }); }
  form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); const name = String(data.get('name')).trim(); if (!name) return; const place = { id: existing?.id || `place-${Date.now()}`, name, area: String(data.get('area')), text: String(data.get('text')), type: String(data.get('type')), source: '사용자 작성', x: (Number(data.get('longitude')) + 180) / 360, y: (90 - Number(data.get('latitude'))) / 180 }; save(place); $('#dialog').close(); });
}
const editPlaceButton = document.createElement('button'); editPlaceButton.className = 'text-button'; editPlaceButton.id = 'edit-place'; editPlaceButton.textContent = '장소 수정'; $('.detail-body').append(editPlaceButton);
editPlaceButton.addEventListener('click', () => { const place = places.find(p => p.id === state.selected); if (place) placeForm([place.x, place.y], values => { editor.editPlace(place, values); select(place.id); }, place); });
$('#edit-toggle').addEventListener('click', () => editor?.toggle());
$('#world-library').addEventListener('click',()=>editor?.openLibrary());
requestAnimationFrame(() => {
  try {
    const parameters = new URLSearchParams(location.search); const selected = parameters.get('place'); const view = parameters.get('view');
    atlas = createAtlas(world, atlasReady, viewOptions);
    editor = createEditor(world, { change: changedWorld, reset, beforeWorldChange:()=>workspace?.flush(),beforeExport:()=>workspace?.prepareExport(), selectPlace:select, dialog: openDialog, closeDialog: () => $('#dialog').close(), addPlace: (point, save) => placeForm(point, save), editMode: value => { isEditing = value; planet?.setEditing(value); map.style.cursor = value ? 'crosshair' : 'grab'; } });
    workspace=createWorkspace(world,{opened:key=>{state.record=key;updateURL();},writeRecord:editor.writeRecord,addEntry:editor.addEntry,removeRecord:editor.removeRecord,undo:editor.undoEdit,redo:editor.redoEdit,history:editor.history,selectPlace:select,focusPlace:id=>{const place=places.find(p=>p.id===id);if(place)focusPlace(place);},editPlace:id=>{const place=places.find(p=>p.id===id);if(place)placeForm([place.x,place.y],values=>editor.editPlace(place,values),place);},newPlace:editor.beginPlace,file:action=>$('#'+({save:'save-world',export:'export-world',import:'import-world'}[action])).click()});
    changedWorld(world, false); resize(); renderList(); setExplorer(!mobile()); $('#loading').hidden = true;
    const record=parameters.get('record'),remembered=workspace.recoveryKey();
    if(record&&world.entries.some(e=>`entry:${e.id}`===record)){if(places.some(p=>p.id===selected))state.selected=selected;workspace.openRecord(record);}
    else if (selected && places.some(p => p.id === selected)) { select(selected); focusPlace(places.find(p => p.id === selected)); }
    else if(remembered?.startsWith('entry:')&&world.entries.some(e=>`entry:${e.id}`===remembered))workspace.openRecord(remembered);
    else if(remembered?.startsWith('place:')&&places.some(p=>`place:${p.id}`===remembered))select(remembered.slice(6));
    else if(places.length)select(places.find(p=>p.id==='yon')?.id||places[0].id);
    if (view === 'planet') setMode('planet').then(()=>{const place=places.find(p=>p.id===selected);if(place&&state.selected===selected)focusPlace(place);});
  } catch (error) { $('#loading').textContent = '지도를 불러오지 못했습니다. 새로고침해 주세요.'; console.error(error); }
});
}
start().catch(error=>{
  const loading=document.querySelector('#loading');loading.replaceChildren();
  const message=document.createElement('p');message.textContent=`세계를 불러오지 못했습니다. ${error.message}`;
  const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>location.reload();
  const home=document.createElement('a');home.href='?world=undo';home.textContent='운도 열기';
  loading.append(message,retry,home);console.error(error);
});
