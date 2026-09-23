// Socket.IO 2의 URL 소비 계약: protocol, host, port, path, query
// 서비스의 EIO=3 연결 유지와 오래된 parseuri의 정규식 제거
module.exports = function parseSocketUri(source) {
  const explicit = /^(?:https?|wss?):\/\//i.test(source);
  const url = new URL(explicit ? source : `https://${source.replace(/^\/\//, '')}`);
  return {
    source,
    protocol: explicit ? url.protocol.slice(0, -1) : '',
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port,
    path: url.pathname,
    query: url.search.slice(1),
    anchor: url.hash.slice(1),
  };
};
