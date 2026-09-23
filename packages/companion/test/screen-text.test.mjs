// 화면을 **글자로도** 읽는가 (TASK-KAR-235).
//
// 101회차에 두뇌가 그림에서 글자를 읽는다는 건 증명됐다(Unfurling...). 하지만 그림만으로는
// 작은 글자가 늘 운에 맡겨진다. 2026 의 합의는 하이브리드다(접근성 트리 + 그림).
// 실측(2026-08-21): 전면 창의 요소 트리를 뽑는 데 274ms, 28개. 창 제목 하나와는 다른 양이다.
//
// 여기서 재는 것은 트리가 나오나와 그 글자가 두뇌 앞까지 가나 둘이다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { screenSense } from '../dist/index.js';
import { captureFixture } from '../test-support/screen-fixture.mjs';

const windows = process.platform === 'win32';

test('찍을 때 창 안의 글자도 같이 온다 (창 제목 하나가 아니다)', { skip: windows ? false : '윈도우에서만 잰다' }, async () => {
  const { elements: parsed } = await captureFixture();
  assert.ok(Array.isArray(parsed), 'TREE 는 목록이어야 한다');
  assert.ok(parsed.some((row) => row.n === 'Fixture text'), '시험 창의 글자가 누락');
  for (const row of parsed) {
    assert.equal(typeof row.k, 'string', '무슨 갈래인지');
    assert.equal(typeof row.n, 'string', '뭐라고 적혀 있는지');
    assert.ok(Array.isArray(row.r) && row.r.length === 4, '어디 있는지. 조작의 재료가 된다');
    for (const n of row.r) assert.equal(Number.isFinite(n), true, '좌표에 무한대가 섞이면 안 된다');
  }
});

test('눈이 내주는 것은 그림 한 장이 아니라 그림 + 읽은 글자다', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({
      title: '어떤 창',
      elements: [
        { k: 'Text', n: '저장하지 않고 닫기', r: [10, 20, 120, 30] },
        { k: 'Button', n: '확인', r: [150, 20, 60, 30] },
      ],
    }),
  });
  const seen = await eye.seeing();
  assert.ok(seen, '눈이 아무 것도 안 준다');
  assert.equal(typeof seen.imagePath, 'string');
  assert.match(seen.text, /저장하지 않고 닫기/, '창 안 글자가 빠지면 하이브리드가 아니다');
  assert.match(seen.text, /확인/);
  assert.match(seen.text, /어떤 창/, '창 이름도 그대로 있어야 한다');
});

test('글자를 못 읽어도 그림은 준다. 한쪽이 없다고 눈이 감기지 않는다', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({ title: '어떤 창', elements: [] }),
  });
  const seen = await eye.seeing();
  assert.equal(typeof seen.imagePath, 'string');
  assert.match(seen.text, /어떤 창/);
});
