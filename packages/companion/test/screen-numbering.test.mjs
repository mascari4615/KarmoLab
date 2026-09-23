// 화면 요소에 **번호**를 붙인다 (TASK-KAR-241 2단계).
//
// 지금은 두뇌에게 Button 탭 닫기처럼 이름으로만 준다. 그런데 실측(120회차):
// 창 하나에 이름 있는 요소 19개 중 **고유 이름은 12개**다. 탭 닫기가 넷, 탭 이름이
// 저마다 둘씩. 두뇌가 탭 닫기 눌러라고 해도 **어느 것인지 우리가 모른다.**
//
// 밖에서도 같은 문제를 같은 방법으로 푼다(Set-of-Mark, 원장 2026-08-21). 그림 위에 번호를
// 얹고 모델은 좌표가 아니라 번호를 고른다. 우리는 글 목록이니 목록에 번호를 붙인다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { screenSense } from '../dist/index.js';
import { captureFixture } from '../test-support/screen-fixture.mjs';

const windows = process.platform === 'win32';

test('트리의 요소마다 번호가 붙는다', { skip: windows ? false : '윈도우에서만 잰다' }, async () => {
  const { elements } = await captureFixture();
  assert.ok(elements.some((row) => row.n === 'Fixture button'));
  const numbers = elements.map((row) => row.i);
  assert.deepEqual(numbers, elements.map((_, index) => index + 1), '번호는 1부터 순서대로');
});

test('두뇌가 보는 글에 번호가 앞에 온다. 같은 이름이 여럿이어도 집을 수 있게', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({
      title: '어떤 창',
      elements: [
        { i: 1, k: 'Button', n: '탭 닫기', r: [10, 20, 60, 30], p: ['Invoke'] },
        { i: 2, k: 'Button', n: '탭 닫기', r: [80, 20, 60, 30], p: ['Invoke'] },
      ],
    }),
  });
  const seen = await eye.seeing();
  assert.match(seen.text, /\[1\][^\n]*탭 닫기/);
  assert.match(seen.text, /\[2\][^\n]*탭 닫기/);
});
