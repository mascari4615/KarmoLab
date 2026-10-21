import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

let server;
let base;
before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('./dev.mjs', import.meta.url)), '0'], {
    env: { ...process.env, KARMOLAB_DEV_LOOPBACK: '1' }, windowsHide: true,
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const deadline = setTimeout(() => reject(new Error('Dev server did not report its address')), 15000);
    server.stdout.on('data', chunk => {
      output += String(chunk);
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\/apps\/karmolab/);
      if (match) { clearTimeout(deadline); resolve('http://127.0.0.1:' + match[1]); }
    });
    server.once('error', error => { clearTimeout(deadline); reject(error); });
    server.once('exit', code => { clearTimeout(deadline); reject(new Error('Dev server exited: ' + code)); });
  });
});
after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
});

function request(route) {
  return new Promise((resolve, reject) => {
    // 헤더 검사에서는 Node HTTP 사용. OS 임의 포트의 Fetch 금지 목록과 무관.
    get(base + route, response => {
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] }));
    }).once('error', reject);
  });
}

test('serves ES modules as JavaScript, including cache-busted URLs', async () => {
  // prepush sparse clone에도 포함된 앱 파일로 HTTP 규약 확인
  for (const route of ['/apps/karmolab/scripts/dev.mjs', '/apps/karmolab/scripts/dev.mjs?review=1']) {
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.match(response.type, /^text\/javascript\b/);
  }
});

test('preserves HTML and JSON content types', async () => {
  const [html, json] = await Promise.all([request('/apps/karmolab/index.html'), request('/apps/karmolab/package.json')]);
  assert.equal(html.status, 200);
  assert.match(html.type, /^text\/html\b/);
  assert.equal(json.status, 200);
  assert.equal(json.type, 'application/json');
});
