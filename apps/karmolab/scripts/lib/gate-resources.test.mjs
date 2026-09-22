import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesBrowserEntry } from './gate-resources.mjs';

const script = (name) => new URL('../' + name, import.meta.url);

test('접근성 전수 검사의 자식 브라우저도 동시 실행 한도에 포함한다', () => {
  assert.equal(usesBrowserEntry(script('run-a11y-all.mjs')), true);
});

test('직접 여는 브라우저와 순수 시뮬레이션을 구분한다', () => {
  assert.equal(usesBrowserEntry(script('smoke-tool-boot.mjs')), true);
  assert.equal(usesBrowserEntry(script('smoke-garden-sims.mjs')), false);
});

test('읽지 못한 검사에는 보수적으로 브라우저 자리를 배정한다', () => {
  assert.equal(usesBrowserEntry(script('__missing_gate_resource_probe.mjs')), true);
});
