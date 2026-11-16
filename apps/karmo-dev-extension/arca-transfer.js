/* Personal automation stays here. Only the approved local KarmoLab can take Arca ownership. */
(() => {
  const TARGETS = new Set(['jblnjmafdicfkgfghgcgijkconpomgkc']);
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type !== 'arca.local.write' || sender.id !== chrome.runtime.id) return false;
    globalThis.KarmoBlockStore.exclusive(async () => {
      const state = (await chrome.storage.local.get('arcaHandoff')).arcaHandoff;
      if (state?.status === 'committed') return { stopped: true };
      if (state?.status === 'pending' && state.until > Date.now()) return { pending: true };
      if (msg.method === 'set') {
        const data = globalThis.KarmoArcaTransfer.select(msg.value || {});
        await chrome.storage.local.set(data);
      } else if (msg.method === 'remove') {
        const keys = [msg.value].flat();
        const allowed = Object.keys(globalThis.KarmoArcaTransfer.select(Object.fromEntries(keys.map(key => [key, null]))));
        await chrome.storage.local.remove(allowed);
      } else throw new Error('지원하지 않는 저장 요청');
      return {};
    }).then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message }));
    return true;
  });
  chrome.runtime.onMessageExternal.addListener((msg, sender, respond) => {
    if (!msg?.type?.startsWith('arca.transfer.')) return false;
    if (!TARGETS.has(sender.id)) { respond({ ok: false, error: '이전 대상 확장이 아닙니다.' }); return false; }
    globalThis.KarmoBlockStore.exclusive(async () => {
      const raw = await chrome.storage.local.get(null);
      const old = raw.arcaHandoff;
      if (msg.type === 'arca.transfer.prepare') {
        if (old?.status === 'committed') {
          if (old.target !== sender.id) throw new Error('다른 확장으로 이미 이전되었습니다.');
          return { token: old.token, data: globalThis.KarmoArcaTransfer.select(raw) };
        }
        if (old?.until > Date.now() && old.target !== sender.id) throw new Error('다른 확장에서 이전 중입니다.');
        const data = globalThis.KarmoArcaTransfer.select(raw);
        const token = crypto.randomUUID();
        await chrome.storage.local.set({ arcaHandoff: { status: 'pending', token, target: sender.id, until: Date.now() + 120000 } });
        return { token, data };
      }
      if (!old || old.token !== msg.token || old.target !== sender.id) throw new Error('이전 요청이 일치하지 않습니다.');
      if (msg.type === 'arca.transfer.commit') {
        if (old.status !== 'committed' && old.until <= Date.now()) throw new Error('이전 요청이 만료되었습니다. 다시 시도하세요.');
        await chrome.storage.local.set({ arcaHandoff: { ...old, status: 'committed', until: Date.now() + 120000 } });
      } else if (msg.type === 'arca.transfer.cancel') {
        if (old.until <= Date.now()) throw new Error('자동 복구 시간이 지났습니다.');
        await chrome.storage.local.remove('arcaHandoff');
      } else throw new Error('지원하지 않는 이전 요청');
      return {};
    }).then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message }));
    return true;
  });
})();
