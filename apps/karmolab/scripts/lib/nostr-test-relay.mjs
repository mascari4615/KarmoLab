/** 신호만 중계하는 검사 전용 Nostr 릴레이. SDP와 실제 WebRTC 데이터는 그대로 사용 */
export function nostrTestRelay() {
  const clients = new Set();
  let forwarded = 0;
  let held = null;
  const matches = (event, filter) =>
    (!filter.kinds || filter.kinds.includes(event.kind)) &&
    (!filter.since || event.created_at >= filter.since) &&
    Object.entries(filter).filter(([key]) => key.startsWith('#')).every(([key, values]) =>
      event.tags.some(([tag, value]) => tag === key.slice(1) && values.includes(value)));
  return {
    holdPair(a, b) { held = [a, b]; },
    release() { held = null; },
    get forwarded() { return forwarded; },
    async attach(context, seat) {
      await context.routeWebSocket(/^wss?:\/\//, (socket) => {
        const client = { socket, seat, relay: socket.url(), subscriptions: new Map() };
        clients.add(client);
        socket.onClose(() => clients.delete(client));
        socket.onMessage((raw) => {
          const [type, value, ...rest] = JSON.parse(String(raw));
          if (type === 'REQ') {
            client.subscriptions.set(value, rest);
            socket.send(JSON.stringify(['EOSE', value]));
          } else if (type === 'CLOSE') {
            client.subscriptions.delete(value);
          } else if (type === 'EVENT') {
            socket.send(JSON.stringify(['OK', value.id, true, '']));
            for (const target of clients) {
              if (target.relay !== client.relay) continue;
              if (held && client.seat !== target.seat && held.includes(client.seat) && held.includes(target.seat)) continue;
              for (const [id, filters] of target.subscriptions) {
                if (filters.some((filter) => matches(value, filter))) {
                  target.socket.send(JSON.stringify(['EVENT', id, value]));
                  forwarded++;
                }
              }
            }
          } else {
            throw new Error(`Unexpected Nostr message: ${type}`);
          }
        });
      });
    }
  };
}
