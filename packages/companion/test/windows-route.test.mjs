import assert from 'node:assert/strict';
import test from 'node:test';

import { webBody } from '../dist/index.js';

/**
 * `/windows` 는 몸이 창 윗면에 서기 위한 창 목록이다. 처음 요청 때 상주 감시기를 띄우고,
 * 서버를 멈추면 같이 끝나야 한다(안 그러면 PowerShell 이 남는다).
 * 감시기를 못 띄우는 환경에서도 빈 목록으로 대답해야 한다. 몸이 바닥만 쓰면 되기 때문.
 */
const port = 4662;

test('창 목록 경로는 항상 JSON 으로 대답한다. 목록이 비어도, 감시기가 없어도', async () => {
  const body = webBody({ port, open: false });
  body.sense.start(() => {});
  try {
    const res = await fetch(`http://127.0.0.1:${port}/windows`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/, '캐시되면 창이 움직여도 몸이 모른다');
    const data = await res.json();
    assert.ok(Array.isArray(data.windows), `windows 배열이 와야 한다: ${JSON.stringify(data)}`);
    assert.equal(typeof data.alive, 'boolean');
    for (const w of data.windows) {
      for (const key of ['id', 'left', 'top', 'right', 'bottom']) {
        assert.equal(typeof w[key], 'number', `${key} 숫자여야 한다`);
      }
    }
  } finally {
    body.sense.stop();
  }
});

test('창 윗면 규칙 모듈이 서버에서 내려간다', async () => {
  const body = webBody({ port: port + 1, open: false });
  body.sense.start(() => {});
  try {
    const res = await fetch(`http://127.0.0.1:${port + 1}/surfaces.js`);
    assert.equal(res.status, 200, '화면이 못 불러오면 바닥만 쓰고 창 위에는 못 감');
    assert.match(await res.text(), /export function standableSurfaces/);
  } finally {
    body.sense.stop();
  }
});
