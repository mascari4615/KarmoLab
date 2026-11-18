/* 로그인된 Gemini의 영상 도구만 사용. 생성 결과와 작업 창은 보존. */
async function geminiVideo(tabId, prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('영상 설명을 확인하세요');
  const run = async (action, value) => {
    const [reply] = await chrome.scripting.executeScript({ target: { tabId }, ...(action === 'download' ? { world: 'MAIN' } : {}), func: (op, text) => {
      if (location.hostname !== 'gemini.google.com') return { error: 'Gemini 로그인이나 페이지 확인 필요' };
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
      if (op === 'ready' || op === 'download') {
        const el = button('동영상 다운로드') || button('Download video'); if (!el || el.disabled) return { pending: true };
        if (op === 'ready') return { ok: true };
        return new Promise((resolve) => {
          const proto = HTMLAnchorElement.prototype, descriptor = Object.getOwnPropertyDescriptor(proto, 'click'), original = proto.click;
          if (typeof original !== 'function' || (descriptor && !descriptor.configurable)) return resolve({ error: '다운로드 확인을 준비하지 못함' });
          let timer;
          const finish = (result) => { clearTimeout(timer); if (proto.click === wrapped) { if (descriptor) Object.defineProperty(proto, 'click', descriptor); else delete proto.click; } resolve(result); };
          const wrapped = function (...args) {
            const href = this.href || '', download = this.hasAttribute('download');
            const result = original.apply(this, args);
            let matches = false;
            try { matches = download && href.startsWith('blob:') && new URL(href).origin === location.origin; } catch {}
            if (matches) finish({ ok: true, downloadUrl: href });
            return result;
          };
          try {
            Object.defineProperty(proto, 'click', descriptor && 'value' in descriptor ? { ...descriptor, value: wrapped } : { value: wrapped, configurable: true, writable: true, enumerable: descriptor?.enumerable || false });
            timer = setTimeout(() => finish({ error: '영상 다운로드 연결을 확인하지 못함' }), 10000);
            el.click();
          } catch { finish({ error: '영상 다운로드 동작 실패' }); }
        });
      }
      return { error: '지원하지 않는 작업' };
    }, args: [action, value || ''] });
    return reply?.result || { error: '페이지 응답 없음' };
  };
  const wait = async (action, value, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const result = await run(action, value);
      if (result.error) throw new Error(result.error);
      if (result.ok) return result;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Gemini 영상 ' + action + ' 대기 시간 초과');
  };
  await wait('menu', '', 30000);
  await wait('mode', '', 10000);
  await wait('submit', prompt, 45000);
  await wait('send', '', 10000);
  await wait('ready', '', 240000);
  const conversation = new URL((await chrome.tabs.get(tabId)).url || 'https://invalid.invalid/');
  if (conversation.origin !== 'https://gemini.google.com' || !/^\/app\/[^/]+$/.test(conversation.pathname)) throw new Error('Gemini 영상 대화를 식별하지 못함');
  const started = Date.now(), ids = new Set();
  const onCreated = (item) => { if (Number.isInteger(item.id)) ids.add(item.id); };
  chrome.downloads.onCreated.addListener(onCreated);
  try {
    const clicked = await wait('download', '', 10000);
    while (Date.now() - started < 60000) {
      for (const id of ids) {
        const items = await chrome.downloads.search({ id });
        const item = items[0];
        if (item?.url !== clicked.downloadUrl) continue;
        if (item?.state === 'interrupted') throw new Error('영상 파일 다운로드가 중단됨');
        if (item?.state === 'complete' && /\.mp4$/i.test(item.filename || '')) {
          return { ok: true, filename: item.filename, bytes: item.fileSize };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('영상 파일 다운로드 확인 실패');
  } finally {
    chrome.downloads.onCreated.removeListener(onCreated);
  }
}
