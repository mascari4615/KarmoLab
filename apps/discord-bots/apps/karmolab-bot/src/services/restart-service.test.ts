import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';


function parseProcStat(text: string) {
  // comm may contain spaces and parentheses; fields begin after its final ')'.
  const end = text.lastIndexOf(')');
  if (!/^\d+ \(/.test(text) || end < 0) throw new Error('invalid_stat');
  const fields = text.slice(end + 1).trim().split(/\s+/);
  const numbers = [11, 12, 19].map(index => Number(fields[index]));
  if (fields.length < 20 || numbers.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid_stat');
  return { state: fields[0], userTicks: numbers[0], systemTicks: numbers[1], startTime: numbers[2] };
}
function executablePath(command: string, env: NodeJS.ProcessEnv) {
  try { if (isAbsolute(command)) return realpathSync(command); } catch { return null; }
  for (const folder of (env.PATH || '').split(delimiter)) {
    const path = join(folder, command);
    try { if (existsSync(path)) return realpathSync(path); } catch { /* Diagnostic only. */ }
  }
  return null;
}
async function fixtureChild(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const started = performance.now();
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', stdoutBytes = 0, stderrBytes = 0;
  child.stdout?.on('data', chunk => { stdoutBytes += chunk.length; stdout = (stdout + chunk.toString()).slice(-8192); });
  child.stderr?.on('data', chunk => { stderrBytes += chunk.length; stderr = (stderr + chunk.toString()).slice(-8192); });
  let identity: number | undefined, samples = 0, first: Record<string, number | string> | undefined, last: typeof first;
  let sampleError: string | undefined, errorCode: string | undefined, timedOut = false, closed = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined, closeTimer: typeof killTimer;
  const sample = () => {
    if (process.platform !== 'linux' || !child.pid || samples >= 51 || closed) return;
    samples++;
    try {
      const root = '/proc/' + child.pid;
      const stat = parseProcStat(readFileSync(root + '/stat', 'utf8'));
      if (identity !== undefined && identity !== stat.startTime) { sampleError = 'child_identity_changed'; return; }
      identity = stat.startTime;
      const status = readFileSync(root + '/status', 'utf8');
      const sched = readFileSync(root + '/schedstat', 'utf8').trim().split(/\s+/).map(Number);
      if (sched.length !== 3 || sched.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid_schedstat');
      const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      if (parseProcStat(readFileSync(root + '/stat', 'utf8')).startTime !== identity) { sampleError = 'child_identity_changed'; return; }
      const value = { elapsedMs: Math.round(performance.now() - started), ...stat, rssKb: rss ? Number(rss[1]) : 0, runNs: sched[0], waitNs: sched[1], slices: sched[2] };
      first ??= value; last = value;
    } catch (error) { sampleError = (error as NodeJS.ErrnoException).code || 'proc_parse_failed'; }
  };
  const interval = setInterval(sample, 200); sample();
  let timeout: ReturnType<typeof setTimeout>;
  const cleanup = () => { clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer); clearTimeout(closeTimer); };
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; closureUnconfirmed?: boolean }>(resolve => {
    const finish = (value: { code: number | null; signal: NodeJS.Signals | null; closureUnconfirmed?: boolean }) => { cleanup(); resolve(value); };
    child.once('error', error => { errorCode = (error as NodeJS.ErrnoException).code || 'spawn_error'; });
    child.once('close', (code, signal) => { closed = true; finish({ code, signal }); });
    timeout = setTimeout(() => {
      timedOut = true; errorCode = 'ETIMEDOUT'; sample();
      try { child.kill('SIGTERM'); } catch { /* Close confirmation remains authoritative. */ }
      killTimer = setTimeout(() => {
        if (closed) return;
        try { child.kill('SIGKILL'); } catch { /* Report unconfirmed closure. */ }
        closeTimer = setTimeout(() => finish({ code: null, signal: null, closureUnconfirmed: true }), 1000);
      }, 250);
    }, 10000);
  });
  const delta: Record<string, number> = {};
  if (first && last) for (const key of ['userTicks', 'systemTicks', 'runNs', 'waitNs', 'slices']) delta[key] = Number(last[key]) - Number(first[key]);
  return { ...outcome, stdout, stderr, stdoutBytes, stderrBytes, elapsedMs: Math.round(performance.now() - started), errorCode, timedOut,
    closed, executable: executablePath(command, env), availableParallelism: availableParallelism(),
    proc: { supported: process.platform === 'linux', samples, first, last, delta, sampleError } };
}

const script = fileURLToPath(new URL('../../scripts/restart-service.ps1', import.meta.url));
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const stub = `param([string]$Action,[string]$ServiceName)
Add-Content -LiteralPath $env:RESTART_TEST_TRACE -Value ("stub_" + $Action + "_enter")
$state = Get-Content -LiteralPath $env:RESTART_TEST_STATE -Raw | ConvertFrom-Json
$state.calls += $Action
$code = 0
if ($Action -eq 'status') {
  $index = [Math]::Min($state.cursor, $state.states.Count - 1)
  Write-Output $state.states[$index]
  $state.cursor++
} elseif ($Action -eq 'restart') {
  Write-Output $state.restartMessage
  $code = $state.restartExit
} elseif ($Action -eq 'start') {
  $code = $state.startExit
}
$state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $env:RESTART_TEST_STATE -Encoding UTF8
Add-Content -LiteralPath $env:RESTART_TEST_TRACE -Value ("stub_" + $Action + "_exit")
exit $code
`;

async function restart(scenario: { states: string[]; restartExit?: number; startExit?: number; restartMessage?: string }) {
  const prefix = join(resolve(tmpdir()), 'bot service restart ');
  const folder = mkdtempSync(prefix);
  const stubPath = join(folder, 'nssm-stub.ps1');
  const statePath = join(folder, 'state.json');
  const tracePath = join(folder, 'trace.txt');
  const launcherPath = join(folder, 'launch.ps1');
  writeFileSync(stubPath, stub);
  writeFileSync(tracePath, '');
  writeFileSync(launcherPath, `Set-Content -LiteralPath $env:RESTART_TEST_TRACE -Value 'pwsh_started'
& $env:RESTART_TEST_SCRIPT -NssmPath $env:RESTART_TEST_STUB -TimeoutSec 1 -PollIntervalMs 10
exit $LASTEXITCODE
`);
  writeFileSync(statePath, JSON.stringify({ cursor: 0, calls: [], restartExit: 0, startExit: 0, restartMessage: '', ...scenario }));
  let closureUnconfirmed = false;
  try {
    const result = await fixtureChild(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath],
      { ...process.env, RESTART_TEST_STATE: statePath, RESTART_TEST_TRACE: tracePath, RESTART_TEST_SCRIPT: script, RESTART_TEST_STUB: stubPath });
    closureUnconfirmed = result.closureUnconfirmed === true;
    let trace = '', traceError: string | undefined;
    try { trace = readFileSync(tracePath, 'utf8'); } catch (error) { traceError = (error as NodeJS.ErrnoException).code || 'trace_read_failed'; }
    const safeOutput = (value: string) => value.split(/\r?\n/).filter(line =>
      /^\[restart-service\] karmolab-bot-prod SERVICE_[A-Z_]+$/.test(line.trim())
      || /^Unexpected status SERVICE_START_PENDING$/.test(line.trim())).slice(-8);
    const diagnostics = {
      elapsedMs: result.elapsedMs, code: result.code, signal: result.signal, errorCode: result.errorCode,
      timedOut: result.timedOut, closed: result.closed, closureUnconfirmed: result.closureUnconfirmed,
      executable: result.executable, availableParallelism: result.availableParallelism, proc: result.proc,
      traceError, stages: trace.replace(/^\uFEFF/, '').split(/\r?\n/)
        .filter(line => /^(pwsh_started|stub_(restart|status|start)_(enter|exit))$/.test(line)).slice(-16),
      stdout: safeOutput(result.stdout || ''), stderr: safeOutput(result.stderr || ''),
      stdoutBytes: result.stdoutBytes, stderrBytes: result.stderrBytes,
    };
    if (result.errorCode || result.closureUnconfirmed) throw new Error('restart fixture child failed: ' + JSON.stringify(diagnostics));
    const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
    return { code: result.code, output: JSON.stringify(diagnostics), calls: state.calls };
  } finally {
    if (!resolve(folder).startsWith(prefix)) throw new Error('Temporary fixture escaped its root');
    if (!closureUnconfirmed) rmSync(folder, { recursive: true });
  }
}

