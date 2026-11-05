const { invoke } = window.__TAURI__.core;
const appWindow = window.__TAURI__.window.getCurrentWindow();
const $ = (id) => document.getElementById(id);
let dir = '';

function setStep(step) {
  document.body.dataset.step = step;
}

function setDir(next) {
  dir = next;
  $('path').textContent = dir;
}

$('install').addEventListener('click', async () => {
  setStep('run');
  try {
    await invoke('install', { dir });
    setStep('done');
  } catch (e) {
    $('error').textContent = String(e);
    setStep('fail');
  }
});

$('change').addEventListener('click', async () => {
  const picked = await invoke('pick_dir', { current: dir });
  if (picked) setDir(picked);
});

$('launch').addEventListener('click', async () => {
  try {
    await invoke('launch', { dir });
  } catch (e) {
    $('error').textContent = String(e);
    setStep('fail');
  }
});

$('min').addEventListener('click', () => void appWindow.minimize());
/* 설치 중 닫으면 NSIS 만 남아 결과를 못 알림 */
$('close').addEventListener('click', () => {
  if (document.body.dataset.step !== 'run') void appWindow.close();
});

void invoke('info').then((info) => {
  setDir(info.dir);
  $('install').textContent = info.installed ? '다시 설치' : '설치';
  $('change').hidden = info.installed;
  void appWindow.show();
});
