/* Shared with the Dev handoff receiver. Only Arca data may cross extensions. */
(() => {
  const KEYS = new Set(['karmoIdCache', 'karmoChannelCache', 'karmoAutoHistory', 'karmoSeen', 'karmoScraps', 'karmoScrapChanged', 'karmoStats', 'karmoScan', 'karmoLikedProfiles', 'karmoLikedView']);
  const own = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const SETTING_KEYS = new Set(['linkStyle', 'panel', 'hoverHl', 'blockSort', 'exBest', 'minRec', 'resolveAccounts', 'insight', 'scanPages', 'candSeen', 'keywords', 'blockedChannels', 'autoBlockChannels', 'autoBlockSeen', 'autoBlockHistory', 'autoAllowKeys', 'reasonTags', 'likeColor', 'palette', 'colors']);
  function select(raw) {
    const out = Object.create(null);
    for (const [key, value] of Object.entries(raw)) {
      if (KEYS.has(key) || /^karmoVisited:/.test(key)) out[key] = structuredClone(value);
    }
    for (const key of ['blocklist', 'likelist']) {
      if (own(raw[key]?.arca)) out[key] = { arca: structuredClone(raw[key].arca) };
    }
    if (own(raw.karmoSettings?.arca)) out.karmoSettings = { arca: structuredClone(raw.karmoSettings.arca) };
    else if (raw.karmoSettings?.linkStyle) out.karmoSettings = { arca: Object.fromEntries(Object.entries(raw.karmoSettings).filter(([key]) => SETTING_KEYS.has(key)).map(([key, value]) => [key, structuredClone(value)])) };
    if (new TextEncoder().encode(JSON.stringify(out)).byteLength > 8 * 1024 * 1024) throw new Error('이전 데이터가 8MB를 초과합니다. 백업 파일로 이전하세요.');
    return out;
  }
  function merge(source, target) {
    const result = Object.create(null);
    for (const [key, value] of Object.entries(select(source))) {
      if (['blocklist', 'likelist', 'karmoSettings'].includes(key)) {
        result[key] = { ...target[key], arca: { ...value.arca, ...target[key]?.arca } };
        if (key === 'karmoSettings') for (const field of ['blockedChannels', 'autoBlockChannels', 'autoAllowKeys']) {
          if (value.arca[field] || target[key]?.arca?.[field]) result[key].arca[field] = [...new Set([...(value.arca[field] || []), ...(target[key]?.arca?.[field] || [])])];
        }
      } else if (key.startsWith('karmoVisited:')) result[key] = Math.max(Number(value) || 0, Number(target[key]) || 0);
      else if (key === 'karmoStats' && own(target[key])) {
        const users = { ...value.users, ...target[key].users };
        for (const [id, entry] of Object.entries(value.users || {})) if (Object.hasOwn(target[key].users || {}, id)) {
          users[id] = { ...entry, ...target[key].users[id], seen: Math.max(entry.seen || 0, target[key].users[id].seen || 0), opened: Math.max(entry.opened || 0, target[key].users[id].opened || 0) };
        }
        result[key] = { ...value, ...target[key], users, seen: [...new Set([...(value.seen || []), ...(target[key].seen || [])])], opened: [...new Set([...(value.opened || []), ...(target[key].opened || [])])] };
      }
      else if (own(value) && own(target[key])) result[key] = { ...value, ...target[key] };
      else result[key] = target[key] ?? value;
    }
    return result;
  }
  globalThis.KarmoArcaTransfer = { select, merge };
})();
