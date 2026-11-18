/* Gemini 음악 생성. 계정은 브라우저 세션 소유, 쿠키와 토큰을 전달하지 않음. */
async function geminiMusic(tabId, prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) throw new Error('음악 설명을 확인하세요');
  const run = async (action, value) => {
    const [reply] = await chrome.scripting.executeScript({ target: { tabId }, func: (op, text) => {
      if (location.hostname !== 'gemini.google.com') return { error: 'Gemini 로그인이나 페이지 확인 필요' };
      const nodes = (selector) => [...document.querySelectorAll(selector)];
      const button = (label) => nodes('button,[role="menuitem"],[role="menuitemcheckbox"]').find((e) =>
        (e.getAttribute('aria-label') || '').includes(label) || (e.innerText || '').trim().startsWith(label));
      if (op === 'menu') { const el = button('업로드 및 도구') || button('Upload files and more'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'mode') { const el = button('음악 만들기') || button('Create music'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'submit') {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        if (!editor || !button('음악 선택 해제') && !button('Remove music')) return { pending: true };
        editor.focus(); document.execCommand('insertText', false, text);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        return { ok: true };
      }
      if (op === 'send') { const el = button('메시지 보내기') || button('Send message'); if (!el || el.disabled) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'ready') { const el = button('트랙 다운로드') || button('Download track'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      if (op === 'download') { const el = button('오디오만') || button('Audio only'); if (!el) return { pending: true }; el.click(); return { ok: true }; }
      return { error: '지원하지 않는 작업' };
    }, args: [action, value || ''] });
    return reply?.result || { error: '페이지 응답 없음' };
  };
  const wait = async (action, value, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const result = await run(action, value);
      if (result.error) throw new Error(result.error);
      if (result.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Gemini 음악 ' + action + ' 대기 시간 초과');
  };
  await wait('menu', '', 30000);
  await wait('mode', '', 10000);
  await wait('submit', prompt, 10000);
  await wait('send', '', 10000);
  await wait('ready', '', 150000);
  const conversation = new URL((await chrome.tabs.get(tabId)).url || 'https://invalid.invalid/');
  if (conversation.origin !== 'https://gemini.google.com' || !/^\/app\/[^/]+$/.test(conversation.pathname)) {
    throw new Error('Gemini 음악 대화를 식별하지 못함');
  }
  const started = Date.now();
  await wait('download', '', 10000);
  while (Date.now() - started < 30000) {
    const items = await chrome.downloads.search({ startedAfter: new Date(started - 1000).toISOString(), state: 'complete' });
    const found = items.filter((x) => /\.mp3$/i.test(x.filename || '') && x.referrer === conversation.href);
    if (found.length === 1) return { ok: true, filename: found[0].filename, bytes: found[0].fileSize };
    if (found.length > 1) throw new Error('음악 다운로드 결과가 여러 개');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('음악 파일 다운로드 확인 실패');
}
