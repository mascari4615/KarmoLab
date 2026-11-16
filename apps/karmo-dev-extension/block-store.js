/* 여러 탭과 설정의 차단 저장을 워커 한 큐에서 처리 */
(() => {
  let tail = Promise.resolve();
  async function mutate(command) {
    const handoff = (await chrome.storage.local.get('arcaHandoff')).arcaHandoff;
    if ((command.site || 'arca') === 'arca') {
      if (handoff?.status === 'committed') throw new Error('KarmoLab으로 이전되었습니다. KarmoLab 설정을 사용하세요.');
      if (handoff?.status === 'pending' && handoff.until > Date.now()) throw new Error('KarmoLab으로 이전 중입니다. 잠시 뒤 다시 시도하세요.');
    }
    const site = command.site || "arca";
    if (["__proto__", "prototype", "constructor"].includes(site)) throw new Error("지원하지 않는 저장 키");
    const got = await chrome.storage.local.get({ blocklist: {}, likelist: {}, karmoSettings: {} });
    const blocks = got.blocklist[site] ||= {};
    const likes = got.likelist[site] ||= {};
    const settings = got.karmoSettings[site] ||= (site === "arca" && got.karmoSettings.linkStyle ? { ...got.karmoSettings } : {});
    Object.setPrototypeOf(blocks, null);
    Object.setPrototypeOf(likes, null);
    let added = 0;
    const key = command.key;
    const previous = Object.hasOwn(blocks, key) ? structuredClone(blocks[key]) : null;
    const prune = () => {
      const virtual = ["breaking", "best", "all", "search", "headlines"];
      if (settings.blockedChannels) settings.blockedChannels = settings.blockedChannels.filter((c) => !virtual.includes(c));
      if (settings.autoBlockChannels) settings.autoBlockChannels = settings.autoBlockChannels.filter((c) => !virtual.includes(c));
      for (const [id, entry] of Object.entries(blocks)) {
        if (entry.until && Date.parse(entry.until) <= Date.now()) delete blocks[id];
        else if (entry.autoChannel && !(settings.autoBlockChannels || []).includes(entry.autoChannel)) {
          if (entry.autoPrevious) blocks[id] = entry.autoPrevious;
          else delete blocks[id];
        }
      }
    };
    switch (command.op) {
      case "block": {
        if (!key || typeof key !== "string") throw new Error("작성자 키 없음");
        const fields = command.fields || {};
        if (fields.autoChannel) {
          if (!(settings.autoBlockChannels || []).includes(fields.autoChannel) || (settings.autoAllowKeys || []).includes(key) || previous?.hideAll) return { previous, changed: false };
          blocks[key] = { ...(previous || { name: command.name, at: new Date().toISOString() }), hideAll: true, autoChannel: fields.autoChannel,
            ...(previous ? { autoPrevious: previous } : { reason: `자동: ${fields.autoChannel}` }) };
        } else {
          blocks[key] = { ...(previous || { name: command.name, at: new Date().toISOString() }), ...fields, ...(previous ? { hideAll: true } : {}) };
          delete blocks[key].autoChannel;
          delete blocks[key].autoPrevious;
        }
        break;
      }
      case "remove":
        if (previous?.autoChannel) settings.autoAllowKeys = [...new Set([...(settings.autoAllowKeys || []), key])];
        delete blocks[key];
        break;
      case "restore":
        if (command.entry) blocks[key] = command.entry;
        else delete blocks[key];
        break;
      case "patch":
        if (blocks[key]) {
          Object.assign(blocks[key], command.fields);
          if (previous?.autoChannel && Object.hasOwn(command.fields, "hideAll")) {
            settings.autoAllowKeys = [...new Set([...(settings.autoAllowKeys || []), key])];
            delete blocks[key].autoChannel;
            delete blocks[key].autoPrevious;
            if (blocks[key].reason?.startsWith("자동:")) delete blocks[key].reason;
          }
        }
        break;
      case "like":
        if (likes[key]) delete likes[key];
        else likes[key] = { name: command.name, at: new Date().toISOString() };
        break;
      case "removeLike": delete likes[key]; break;
      case "channelAdd": settings.blockedChannels = [...new Set([...(settings.blockedChannels || []), command.channel])]; break;
      case "channelRemove": settings.blockedChannels = (settings.blockedChannels || []).filter((c) => c !== command.channel); break;
      case "allowRemove": settings.autoAllowKeys = (settings.autoAllowKeys || []).filter((k) => k !== key); break;
      case "settings": Object.assign(settings, command.patch); prune(); break;
      case "prune": prune(); break;
      case "import":
        for (const [kind, target] of [["block", got.blocklist], ["like", got.likelist]]) {
          for (const [site, users] of Object.entries(command.data[kind] || {})) {
            if (["__proto__", "prototype", "constructor"].includes(site)) throw new Error("지원하지 않는 사이트 키");
            target[site] ||= {};
            Object.setPrototypeOf(target[site], null);
            for (const [id, entry] of Object.entries(users || {})) {
              if (!Object.hasOwn(target[site], id)) { target[site][id] = entry; added++; }
            }
          }
        }
        for (const [site, config] of Object.entries(command.data.settings || {})) if (config && typeof config === "object" && !["__proto__", "prototype", "constructor"].includes(site)) got.karmoSettings[site] = { ...config, ...(got.karmoSettings[site] || {}) };
        break;
      default: throw new Error("지원하지 않는 차단 변경");
    }
    await chrome.storage.local.set(got);
    return { previous, changed: true, added };
  }
  globalThis.KarmoBlockStore = { exclusive(fn) {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  }, apply(command) {
    const result = tail.then(() => mutate(command));
    tail = result.catch(() => {});
    return result;
  } };
})();
