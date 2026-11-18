/* 로그인된 Gemini의 영상 도구만 사용. 생성 결과와 작업 창은 보존. */
async function geminiVideo(tabId, prompt, { resume = false, expectedUrl = '', onConversation = () => {} } = {}) {
  if (!resume && (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000)) throw new Error('영상 설명을 확인하세요');
  const run = async (action, value) => {
    const [reply] = await chrome.scripting.executeScript({ target: { tabId }, ...(action === 'download' ? { world: 'MAIN' } : {}), func: (op, text, isResume, expected) => {
      if (location.hostname !== 'gemini.google.com') return { error: 'Gemini 로그인이나 페이지 확인 필요' };
      if (isResume && location.href !== expected) return { error: 'Gemini 작업 대화가 바뀜' };
      const button = (label) => [...document.querySelectorAll('button,[role="menuitemcheckbox"]')].find((e) =>
        (e.getAttribute('aria-label') || '').includes(label) || (e.innerText || '').trim().startsWith(label));
      if (op === 'menu') { const el = button('업로드 및 도구') || button('Upload files and more'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'mode') { const el = button('동영상 만들기') || button('Create video'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'submit') {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        const placeholder = editor?.getAttribute('data-placeholder') || '';
        if (!editor || !button('동영상 선택 해제') && !button('Remove video') && !/동영상을 설명|describe (your|the) video/i.test(placeholder)) return { pending: true };
        editor.focus(); document.execCommand('insertText', false, text);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        return { ok: true };
      }
      if (op === 'send') { const el = button('메시지 보내기') || button('Send message'); if (!el || el.disabled) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'resend') {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        const el = button('메시지 보내기') || button('Send message');
        if (location.pathname !== '/app' || !editor || (editor.innerText || '').trim() !== text.trim() || !el || el.disabled) return { ok: true };
        el.click(); return { ok: true };
      }
      if (op === 'ready' || op === 'download') {
        const matches = [...document.querySelectorAll('button')].filter(e => /동영상 다운로드|Download video/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')));
        if (matches.length > 1) return { error: '영상 결과가 여러 개' };
        const el = matches[0]; if (!el || el.disabled) return { pending: true };
        if (op === 'ready') {
          const media = [...document.querySelectorAll('audio,video')].map(e => e.currentSrc || e.getAttribute('src') || '').filter(Boolean);
          return { ok: true, mediaUrl: media.length === 1 ? media[0] : '' };
        }
        return new Promise((resolve) => {
          const proto = HTMLAnchorElement.prototype, descriptor = Object.getOwnPropertyDescriptor(proto, 'click'), original = proto.click;
          const urlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'), originalCreate = URL.createObjectURL;
          if (typeof original !== 'function' || (descriptor && !descriptor.configurable) || typeof originalCreate !== 'function' || !urlDescriptor?.configurable || !('value' in urlDescriptor)) return resolve({ error: '다운로드 확인을 준비하지 못함' });
          const urls = new Set(), types = new Set(); let timer;
          const finish = () => { clearTimeout(timer); if (proto.click === wrapped) { if (descriptor) Object.defineProperty(proto, 'click', descriptor); else delete proto.click; } if (URL.createObjectURL === wrappedCreate) Object.defineProperty(URL, 'createObjectURL', urlDescriptor); resolve(urls.size <= 1 ? { ok: true, downloadUrls: [...urls], types: [...types] } : { error: '영상 다운로드 결과가 여러 개' }); };
          const observe = (href) => { try { if (href.startsWith('blob:') && new URL(href).origin === location.origin) urls.add(href); } catch {} };
          const wrapped = function (...args) {
            const href = this.href || '', download = this.hasAttribute('download') && /\.mp4$/i.test(this.getAttribute('download') || '');
            const result = original.apply(this, args);
            if (download) observe(href);
            return result;
          };
          const wrappedCreate = function (...args) { const result = originalCreate.apply(this, args), type = args[0]?.type || ''; types.add(/^audio\//i.test(type) ? 'audio' : /^video\//i.test(type) ? 'video' : type ? 'other' : 'empty'); if (/^video\/mp4$/i.test(type)) observe(result); return result; };
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
  let focusCheck = async () => {};
  const wait = async (action, value, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await focusCheck();
      const result = await run(action, value);
      if (result.error) throw new Error(result.error);
      if (result.ok) return result;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Gemini 영상 ' + action + ' 대기 시간 초과');
  };
  if (!resume) {
    await wait('menu', '', 30000);
    await wait('mode', '', 10000);
    await wait('submit', prompt, 45000);
    await wait('send', '', 10000);
  }
  const workTab = await chrome.tabs.get(tabId), windowId = workTab.windowId;
  let unsafe = false;
  const onFocusChanged = (id) => { if (id === windowId) unsafe = true; };
  chrome.windows.onFocusChanged.addListener(onFocusChanged);
  focusCheck = async () => { if (unsafe || (await chrome.windows.get(windowId)).focused) throw new Error('Gemini 작업 창을 사용 중이어서 다운로드 확인을 멈춤'); };
  try {
  await focusCheck();
  let conversation;
  const navigationStart = Date.now(), navigationEnd = navigationStart + 45000;
  let retriedSend = false;
  while (Date.now() < navigationEnd) {
    await focusCheck();
    conversation = new URL((await chrome.tabs.get(tabId)).url || 'https://invalid.invalid/');
    if (conversation.origin === 'https://gemini.google.com' && /^\/app\/[^/]+$/.test(conversation.pathname)) break;
    if (!resume && !retriedSend && Date.now() - navigationStart >= 15000) { retriedSend = true; await run('resend', prompt); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (conversation.origin !== 'https://gemini.google.com' || !/^\/app\/[^/]+$/.test(conversation.pathname)) throw new Error('Gemini 영상 대화를 식별하지 못함');
  if (resume && conversation.href !== expectedUrl) throw new Error('Gemini 작업 대화가 바뀜');
  await onConversation(conversation.href);
  const ready = await wait('ready', '', 240000);
  if ((await chrome.tabs.get(tabId)).url !== conversation.href) throw new Error('Gemini 작업 대화가 바뀜');
  if (unsafe || (await chrome.windows.get(windowId)).focused) throw new Error('Gemini 작업 창 사용 중 결과 확인을 멈춤');
  const started = Date.now(), ids = new Set(), observed = new Set();
  const onCreated = (item) => { if (Number.isInteger(item.id)) ids.add(item.id); };
  chrome.downloads.onCreated.addListener(onCreated);
  try {
    const clicked = await wait('download', '', 10000);
    while (Date.now() - started < 60000) {
      for (const id of ids) {
        const items = await chrome.downloads.search({ id });
        const item = items[0];
        if (item) observed.add([item.mime || 'unknown', item.referrer ? 'referrer' : 'no-referrer', item.byExtensionId ? 'extension' : 'page', (item.url || '').startsWith('blob:') ? 'blob' : 'non-blob'].join('/'));
        const sameBlob = clicked.downloadUrls.includes(item?.url);
        const sameMedia = !!ready.mediaUrl && (item?.url === ready.mediaUrl || item?.finalUrl === ready.mediaUrl);
        // Worker-generated blobs are invisible to the page interceptor.
        // An overlapping download makes the fallback ambiguous, so reject it.
        const singleWorkerBlob = ids.size === 1 && Date.now() - started >= 12000 &&
          /^blob:https:\/\/gemini\.google\.com\//.test(item?.url || '') && item?.mime === 'video/mp4' && !item?.byExtensionId;
        if (!sameBlob && !sameMedia && !singleWorkerBlob) continue;
        if (item?.state === 'interrupted') throw new Error('영상 파일 다운로드가 중단됨');
        if (item?.state === 'complete' && /\.mp4$/i.test(item.filename || '')) {
          if (unsafe || (await chrome.windows.get(windowId)).focused) throw new Error('Gemini 작업 창 사용 중 결과 확인을 멈춤');
          return { ok: true, filename: item.filename, bytes: item.fileSize };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('영상 파일 다운로드 확인 실패 (' + ([...observed].join(', ') || '다운로드 이벤트 없음') + ')');
  } finally {
    chrome.downloads.onCreated.removeListener(onCreated);
  }
  } finally {
    chrome.windows.onFocusChanged.removeListener(onFocusChanged);
  }
}
