import { createWorld, validateWorld, paint, strokePoints } from './terrain.mjs';
import { storeWorld, readWorld, listWorlds, storageProblem } from './storage.mjs';
import { generateWorld } from './generation.mjs';

const clone = value => ({...value,heights:value.heights.slice(),biomes:value.biomes.slice(),places:value.places.map(place=>({...place}))});
export async function loadInitial() {
  try { const id = localStorage.getItem('wm.active-world') || 'undo'; const raw = await readWorld(id); return raw ? validateWorld(raw) : await generateWorld({ original: true, seed:27 }); }
  catch { return createWorld({ original: true }); }
}
export function createEditor(initial, callbacks) {
  let world = initial, tool = 'raise', radius = .045, strength = .09, enabled = false, undo = [], redo = [], changed = false, lastPreview = 0;
  let previousPoint = null,busy=false,strokeActive=false;
  const panel = document.createElement('section'); panel.id = 'editor'; panel.hidden = true; panel.setAttribute('aria-label', '세계 편집');
  panel.innerHTML = `<div class="editor-head"><h2>세계 편집</h2><button id="editor-collapse" aria-label="편집 도구 접기" aria-expanded="true">⌄</button><button id="editor-close" aria-label="편집 닫기">×</button></div><div class="editor-scroll">
  <div class="world-picker"><label for="world-select">내 행성</label><select id="world-select"></select><button id="world-new">새로 만들기</button></div>
  <details class="world-settings"><summary>천체 설정</summary><div class="editor-fields"><label>행성 이름<input id="world-name" maxlength="100"></label><div class="field-pair"><label>항성<input id="star-name" maxlength="80"></label><label>위성<input id="moon-name" maxlength="80"></label></div></div>
  <p class="locked-note">동주기자전,  항성을 향한 면 고정</p></details>
  <fieldset><legend>지형 그리기</legend><div class="brush-tools"><button data-tool="raise" aria-pressed="true">육지 올리기</button><button data-tool="lower" aria-pressed="false">땅 깎기</button><button data-tool="forest" aria-pressed="false">숲</button><button data-tool="grass" aria-pressed="false">초원</button><button data-tool="desert" aria-pressed="false">사막</button><button data-tool="ice" aria-pressed="false">빙하</button><button data-tool="volcano" aria-pressed="false">화산</button><button data-tool="auto" aria-pressed="false">기후에 맞추기</button><button data-tool="place" aria-pressed="false">장소 추가</button><button data-tool="navigate" aria-pressed="false">이동, 회전</button></div>
  <label class="range-label">붓 크기<input id="brush-size" type="range" min="1" max="15" value="4.5" step=".5"></label><label class="range-label">붓 세기<input id="brush-strength" type="range" min="1" max="30" value="9"></label></fieldset>
  <details class="world-settings"><summary>행성 표현</summary><fieldset><label class="range-label">지형 높이<input id="relief" type="range" min=".1" max="3" step=".1"></label><label class="range-label">해수면<input id="sea-level" type="range" min="-.3" max=".3" step=".01"></label><label class="range-label">구름량<input id="clouds" type="range" min="0" max="1" step=".05"></label><label class="range-label">항성을 향한 경도<input id="sun-longitude" type="range" min="0" max="1" step=".01"></label></fieldset></details>
  <div class="history-actions"><button id="undo" disabled>실행 취소</button><button id="redo" disabled>다시 실행</button></div>
  <div class="file-actions"><button id="save-world">저장</button><button id="export-world">내보내기</button><button id="import-world">불러오기</button><input type="file" id="world-file" accept="application/json,.json" hidden></div>
  <p id="save-status" role="status">이 브라우저에 저장,  JSON 파일로 백업 가능</p></div>`;
  document.querySelector('main').append(panel);
  const $ = id => panel.querySelector(id);
  const status = message => { $('#save-status').textContent = message; };
  function setBusy(value){busy=value;panel.inert=value;panel.setAttribute('aria-busy',String(value));if(value){strokeActive=false;previousPoint=null;changed=false;}}
  function pushUndo() { undo.push(clone(world)); if (undo.length > 20) undo.shift(); redo = []; updateHistory(); }
  function updateHistory() { $('#undo').disabled = !undo.length; $('#redo').disabled = !redo.length; }
  async function save() {
    try { await storeWorld(world); status('이 브라우저에 저장됨,  JSON으로 백업 가능'); return true; }
    catch { status('브라우저 저장 공간이 부족하거나 차단됐어요. 내보내기로 파일을 보관해 주세요.'); return false; }
  }
  async function refreshList() {
    let entries=new Map();try{entries=await listWorlds();}catch{}entries.set(world.id,world.name);
    const select = $('#world-select'); select.replaceChildren();
    for (const [id, name] of entries) { const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option); } select.value = world.id;
  }
  function fill() {
    $('#world-name').value = world.name; $('#star-name').value = world.star; $('#moon-name').value = world.moon;
    $('#relief').value = world.relief; $('#sea-level').value = world.seaLevel; $('#clouds').value = world.clouds; $('#sun-longitude').value = world.sunU;
    refreshList(); updateHistory();
  }
  function notify({ rebuild = true } = {}) { callbacks.change(world, rebuild); }
  async function setWorld(next,signal) {
    try { await storeWorld(next,{signal}); }
    catch(error) { if(error.name==='AbortError')return false;status('새 행성을 저장하지 못했어요. 현재 행성은 그대로 유지합니다. 저장 공간을 확인해 주세요.'); return false; }
    localStorage.setItem('wm.active-world',next.id);
    world = next; undo = []; redo = []; fill(); status('이 브라우저에 저장됨,  JSON으로 백업 가능'); notify(); callbacks.reset(); return true;
  }
  function openNew() {
    callbacks.dialog(`<span class="eyebrow">A NEW WORLD</span><h2>새 행성 만들기</h2><form id="new-world-form" class="world-form"><label>행성 이름<input name="name" required maxlength="100" value="새 행성"></label><label>생성 방식<select name="template"><option value="generated">새로운 대륙</option><option value="blank">빈 바다에서 시작</option><option value="copy">현재 행성 복제</option><option value="undo">운도 원본에서 시작</option></select></label><label>생성 번호<input name="seed" type="number" min="1" max="999999" value="${Math.floor(Math.random() * 99999) + 1}" required></label><button class="primary-button" type="submit">행성 만들기</button><p>지금 작업 중인 행성은 그대로 보관됩니다.</p></form>`);
    const controller=new AbortController();document.querySelector('#dialog').addEventListener('close',()=>controller.abort(),{once:true});
    document.querySelector('#new-world-form').addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(event.target); const name = String(data.get('name')).trim(); if (!name) return;
      if(busy)return;setBusy(true);
      if (!await save()) {setBusy(false);return;}
      const template = data.get('template'), seed = Number(data.get('seed'));
      const button=event.target.querySelector('[type=submit]');button.disabled=true;button.textContent='지형을 만들고 있어요...';
      try{
        const next = template === 'copy' ? clone(world) : await generateWorld({ name, seed, original: template === 'undo', blank: template === 'blank' },controller.signal);
        if(!event.target.isConnected||!document.querySelector('#dialog').open)return;
        next.id = `world-${Date.now()}-${seed}`; next.name = name; if (await setWorld(next,controller.signal)) callbacks.closeDialog();
      }catch(error){if(error.name!=='AbortError')event.target.querySelector('p').textContent=error.message;}
      finally{button.disabled=false;button.textContent='행성 만들기';setBusy(false);}
    });
  }
  $('#world-new').addEventListener('click', openNew);
  $('#world-select').addEventListener('change', async event => {
    const id = event.target.value; if (id === world.id) return;
    if(busy)return;setBusy(true);
    if (!await save()) { event.target.value = world.id; setBusy(false);return; }
    try { await setWorld(validateWorld(await readWorld(id))); }
    catch (error) { status(error.message); event.target.value = world.id; }
    finally{setBusy(false);}
  });
  for (const [id, key] of [['#world-name', 'name'], ['#star-name', 'star'], ['#moon-name', 'moon']]) $(id).addEventListener('change', event => {
    const value = event.target.value.trim(); if (!value && key !== 'moon') { event.target.value = world[key]; return; }
    pushUndo(); world[key] = value; notify({ rebuild: false }); save().then(refreshList);
  });
  for (const [id, key] of [['#relief', 'relief'], ['#sea-level', 'seaLevel'], ['#clouds', 'clouds'], ['#sun-longitude', 'sunU']]) {
    let rangeStarted = false;
    $(id).addEventListener('input', event => { if (!rangeStarted) { pushUndo(); rangeStarted = true; } world[key] = Number(event.target.value); notify({ rebuild: !['clouds','relief'].includes(key) }); });
    $(id).addEventListener('change', () => { rangeStarted = false; save(); });
  }
  panel.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => { tool = button.dataset.tool; panel.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); callbacks.editMode(enabled && tool !== 'navigate'); }));
  $('#brush-size').addEventListener('input', event => { radius = Number(event.target.value) / 100; });
  $('#brush-strength').addEventListener('input', event => { strength = Number(event.target.value) / 100; });
  $('#undo').addEventListener('click', () => { if (!undo.length) return; redo.push(clone(world)); world = undo.pop(); fill(); notify(); save(); });
  $('#redo').addEventListener('click', () => { if (!redo.length) return; undo.push(clone(world)); world = redo.pop(); fill(); notify(); save(); });
  $('#save-world').addEventListener('click', save);
  $('#export-world').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(world)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${world.name.replace(/[\\/:*?"<>|]/g, '_')}.wm.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('세계 JSON 내보냄. 파일을 다른 기기에서 불러올 수 있어요.');
  });
  $('#import-world').addEventListener('click', () => $('#world-file').click());
  $('#world-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if(busy)return;setBusy(true);
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('64MB 이하의 세계 JSON만 불러올 수 있어요.');
      const imported = validateWorld(JSON.parse(await file.text())); if (!await save()) return;
      imported.id = `import-${Date.now()}`; if (await setWorld(imported)) status('세계 파일을 새 사본으로 불러와 저장했어요.');
    } catch (error) { status(`불러오지 못했어요: ${error.message}`); } finally { event.target.value = '';setBusy(false); }
  });
  function toggle(value = !enabled) {
    if(busy)return;
    enabled = value; panel.hidden = !enabled; document.body.classList.toggle('editing', enabled);
    document.querySelector('#edit-toggle').setAttribute('aria-pressed', String(enabled)); callbacks.editMode(enabled && tool !== 'navigate');
  }
  $('#editor-collapse').addEventListener('click',()=>{const folded=!$('.editor-scroll').hidden;$('.editor-scroll').hidden=folded;panel.classList.toggle('folded',folded);$('#editor-collapse').setAttribute('aria-expanded',String(!folded));$('#editor-collapse').setAttribute('aria-label',folded?'편집 도구 펼치기':'편집 도구 접기');$('#editor-collapse').textContent=folded?'⌃':'⌄';});
  $('#editor-close').addEventListener('click', () => toggle(false)); fill();if(storageProblem())status(storageProblem());
  return {
    toggle, save, current: () => world,brushSettings:()=>({radius,tool,enabled:enabled&&!busy&&tool!=='navigate'&&tool!=='place'}),
    brush(phase, point) {
      const started=performance.now();if(phase==='start')panel.dataset.brushMaxMs='0';
      try{
      if (!enabled || busy || tool === 'navigate') return;
      if (phase === 'start') {
        if (tool === 'place') { if (world.places.length >= 1000) { status('한 행성에는 장소를 1,000개까지 기록할 수 있어요.'); return; } callbacks.addPlace(point, place => { pushUndo(); world.places.push(place); notify({ rebuild: false }); save(); }); return; }
        pushUndo(); changed = false; previousPoint = null;strokeActive=true;
      }
      if(!strokeActive)return;
      if (phase === 'end') { if (changed) { notify(); save(); } changed = false; previousPoint = null;strokeActive=false; return; }
      if (tool === 'place' || !point) return;
      for (const sample of strokePoints(previousPoint, point, radius)) changed = paint(world, sample[0], sample[1], tool, radius, strength) || changed;
      previousPoint = point;
      if (performance.now() - lastPreview > 32) { lastPreview = performance.now(); notify(); }
      }finally{const elapsed=performance.now()-started;panel.dataset.brushMaxMs=Math.max(Number(panel.dataset.brushMaxMs||0),elapsed).toFixed(2);panel.dataset.brushPhase=phase;}
    },
    editPlace(place, values) { if(busy)return;pushUndo(); Object.assign(place, values); notify({ rebuild: false }); save(); },
    removePlace(id) { if(busy)return;pushUndo(); world.places = world.places.filter(place => place.id !== id); notify({ rebuild: false }); save(); },
  };
}
