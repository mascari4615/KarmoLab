// 호스트별 경로 변환 표. 여기서 깨지면 뿌리가 엉뚱한 장을 냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { originPath, kindOf } from '../src/route.mjs';

test('lab 은 뿌리 그대로', () => {
  assert.equal(originPath('lab.mascari4615.com', '/'), '/');
  assert.equal(originPath('lab.mascari4615.com', '/t/arcade/'), '/t/arcade/');
});
test('dash 는 뿌리 그대로 (셸이 대시보드를 고른다), 나머지도 그대로', () => {
  assert.equal(originPath('dash.mascari4615.com', '/'), '/');
  assert.equal(originPath('dash.mascari4615.com', '/index.html'), '/');
  assert.equal(originPath('dash.mascari4615.com', '/apps/karmolab/js/toolbox.js'), '/apps/karmolab/js/toolbox.js');
});
test('blog 는 뿌리를 글 목록으로', () => {
  assert.equal(originPath('blog.mascari4615.com', '/'), '/posts/');
  assert.equal(originPath('blog.mascari4615.com', '/posts/x/'), '/posts/x/');
});
test('모르는 호스트는 lab 취급', () => {
  assert.equal(kindOf('site-router.workers.dev'), 'lab');
  assert.equal(kindOf(''), 'lab');
});
