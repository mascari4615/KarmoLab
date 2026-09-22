import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medianBudgetRuns, budgetExitCode } from './perf-budget-results.mjs';

const row = (key, value, limit = 100) => ({ key, value, limit, state: 'pass' });
const run = (...verdict) => ({ verdict });

test('실패한 두 회차를 빼고 남은 한 회차로 통과시키지 않는다', () => {
  const [result] = medianBudgetRuns([null, run(row('ready', 40)), null]);
  assert.equal(result.value, null);
  assert.equal(result.state, 'unknown');
});

test('시간은 중앙값, 밀림은 나쁜 회차를 보존한다', () => {
  const result = medianBudgetRuns([
    run(row('ready', 40), row('cls', 0.218, 0.1)),
    run(row('cls', 0.032, 0.1), row('ready', 300)),
    run(row('ready', 50), row('cls', 0.126, 0.1)),
  ]);
  assert.deepEqual(result.map(({ key, value, state }) => ({ key, value, state })), [
    { key: 'ready', value: 50, state: 'pass' },
    { key: 'cls', value: 0.218, state: 'fail' },
  ]);
});

test('숫자가 아닌 값과 빠진 항목은 측정값이 아니다', () => {
  for (const value of [null, undefined, NaN, Infinity, '10']) {
    const result = medianBudgetRuns([run(row('inp', value)), run(row('inp', 10)), run(row('ready', 20))]);
    assert.equal(result[0].state, 'unknown');
  }
  assert.deepEqual(medianBudgetRuns([null, null]), []);
});

test('위반, 미측정, 정상 결과를 각각 구분한다', () => {
  assert.equal(budgetExitCode({ failures: 0, incomplete: 0 }), 0);
  assert.equal(budgetExitCode({ failures: 0, incomplete: 1 }), 2);
  assert.equal(budgetExitCode({ failures: 1, incomplete: 0 }), 1);
  assert.equal(budgetExitCode({ failures: 1, incomplete: 1 }), 1);
});

test('회귀 주입 중에도 빠진 화면이 있으면 통과하지 않는다', () => {
  assert.equal(budgetExitCode({ failures: 7, incomplete: 1, regress: true }), 2);
  assert.equal(budgetExitCode({ failures: 7, incomplete: 0, regress: true }), 0);
  assert.equal(budgetExitCode({ failures: 0, incomplete: 0, regress: true }), 1);
});
