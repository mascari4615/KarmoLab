// 화면에서 **누를 수 있는 것**이 보이나 (TASK-KAR-241 1단계).
//
// 104회차에 창 안을 글자로 읽게 됐지만, 읽은 것 중 무엇이 **눌리는 것**인지는 모른다.
// 밖의 길은 정해져 있다(원장 2026-08-21). 좌표로 클릭하지 않고 컨트롤이 내놓은 동작
// (UI Automation 의 Invoke/Toggle/...)을 부른다. 창 위치, DPI 배율에 안 휘둘린다.
//
// 그러려면 먼저 **무슨 동작을 지원하는지**가 보여야 한다. 실측(117회차): 그 조회에 85ms.
// 이미 274ms 걸리는 트리 뽑기 옆에서 싸다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { screenSense } from '../dist/index.js';
import { captureFixture } from '../test-support/screen-fixture.mjs';

const windows = process.platform === 'win32';

test('트리에 무슨 동작이 되나가 실린다', { skip: windows ? false : '윈도우에서만 잰다' }, async () => {
  const { elements } = await captureFixture();
  for (const row of elements) {
    assert.ok(Array.isArray(row.p), `동작 칸이 없다: ${JSON.stringify(row)}`);
  }
  assert.ok(elements.find((row) => row.n === 'Fixture button')?.p.includes('Invoke'));
  assert.ok(elements.find((row) => row.n === 'Fixture toggle')?.p.includes('Toggle'));
  assert.deepEqual(elements.find((row) => row.n === 'Fixture text')?.p, []);
});

test('읽을 글만 있는 창은 누를 동작이 없어도 정상', { skip: windows ? false : '윈도우에서만 잰다' }, async () => {
  const { elements } = await captureFixture({ readOnly: true });
  assert.ok(elements.some((row) => row.n === 'Fixture text'));
  assert.ok(elements.every((row) => Array.isArray(row.p) && row.p.length === 0));
});

test('두뇌가 보는 글에 누를 수 있음이 드러난다', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({
      title: '어떤 창',
      elements: [
        { k: 'Button', n: '저장', r: [10, 20, 60, 30], p: ['Invoke'] },
        { k: 'Text', n: '그냥 글', r: [10, 60, 60, 30], p: [] },
      ],
    }),
  });
  const seen = await eye.seeing();
  assert.match(seen.text, /저장/);
  assert.match(seen.text, /Invoke|누를 수 있다/, '무엇을 누를 수 있는지 안 적히면 조작을 못 고른다');
});
