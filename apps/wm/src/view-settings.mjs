const defaults = Object.freeze({ clouds: true, cloudShadows: true, dayNight: true, terrainShading: true, atmosphere: true, rivers: true, terrainTilt:true });
const key = 'wm.view-settings.v1';

export function loadViewSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  return Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, typeof saved?.[name] === 'boolean' ? saved[name] : value]));
}

export function createViewSettings(values, onChange) {
  const button = document.querySelector('#view-settings-toggle');
  const panel = document.createElement('section');
  panel.id = 'view-settings'; panel.hidden = true; panel.setAttribute('aria-label', '표시 설정');
  panel.innerHTML = `<header><h2>표시 설정</h2><button type="button" aria-label="표시 설정 닫기">×</button></header>
    <div class="view-options">
    <label data-planet-option><input type="checkbox" name="clouds">구름</label>
    <label data-planet-option><input type="checkbox" name="cloudShadows">구름 그림자</label>
    <label data-planet-option><input type="checkbox" name="dayNight">낮과 밤</label>
    <label><input type="checkbox" name="terrainShading">지형 음영</label>
    <label data-planet-option><input type="checkbox" name="atmosphere">대기</label>
    <label data-planet-option><input type="checkbox" name="terrainTilt">가까이서 기울여 보기</label>
    <label data-map-option><input type="checkbox" name="rivers">하천</label></div>
    <footer><button type="button" data-preset="terrain">지형만 보기</button><button type="button" data-preset="natural">기본 표시</button></footer>`;
  document.querySelector('main').append(panel);
  const inputs = [...panel.querySelectorAll('input')];
  const fill = () => { for (const input of inputs) input.checked = values[input.name]; };
  const show = open => { panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); };
  const commit = () => { fill(); try { localStorage.setItem(key, JSON.stringify(values)); } catch {} onChange(values); };
  button.addEventListener('click', () => show(panel.hidden));
  panel.querySelector('header button').addEventListener('click', () => { show(false); button.focus(); });
  for (const input of inputs) input.addEventListener('change', () => { values[input.name] = input.checked; commit(); });
  panel.querySelectorAll('[data-preset]').forEach(control => control.addEventListener('click', () => {
    Object.assign(values, control.dataset.preset === 'natural' ? defaults : { clouds: false, cloudShadows: false, dayNight: false, terrainShading: true, atmosphere: false, rivers: false }); commit();
  }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { show(false); button.focus(); } });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) show(false); });
  fill();
  return { setMode(mode) { panel.querySelectorAll('[data-planet-option]').forEach(row => { row.hidden = mode !== 'planet'; }); panel.querySelectorAll('[data-map-option]').forEach(row => { row.hidden = mode !== 'map'; }); } };
}
