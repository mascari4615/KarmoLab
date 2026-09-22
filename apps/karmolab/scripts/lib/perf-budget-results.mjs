// 시간, 크기는 중앙값, 화면 밀림은 최댓값. 실패한 회차도 모집단에 포함
export function medianBudgetRuns(runs) {
  const base = runs.find((run) => run?.verdict?.length)?.verdict || [];
  return base.map((sample) => {
    const values = runs.map((run) => run?.verdict?.find((row) => row.key === sample.key)?.value)
      .filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length * 2 <= runs.length) return { ...sample, value: null, state: 'unknown' };
    const value = sample.key === 'cls' ? values.at(-1) : values[Math.floor(values.length / 2)];
    return { ...sample, value, state: value > sample.limit ? 'fail' : 'pass' };
  });
}

// 실제 위반은 1, 미측정은 2. 회귀 주입도 완전한 측정 후에만 통과
export function budgetExitCode({ failures, incomplete, regress = false }) {
  if (regress) return incomplete ? 2 : failures > 0 ? 0 : 1;
  return failures > 0 ? 1 : incomplete ? 2 : 0;
}
