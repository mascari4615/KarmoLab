import assert from 'node:assert/strict';
import test from 'node:test';

import { webBody } from '../dist/index.js';

/**
 * 다른 사이트 페이지가 보낸 POST 는 실행 전에 거절. CORS 는 응답 읽기만 막고
 * text/plain 단순 요청은 서버에 그대로 닿기 때문 (2026-11-02)
 */
const port = 4671;

test('밖 Origin 의 POST 는 403, 이 기계와 Origin 없음은 통과', async () => {
  const puts = [];
  const body = webBody({ port, open: false, putSettings: (next) => { puts.push(next); return []; } });
  body.sense.start(() => {});
  try {
    const post = (origin) => fetch(`http://127.0.0.1:${port}/settings`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', ...(origin ? { origin } : {}) },
      body: JSON.stringify({ voiceOut: false }),
    });
    assert.equal((await post('https://evil.example')).status, 403);
    assert.equal((await post('null')).status, 403);
    assert.equal((await post('http://localhost.evil.example')).status, 403);
    assert.equal(puts.length, 0, '거절된 요청이 설정을 바꾸면 안 됨');
    assert.equal((await post(`http://127.0.0.1:${port}`)).status, 200);
    assert.equal((await post('tauri://localhost')).status, 200);
    assert.equal((await post(undefined)).status, 200);
    assert.equal(puts.length, 3);
    const get = await fetch(`http://127.0.0.1:${port}/settings.json`, { headers: { origin: 'https://evil.example' } });
    assert.equal(get.status, 200, '읽기는 CORS 헤더 없이 응답, 브라우저가 막음');
  } finally {
    body.sense.stop();
  }
});
