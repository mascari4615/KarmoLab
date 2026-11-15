(() => {
  if (location.origin !== 'https://chzzk.naver.com' || !/^\/live\/[a-f0-9]{32}\/chat\/?$/.test(location.pathname)) return;
  const install = () => {
    if (!document.documentElement || document.getElementById('karmo-stream-chat')) return;
    const style = document.createElement('style');
    style.id = 'karmo-stream-chat';
    style.textContent = `
      html { background:rgb(18 19 20 / var(--karmo-chat-alpha,0)) !important; }
      :where(body,body *) {
        background-color:transparent !important;
        backdrop-filter:none !important;
      }
      body { color:#fff !important; text-shadow:0 1px 2px #000,0 0 3px #000; }
      :is(input,textarea,[contenteditable=true],[role=dialog],[role=menu]) {
        background-color:rgb(18 19 20 / .9) !important;
        color:#fff !important;
      }
    `;
    document.documentElement.append(style);
    let percent = 0;
    try {
      const stored = Number(localStorage.getItem('karmoChatBackground'));
      if (Number.isFinite(stored)) percent = Math.min(100, Math.max(0, stored));
    } catch {}
    document.documentElement.style.setProperty('--karmo-chat-alpha', String(percent / 100));
  };
  if (document.documentElement) install();
  else {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { observer.disconnect(); install(); }
    });
    observer.observe(document, { childList:true });
  }
})();
