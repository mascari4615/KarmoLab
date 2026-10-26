import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function restart(scenario: { states: string[]; restartExit?: number; startExit?: number; restartMessage?: string }) {
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
  try {
    const started = performance.now();
    const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, RESTART_TEST_STATE: statePath, RESTART_TEST_TRACE: tracePath, RESTART_TEST_SCRIPT: script, RESTART_TEST_STUB: stubPath }, windowsHide: true,
    });
    const safeOutput = (value: string) => value.split(/\r?\n/).filter(line =>
      /^\[restart-service\] karmolab-bot-prod SERVICE_[A-Z_]+$/.test(line.trim())
      || /^Unexpected status SERVICE_START_PENDING$/.test(line.trim())).slice(-8);
    const diagnostics = {
      elapsedMs: Math.round(performance.now() - started), code: result.status, signal: result.signal,
      errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
      stages: readFileSync(tracePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
        .filter(line => /^(pwsh_started|stub_(restart|status|start)_(enter|exit))$/.test(line)).slice(-16),
      stdout: safeOutput(result.stdout || ''), stderr: safeOutput(result.stderr || ''),
      stdoutBytes: Buffer.byteLength(result.stdout || ''), stderrBytes: Buffer.byteLength(result.stderr || ''),
    };
    if (result.error) throw new Error('restart fixture child failed: ' + JSON.stringify(diagnostics));
    const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
    return { code: result.status, output: JSON.stringify(diagnostics), calls: state.calls };
  } finally {
    if (!resolve(folder).startsWith(prefix)) throw new Error('Temporary fixture escaped its root');
    rmSync(folder, { recursive: true });
  }
}

describe('service restart waits for the observed state', () => {
  it('accepts START_PENDING after a nonzero restart without issuing start twice', () => {
    const result = restart({ states: ['SERVICE_START_PENDING', 'SERVICE_RUNNING'], restartExit: 1, startExit: 1, restartMessage: 'Unexpected status SERVICE_START_PENDING' });
    expect(result.code, result.output).toBe(0);
    expect(result.calls).not.toContain('start');
    expect(result.calls).toContain('status');
  }, 15000);

  it('checks RUNNING even after a successful restart command', () => {
    const result = restart({ states: ['SERVICE_RUNNING'] });
    expect(result.code, result.output).toBe(0);
    expect(result.calls).toContain('status');
  }, 15000);

  it('fails if START_PENDING never becomes RUNNING', () => {
    const result = restart({ states: ['SERVICE_START_PENDING'] });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);

  it('fails a paused service instead of declaring success', () => {
    const result = restart({ states: ['SERVICE_PAUSED'] });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);

  it('starts a stopped service once and waits for it', () => {
    const result = restart({ states: ['SERVICE_STOPPED', 'SERVICE_START_PENDING', 'SERVICE_RUNNING'], restartExit: 1 });
    expect(result.code, result.output).toBe(0);
    expect(result.calls.filter((value: string) => value === 'start')).toHaveLength(1);
  }, 15000);

  it('keeps an unconfirmed restart failure as a failure', () => {
    const result = restart({ states: ['SERVICE_RUNNING'], restartExit: 1, startExit: 1 });
    expect(result.code, result.output).not.toBe(0);
  }, 15000);
});
