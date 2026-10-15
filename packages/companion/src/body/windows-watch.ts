import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';

/** 화면의 보이는 최상위 창 하나. 좌표는 화면 물리 픽셀. */
export interface WindowRect {
  id: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  maximized: boolean;
}

export interface WindowWatcher {
  /** 가장 최근에 읽은 창 목록. 위쪽(앞쪽) 창이 먼저. 감시기가 죽었으면 빈 목록. */
  latest(): { windows: WindowRect[]; at: number; alive: boolean };
  stop(): void;
}

/**
 * 창 위치 감시기. 상주 PowerShell 하나가 바뀔 때만 한 줄씩 출력
 *
 * 요청마다 PowerShell 을 띄우면 1회 100ms 이상 걸려 0.3초 주기로 못 읽음
 * 한 번 띄운 프로세스가 150ms 마다 읽고 바뀔 때만 출력
 * 서버 종료 시 스크립트가 부모 PID 를 확인해 자체 종료
 */
export function watchWindows(): WindowWatcher {
  // Windows 전용(user32). 다른 OS 는 창 없음으로 처리, 몸은 바닥만 사용
  if (process.platform !== 'win32') {
    return { latest: () => ({ windows: [], at: 0, alive: false }), stop: () => {} };
  }
  const script = join(dirname(__filename), '..', '..', 'assets', 'windows-watch.ps1');
  let windows: WindowRect[] = [];
  let at = 0;
  let child: ChildProcess | null = null;
  let stopped = false;
  let restartDelay = 1000;

  const start = () => {
    if (stopped) return;
    child = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Parent', String(process.pid)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    // 실행 파일이 없는 등 띄우기 자체가 실패하면 재시도 없음. 몸은 바닥만 사용
    child.on('error', () => {
      stopped = true;
      child = null;
      windows = [];
    });
    let buffer = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (line === '') continue;
        try {
          const parsed = JSON.parse(line) as { w?: number[][] };
          windows = (parsed.w ?? []).map((row) => ({
            id: row[0] ?? 0,
            left: row[1] ?? 0,
            top: row[2] ?? 0,
            right: row[3] ?? 0,
            bottom: row[4] ?? 0,
            maximized: row[5] === 1,
          }));
          at = Date.now();
          restartDelay = 1000;
        } catch {
          // 깨진 줄은 폐기. 다음 줄이 곧 도착
        }
      }
    });
    child.on('exit', () => {
      child = null;
      windows = [];
      if (stopped) return;
      // 죽으면 간격을 늘려 재기동. 계속 죽으면 60초까지 증가
      setTimeout(start, restartDelay);
      restartDelay = Math.min(restartDelay * 2, 60_000);
    });
  };

  start();
  process.once('exit', () => child?.kill());

  return {
    latest() {
      // 목록은 바뀔 때만 오므로 at 이 오래됐다고 죽은 게 아니다. 프로세스가 있으면 산 것
      return { windows, at, alive: child !== null };
    },
    stop() {
      stopped = true;
      child?.kill();
      child = null;
    },
  };
}
