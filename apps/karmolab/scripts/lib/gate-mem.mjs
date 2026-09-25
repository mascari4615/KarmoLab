/**
 * 검사 하나가 쥔 메모리 (자기와 자손 프로세스 전부) 를 주기적으로 잰다 (2026-09-25)
 *
 * 왜: `smoke:tool-boot` 하나가 브라우저 프로세스 129개, 20.7GB. 아무도 모름
 * 판 전체가 기계 메모리를 바닥내 Claude Code 가 작업을 끊은 뒤에야 발견
 * 시간은 매 판 기록, 메모리는 기록 없음. 이제 검사마다 최고치, 상한 넘으면 빨강
 *
 * 한 번 재기: 윈도우 0.5~1초 (CIM 조회). 5초마다라 판 시간 영향 미미
 * 못 재면 (도구 없음) 조용히 끔. 판정은 그대로, 메모리 줄만 빠짐
 */
import { execFile } from 'node:child_process';

const WIN = process.platform === 'win32';

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? null : out));
  });
}

/** 지금 도는 프로세스 전부. [{ pid, ppid, mb }] 또는 못 재면 null */
export async function snapshot() {
  if (WIN) {
    const out = await run('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }']);
    if (!out) return null;
    return out.split(/\r?\n/).map((l) => l.trim().split(' ')).filter((p) => p.length === 3)
      .map(([pid, ppid, ws]) => ({ pid: +pid, ppid: +ppid, mb: Math.round(+ws / 1048576) }));
  }
  const out = await run('ps', ['-eo', 'pid=,ppid=,rss=']);
  if (!out) return null;
  return out.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 3)
    .map(([pid, ppid, rss]) => ({ pid: +pid, ppid: +ppid, mb: Math.round(+rss / 1024) }));
}

/** 뿌리 pid 와 그 자손의 메모리 합과 프로세스 수 */
export function treeUsage(procs, rootPid) {
  const kids = new Map();
  for (const p of procs) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const self = procs.find((p) => p.pid === rootPid);
  let mb = self ? self.mb : 0;
  let n = self ? 1 : 0;
  const stack = [rootPid];
  const seen = new Set(stack);
  while (stack.length) {
    for (const c of kids.get(stack.pop()) || []) {
      if (seen.has(c.pid)) continue;
      seen.add(c.pid);
      mb += c.mb;
      n += 1;
      stack.push(c.pid);
    }
  }
  return { mb, n };
}

/**
 * 도는 검사들의 최고 메모리 모음
 *   const watch = startGateMemWatch(); watch.track(pid, name); ... watch.untrack(pid); await watch.stop();
 *   watch.peaks: Map<name, { mb, n }>
 */
export function startGateMemWatch({ everyMs = 5000 } = {}) {
  const live = new Map();
  const peaks = new Map();
  let alive = true;
  let busy = null;
  async function tick() {
    if (!live.size) return;
    const procs = await snapshot();
    if (!procs) { alive = false; return; }
    for (const [pid, name] of live) {
      const u = treeUsage(procs, pid);
      const prev = peaks.get(name);
      if (!prev || u.mb > prev.mb) peaks.set(name, u);
    }
  }
  const timer = setInterval(() => { if (alive && !busy) busy = tick().finally(() => { busy = null; }); }, everyMs);
  timer.unref?.();
  return {
    peaks,
    track(pid, name) { if (pid) live.set(pid, name); },
    untrack(pid) { live.delete(pid); },
    get working() { return alive; },
    async stop() { clearInterval(timer); if (busy) await busy; },
  };
}
