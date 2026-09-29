/**
 * 저장된 업로드 비밀번호 로딩.
 *
 * 우선순위는 호출부(upload.mjs) 책임: 명시 env(FILES_VAULT_PASS) > 이 모듈의 저장값.
 * 저장, 삭제: scripts/save-upload-password.ps1. 여기는 읽기 전용.
 * 저장 형식: PowerShell `ConvertFrom-SecureString` (CurrentUser DPAPI, 키 인자 없음) 하나뿐.
 * 값은 로그 금지. child_process 인자에도 평문 금지 (프로세스 목록 노출 방지).
 */
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export function secretPath() {
  const base = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
  return join(base, 'karmo-files', 'upload.secret');
}

/**
 * PowerShell 명령 뼈대. 파일 읽기 -> DPAPI 복호 -> stdout 한 줄.
 * 경로는 작은따옴표 이스케이프만 (악성 경로 대상이 아닌 고정 경로).
 */
export function buildDecryptCommand(path) {
  const escaped = path.replace(/'/g, "''");
  const script =
    `$e = Get-Content -LiteralPath '${escaped}' -Raw; ` +
    `if (-not $e) { exit 3 } ; ` +
    `$s = ConvertTo-SecureString -String $e.Trim() ; ` +
    `$b = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s) ; ` +
    `try { [Console]::Out.Write([System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)) } ` +
    `finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }`;
  return { command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', script] };
}

async function defaultExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultRun(command, args) {
  const { stdout } = await execFileAsync(command, args, { windowsHide: true });
  return stdout;
}

/**
 * 저장된 비밀번호 읽기. 파일 없음, PowerShell 없음, 복호 결과 빈 값이면 null.
 * 실패는 예외 대신 null: 호출부가 "저장 안 됨"과 동일 취급, 기존 흐름(프롬프트/에러)으로 낙하.
 */
export async function loadStoredPassword({ existsFn = defaultExists, run = defaultRun } = {}) {
  const path = secretPath();
  let exists;
  try {
    exists = await existsFn(path);
  } catch {
    exists = false;
  }
  if (!exists) return null;
  let value;
  try {
    const { command, args } = buildDecryptCommand(path);
    value = await run(command, args);
  } catch {
    return null;
  }
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}
