// 호스트별 경로 변환 표. 여기서 깨지면 뿌리가 엉뚱한 장을 냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { originPath, kindOf, movedToolUrl } from '../src/route.mjs';

test('lab 은 뿌리 그대로', () => {
  assert.equal(originPath('lab.mascari4615.com', '/'), '/');
  assert.equal(originPath('lab.mascari4615.com', '/t/arcade/'), '/t/arcade/');
});
test('dash 는 뿌리를 전용 front 로, 나머지는 그대로', () => {
  assert.equal(originPath('dash.mascari4615.com', '/'), '/');
  assert.equal(originPath('dash.mascari4615.com', '/index.html'), '/');
  assert.equal(originPath('dash.mascari4615.com', '/apps/karmolab/js/toolbox.js'), '/apps/karmolab/js/toolbox.js');
});
test('blog 는 뿌리를 글 목록으로', () => {
  assert.equal(originPath('blog.mascari4615.com', '/'), '/');
  assert.equal(originPath('blog.mascari4615.com', '/posts/x/'), '/posts/x/');
});
test('모르는 호스트는 lab 취급', () => {
  assert.equal(kindOf('site-router.workers.dev'), 'lab');
  assert.equal(kindOf(''), 'lab');
});
test('apex 와 www 는 안내 한 장 (원본에 안 간다)', () => {
  assert.equal(kindOf('mascari4615.com'), 'home');
  assert.equal(kindOf('www.mascari4615.com'), 'home');
  assert.equal(originPath('mascari4615.com', '/'), null);
});

test('호스트마다 제 배포에서 가져온다', async () => {
  const { originFor } = await import('../src/route.mjs');
  assert.equal(originFor('lab.mascari4615.com', 'x'), 'https://karmolab-lab.pages.dev');
  assert.equal(originFor('blog.mascari4615.com', 'x'), 'https://karmolab-blog.pages.dev');
  assert.equal(originFor('dash.mascari4615.com', 'x'), 'https://karmolab-dash.pages.dev');
  assert.equal(originFor('mascari4615.com', 'x'), 'x');
});

test('옮긴 도구 옛 주소는 KarmoEdit 으로', () => {
  assert.equal(movedToolUrl('lab.mascari4615.com', '/t/imgresize/'), 'https://edit.mascari4615.com/#imgresize');
  assert.equal(movedToolUrl('lab.mascari4615.com', '/t/meok/'), 'https://edit.mascari4615.com/#meok');
  assert.equal(movedToolUrl('lab.mascari4615.com', '/t/videotrim.md'), 'https://edit.mascari4615.com/#videotrim');
  assert.equal(movedToolUrl('lab.mascari4615.com', '/meok/'), 'https://edit.mascari4615.com/#meok');
  assert.equal(movedToolUrl('lab.mascari4615.com', '/t/calc/'), null);
  assert.equal(movedToolUrl('blog.mascari4615.com', '/t/meok/'), null);
});