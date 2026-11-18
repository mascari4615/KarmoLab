/* Gemini 음악 생성. 계정은 브라우저 세션 소유, 쿠키와 토큰을 전달하지 않음. */
async function geminiMusic(tabId, prompt, { resume = false, expectedUrl = '' } = {}) {
  if (!resume && (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000)) throw new Error('음악 설명을 확인하세요');
  const run = async (action, value) => {
    const [reply] = await chrome.scripting.executeScript({ target: { tabId }, ...(action === 'download' ? { world: 'MAIN' } : {}), func: (op, text, isResume, expected) => {
      if (location.hostname !== 'gemini.google.com') return { error: 'Gemini 로그인이나 페이지 확인 필요' };
      if (isResume && location.href !== expected) return { error: 'Gemini 작업 대화가 바뀜' };
      const nodes = (selector) => [...document.querySelectorAll(selector)];
      const button = (label) => nodes('button,[role="menuitem"],[role="menuitemcheckbox"]').find((e) =>
        (e.getAttribute('aria-label') || '').includes(label) || (e.innerText || '').trim().startsWith(label));
      if (op === 'menu') { const el = button('업로드 및 도구') || button('Upload files and more'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'mode') { const el = button('음악 만들기') || button('Create music'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'submit') {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        const placeholder = editor?.getAttribute('data-placeholder') || '';
        const music = button('음악 선택 해제') || button('Remove music') || /트랙을 설명|describe (your|the) track/i.test(placeholder);
        if (!editor || !music) return { pending: true, detail: `editor=${!!editor},music=${!!music}` };
        editor.focus(); document.execCommand('insertText', false, text);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        return { ok: true };
      }
      if (op === 'send') { const el = button('메시지 보내기') || button('Send message'); if (!el || el.disabled) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'ready') {
        const matches = nodes('button').filter(e => /트랙 다운로드|Download track/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')) && e.getClientRects().length);
        if (isResume && matches.length > 1) return { error: '복구할 음악 결과가 여러 개' };
        const el = matches[0]; if (!el) return { pending: true }; el.click(); return { ok: true };
      }
      if (op === 'download') {
        const el = button('오디오만') || button('Audio only'); if (!el) return { pending: true };
        return new Promise((resolve) => {
          const proto = HTMLAnchorElement.prototype, descriptor = Object.getOwnPropertyDescriptor(proto, 'click'), original = proto.click;
          const urlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'), originalCreate = URL.createObjectURL;
          if (typeof original !== 'function' || (descriptor && !descriptor.configurable) || typeof originalCreate !== 'function' || !urlDescriptor?.configurable || !('value' in urlDescriptor)) return resolve({ error: '다운로드 확인을 준비하지 못함' });
          const urls = new Set(); let timer, settle;
          const finish = () => { clearTimeout(timer); clearTimeout(settle); if (proto.click === wrapped) { if (descriptor) Object.defineProperty(proto, 'click', descriptor); else delete proto.click; } if (URL.createObjectURL === wrappedCreate) Object.defineProperty(URL, 'createObjectURL', urlDescriptor); resolve(urls.size ? { ok: true, downloadUrls: [...urls] } : { error: '음악 다운로드 연결을 확인하지 못함' }); };
          const observe = (href) => { try { if (href.startsWith('blob:') && new URL(href).origin === location.origin) { urls.add(href); clearTimeout(settle); settle = setTimeout(finish, 750); } } catch {} };
          const wrapped = function (...args) {
            const href = this.href || '', download = this.hasAttribute('download');
            const result = original.apply(this, args);
            if (download) observe(href);
            return result;
          };
          const wrappedCreate = function (...args) { const result = originalCreate.apply(this, args); observe(result); return result; };
          try {
            Object.defineProperty(proto, 'click', descriptor && 'value' in descriptor ? { ...descriptor, value: wrapped } : { value: wrapped, configurable: true, writable: true, enumerable: descriptor?.enumerable || false });
            Object.defineProperty(URL, 'createObjectURL', { ...urlDescriptor, value: wrappedCreate });
            timer = setTimeout(finish, 10000);
            el.click();
          } catch { finish(); }
        });
      }
      return { error: '지원하지 않는 작업' };
    }, args: [action, value || '', resume, expectedUrl] });
    return reply?.result || { error: '페이지 응답 없음' };
  };
  const wait = async (action, value, ms) => {
    const end = Date.now() + ms;
    let detail = '';
    while (Date.now() < end) {
      const result = await run(action, value);
      if (result.error) throw new Error(result.error);
      if (result.ok) return result;
      detail = result.detail || '';
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Gemini 음악 ' + action + ' 대기 시간 초과' + (detail ? ' (' + detail + ')' : ''));
  };
  if (!resume) {
    await wait('menu', '', 30000);
    await wait('mode', '', 10000);
    await wait('submit', prompt, 45000);
    await wait('send', '', 10000);
  }
  await wait('ready', '', 150000);
  const conversation = new URL((await chrome.tabs.get(tabId)).url || 'https://invalid.invalid/');
  if (conversation.origin !== 'https://gemini.google.com' || !/^\/app\/[^/]+$/.test(conversation.pathname)) {
    throw new Error('Gemini 음악 대화를 식별하지 못함');
  }
  if (resume && conversation.href !== expectedUrl) throw new Error('Gemini 작업 대화가 바뀜');
  const started = Date.now(), ids = new Set();
  const onCreated = (item) => { if (Number.isInteger(item.id)) ids.add(item.id); };
  chrome.downloads.onCreated.addListener(onCreated);
  try {
    const clicked = await wait('download', '', 10000);
    while (Date.now() - started < 60000) {
      for (const id of ids) {
        const items = await chrome.downloads.search({ id });
        const item = items[0];
        if (!clicked.downloadUrls.includes(item?.url)) continue;
        if (item?.state === 'interrupted') throw new Error('음악 파일 다운로드가 중단됨');
        if (item?.state === 'complete' && /\.mp3$/i.test(item.filename || '')) {
          return { ok: true, filename: item.filename, bytes: item.fileSize };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('음악 파일 다운로드 확인 실패');
  } finally {
    chrome.downloads.onCreated.removeListener(onCreated);
  }
}
