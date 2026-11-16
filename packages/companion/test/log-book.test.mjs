import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { startLogBook } from '../dist/index.js';

/** 받은 것을 모으는 가짜 흐름 */
function sink() {
  const got = [];
  const stream = new Writable({ write(chunk, _enc, done) { got.push(String(chunk)); done(); } });
  return { stream, got };
}

const fixed = () => new Date(2026, 10, 16, 9, 5, 7);

test('감싼 흐름의 줄이 메모리와 파일에 남고, 원래 흐름에도 그대로 간다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'logbook-'));
  const file = join(dir, 'sub', '서버.log');
  const { stream, got } = sink();
  const book = startLogBook({ file, streams: [stream], now: fixed });
  stream.write('하나\n둘');
  stream.write('셋\n');
  stream.write(Buffer.from('넷\r\n'));
  assert.deepEqual(book.lines(), ['09:05:07 하나', '09:05:07 둘셋', '09:05:07 넷']);
  assert.deepEqual(got, ['하나\n둘', '셋\n', '넷\r\n']);
  book.stop();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(readFileSync(file, 'utf8'), '09:05:07 하나\n09:05:07 둘셋\n09:05:07 넷\n');
  // 멈춘 뒤에는 더 안 받는다
  stream.write('다섯\n');
  assert.equal(book.lines().length, 3);
});

test('keep 를 넘으면 오래된 줄부터 버린다', () => {
  const { stream } = sink();
  const book = startLogBook({ streams: [stream], keep: 2, now: fixed });
  stream.write('a\nb\nc\n');
  assert.deepEqual(book.lines(), ['09:05:07 b', '09:05:07 c']);
  assert.equal(book.file, null);
  book.stop();
});

test('큰 기록 파일은 시작할 때 .1 로 밀어 둔다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logbook-'));
  const file = join(dir, '서버.log');
  writeFileSync(file, 'x'.repeat(100));
  const { stream } = sink();
  const book = startLogBook({ file, streams: [stream], rotateBytes: 10 });
  assert.ok(existsSync(`${file}.1`));
  book.stop();
});
