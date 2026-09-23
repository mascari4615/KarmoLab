/** 검사 창의 연결과 초기 참가자 메시지 기록. 게임 상태에는 관여하지 않는 관측 */
export async function traceRtc(context) {
  await context.addInitScript(() => {
    const trace = [];
    window.__rtcTrace = trace;
    const record = (event) => {
      trace.push({ at: Math.round(performance.now()), ...event });
      if (trace.length > 200) trace.shift();
    };
    let next = 0;
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = new Proxy(Original, {
      construct(Target, args) {
        const pc = new Target(...args);
        const id = ++next;
        const inspect = (channel) => {
          channel.addEventListener('open', () => record({ id, event: 'open' }));
          channel.addEventListener('close', () => record({ id, event: 'close' }));
          const read = (data, direction) => {
            if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return;
            const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            const text = new TextDecoder().decode(bytes).replaceAll('\0', '');
            if (text.includes('hello') || text.includes('ranked-roster:') || text.includes('@_hs')) {
              record({ id, event: direction, text: text.slice(-160) });
            }
          };
          channel.addEventListener('message', (event) => read(event.data, 'receive'));
          const send = channel.send.bind(channel);
          channel.send = (data) => { read(data, 'send'); return send(data); };
        };
        const create = pc.createDataChannel.bind(pc);
        pc.createDataChannel = (...channelArgs) => { const channel = create(...channelArgs); inspect(channel); return channel; };
        pc.addEventListener('datachannel', (event) => inspect(event.channel));
        pc.addEventListener('connectionstatechange', () => record({ id, event: 'connection', state: pc.connectionState }));
        return pc;
      }
    });
  });
}
