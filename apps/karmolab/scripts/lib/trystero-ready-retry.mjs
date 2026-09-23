import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/* Trystero 0.25.3 초기 준비 신호 재전송. wire 형식 유지, 설치 파일 변경 없음.
   - 한쪽만 활성화된 연결도 최초 handshake 기한 동안 재전송
   - upstream 교체 시 원문 해시 불일치로 빌드 차단, 재현 검사 후 제거 판단 */
export function retryReadySource(source) {
  const expected = '1358a8511e3f6c69d8ec3571b5313a18df5c2a7afe2d2d908145f749a62c5d43';
  if (createHash('sha256').update(source).digest('hex') !== expected) {
    throw new Error('Trystero handshake changed: review the ready retry patch and run test:room-handshake');
  }
  return source
    .replace('handshakeTimer: null,', 'handshakeTimer: null,\n\t\t\t\treadyTimer: null,')
    .replace('state.pendingHandshakePayloads.length = 0;', 'state.readyTimer = resetTimer(state.readyTimer);\n\t\t\tstate.pendingHandshakePayloads.length = 0;')
    .replace(
      'sendHandshakeReady("", id).catch((err) => failPeerHandshake(id, peer, mkErr(`failed sending handshake readiness: ${toErrorMessage(err, "unknown send failure")}`)));',
      `const deadline = Date.now() + handshakeTimeoutMs;
\t\tconst sendReady = () => {
\t\t\tif (peerStates[id] !== state) return;
\t\t\tsendHandshakeReady("", id).catch((err) => failPeerHandshake(id, peer, mkErr(\`failed sending handshake readiness: \${toErrorMessage(err, "unknown send failure")}\`)));
\t\t\tstate.readyTimer = Date.now() + 500 < deadline ? setTimeout(sendReady, 500) : null;
\t\t};
\t\tsendReady();`
    );
}

export const trysteroReadyRetry = {
  name: 'trystero-ready-retry',
  setup(build) {
    build.onLoad({ filter: /[/\\]@trystero-p2p[/\\]core[/\\]dist[/\\]handshake\.mjs$/ }, async ({ path }) => ({
      contents: retryReadySource(await readFile(path, 'utf8')),
      loader: 'js'
    }));
  }
};
