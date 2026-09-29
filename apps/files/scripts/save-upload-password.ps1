<#
.SYNOPSIS
  Files 업로드 비밀번호를 이 Windows 계정에 한 번 저장한다. 이후 npm run upload 가 안 물어본다.

.DESCRIPTION
  비밀번호는 여기서 사용자가 직접 친다(두 번, 일치 확인). 저장은 Windows DPAPI (CurrentUser scope,
  PowerShell ConvertFrom-SecureString 기본 동작)로 하며 %LOCALAPPDATA%\karmo-files\upload.secret 에
  암호문만 남는다. 이 파일은 이 PC의 이 Windows 계정에서만 복호된다.

  보안 노트(사용자 결정 2026-09-29): 이 계정으로 실행되는 어떤 프로그램이든(사람이든 AI 도구든)
  이 값을 복호할 수 있다. 그 대신 매번 비밀번호를 치지 않아도 되는 쪽을 선택했다.

.PARAMETER Remove
  저장된 비밀번호를 지운다. 이후 npm run upload 는 오늘까지의 동작(FILES_VAULT_PASS 없으면 에러)으로 돌아간다.

.EXAMPLE
  powershell -File apps/files/scripts/save-upload-password.ps1
  powershell -File apps/files/scripts/save-upload-password.ps1 -Remove
#>
[CmdletBinding()]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$secretDir = Join-Path $env:LOCALAPPDATA 'karmo-files'
$secretPath = Join-Path $secretDir 'upload.secret'
$appsFilesDir = Split-Path -Parent $PSScriptRoot

if ($Remove) {
    if (Test-Path -LiteralPath $secretPath) {
        Remove-Item -LiteralPath $secretPath -Force
        Write-Host "지웠다: $secretPath"
    } else {
        Write-Host '저장된 비밀번호가 없다.'
    }
    return
}

function ConvertSecureStringToPlainText {
    param([Parameter(Mandatory)][System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

<#
  hdr 대조까지 도는 저비용 확인. rclone, 네트워크, node 중 하나라도 없거나 20초 초과면 $null(확인 생략).
  비밀번호는 이 자식 프로세스 환경변수 한정 전달, 이 프로세스 자신의 환경과 명령줄 인자에는 미기재.
#>
function Test-VaultPassword {
    param(
        [Parameter(Mandatory)][string]$PlainPassword,
        [Parameter(Mandatory)][string]$AppsFilesDir
    )
    $verifyScript = Join-Path $AppsFilesDir 'scripts\verify-vault-password.mjs'
    if (-not (Test-Path -LiteralPath $verifyScript)) { return $null }
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $null }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $nodeCmd.Source
        $psi.Arguments = '"' + $verifyScript + '"'
        $psi.WorkingDirectory = $AppsFilesDir
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.EnvironmentVariables['FILES_VAULT_PASS'] = $PlainPassword
        $proc = [System.Diagnostics.Process]::Start($psi)
        $finished = $proc.WaitForExit(20000)
        if (-not $finished) {
            try { $proc.Kill() } catch {}
            return $null
        }
        switch ($proc.ExitCode) {
            0 { return $true }
            1 { return $false }
            default { return $null }
        }
    } catch {
        return $null
    }
}

$first = Read-Host -AsSecureString '업로드 비밀번호'
$second = Read-Host -AsSecureString '다시 한 번'

$plain1 = ConvertSecureStringToPlainText -Secure $first
$plain2 = ConvertSecureStringToPlainText -Secure $second

if ($plain1 -ne $plain2) {
    $plain1 = $null
    $plain2 = $null
    Write-Error '두 입력이 다르다. 다시 실행.'
    exit 1
}
$plain2 = $null

$checked = Test-VaultPassword -PlainPassword $plain1 -AppsFilesDir $appsFilesDir
if ($checked -eq $false) {
    $plain1 = $null
    Write-Error '비밀번호가 안 맞다(클라우드 열기 실패). 저장하지 않았다.'
    exit 1
} elseif ($checked -eq $true) {
    Write-Host '확인 됨 (클라우드 열림).'
} else {
    Write-Host '확인 생략 (rclone, node, 네트워크 중 하나가 없다).'
}

New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
$secureToSave = ConvertTo-SecureString -String $plain1 -AsPlainText -Force
$encrypted = ConvertFrom-SecureString -SecureString $secureToSave
Set-Content -LiteralPath $secretPath -Value $encrypted -Encoding ascii -NoNewline
$plain1 = $null

Write-Host "저장했다: $secretPath"
Write-Host '이제 npm run upload -- --only <폴더> 를 비밀번호 없이 돌릴 수 있다.'
Write-Host '지우려면: powershell -File apps/files/scripts/save-upload-password.ps1 -Remove'
