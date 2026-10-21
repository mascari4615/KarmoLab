import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/restart-service.ps1', import.meta.url));
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const stub = `param([string]$Action,[string]$ServiceName)
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
exit $code
`;

function restart(scenario: { states: string[]; restartExit?: number; startExit?: number; restartMessage?: string }) {
  const prefix = join(resolve(tmpdir()), 'bot service restart ');
  const folder = mkdtempSync(prefix);
  const stubPath = join(folder, 'nssm-stub.ps1');
  const statePath = join(folder, 'state.json');
  writeFileSync(stubPath, stub);
  writeFileSync(statePath, JSON.stringify({ cursor: 0, calls: [], restartExit: 0, startExit: 0, restartMessage: '', ...scenario }));
  try {
    const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NssmPath', stubPath, '-TimeoutSec', '1', '-PollIntervalMs', '10'], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, RESTART_TEST_STATE: statePath }, windowsHide: true,
    });
    if (result.error) throw result.error;
    const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
    return { code: result.status, output: result.stdout + result.stderr, calls: state.calls };
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
  });

  it('checks RUNNING even after a successful restart command', () => {
    const result = restart({ states: ['SERVICE_RUNNING'] });
    expect(result.code, result.output).toBe(0);
    expect(result.calls).toContain('status');
  });

  it('fails if START_PENDING never becomes RUNNING', () => {
    const result = restart({ states: ['SERVICE_START_PENDING'] });
    expect(result.code, result.output).not.toBe(0);
  });

  it('fails a paused service instead of declaring success', () => {
    const result = restart({ states: ['SERVICE_PAUSED'] });
    expect(result.code, result.output).not.toBe(0);
  });

  it('starts a stopped service once and waits for it', () => {
    const result = restart({ states: ['SERVICE_STOPPED', 'SERVICE_START_PENDING', 'SERVICE_RUNNING'], restartExit: 1 });
    expect(result.code, result.output).toBe(0);
    expect(result.calls.filter((value: string) => value === 'start')).toHaveLength(1);
  });

  it('keeps an unconfirmed restart failure as a failure', () => {
    const result = restart({ states: ['SERVICE_RUNNING'], restartExit: 1, startExit: 1 });
    expect(result.code, result.output).not.toBe(0);
  });
});