describe('service restart waits for the observed state', () => {
  it('accepts START_PENDING after a nonzero restart without issuing start twice', async () => {
    const result = await restart({ states: ['SERVICE_START_PENDING', 'SERVICE_RUNNING'], restartExit: 1, startExit: 1, restartMessage: 'Unexpected status SERVICE_START_PENDING' });
    expect(result.code, result.output).toBe(0);
    expect(result.calls).not.toContain('start');
    expect(result.calls).toContain('status');
  }, 15000);

  it('checks RUNNING even after a successful restart command', async () => {
    const result = await restart({ states: ['SERVICE_RUNNING'] });
    expect(result.code, result.output).toBe(0);
    expect(result.calls).toContain('status');
  }, 15000);

  it('fails if START_PENDING never becomes RUNNING', async () => {
    const result = await restart({ states: ['SERVICE_START_PENDING'] });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);

  it('fails a paused service instead of declaring success', async () => {
    const result = await restart({ states: ['SERVICE_PAUSED'] });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);

  it('starts a stopped service once and waits for it', async () => {
    const result = await restart({ states: ['SERVICE_STOPPED', 'SERVICE_START_PENDING', 'SERVICE_RUNNING'], restartExit: 1 });
    expect(result.code, result.output).toBe(0);
    expect(result.calls.filter((value: string) => value === 'start')).toHaveLength(1);
  }, 15000);

  it('keeps an unconfirmed restart failure as a failure', async () => {
    const result = await restart({ states: ['SERVICE_RUNNING'], restartExit: 1, startExit: 1 });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);
});

describe('restart fixture diagnostics', () => {
  it('parses stat after a comm containing spaces and parentheses and rejects incomplete counters', () => {
    const fields = Array(20).fill('0');
    fields[0] = 'R'; fields[11] = '12'; fields[12] = '4'; fields[19] = '99';
    expect(parseProcStat('123 (pwsh (worker) name) ' + fields.join(' '))).toEqual({ state: 'R', userTicks: 12, systemTicks: 4, startTime: 99 });
    expect(() => parseProcStat('123 (pwsh) R 0')).toThrow('invalid_stat');
  });

  it('confirms close after a spawn error without waiting for the timeout', async () => {
    const result = await fixtureChild('restart-fixture-no-such-executable', [], process.env);
    expect(result.errorCode).toBe('ENOENT');
    expect(result.closed).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it('keeps the ten-second limit and confirms the timed-out child closes', async () => {
    const result = await fixtureChild(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], process.env);
    expect(result.errorCode).toBe('ETIMEDOUT');
    expect(result.closed).toBe(true);
    expect(result.closureUnconfirmed).not.toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(10000);
    expect(result.proc.samples).toBeLessThanOrEqual(51);
  }, 15000);
});
