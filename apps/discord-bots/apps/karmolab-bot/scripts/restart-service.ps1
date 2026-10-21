param(
    [Parameter(Mandatory = $true)][string]$NssmPath,
    [string]$ServiceName = 'karmolab-bot-prod',
    [ValidateRange(1, 600)][int]$TimeoutSec = 60,
    [ValidateRange(10, 5000)][int]$PollIntervalMs = 1000
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path -LiteralPath $NssmPath)) { throw 'NSSM executable not found' }

function Invoke-Nssm([string]$Action) {
    $output = & $NssmPath $Action $ServiceName 2>&1
    $nativeExit = $LASTEXITCODE
    return [pscustomobject]@{ ExitCode = $nativeExit; Output = ($output | Out-String).Trim() }
}

$restartResult = Invoke-Nssm 'restart'
if ($restartResult.Output) { Write-Host $restartResult.Output }
$confirmedTransition = $restartResult.ExitCode -eq 0 -or $restartResult.Output -match 'SERVICE_START_PENDING'
$startIssued = $false
$elapsed = [Diagnostics.Stopwatch]::StartNew()

while ($elapsed.Elapsed.TotalSeconds -lt $TimeoutSec) {
    $statusResult = Invoke-Nssm 'status'
    $match = [regex]::Match($statusResult.Output, '(?m)^\s*(SERVICE_[A-Z_]+)\s*$')
    if ($statusResult.ExitCode -ne 0 -or -not $match.Success) { throw "Service state lookup failed: $($statusResult.Output)" }
    $serviceState = $match.Groups[1].Value
    Write-Host "[restart-service] $ServiceName $serviceState"
    if ($serviceState -eq 'SERVICE_RUNNING') {
        if (-not $confirmedTransition) { throw 'Restart failed without a confirmed startup transition' }
        exit 0
    }
    if ($serviceState -eq 'SERVICE_STOPPED') {
        if ($startIssued) { throw 'Service stopped after the start request' }
        $startResult = Invoke-Nssm 'start'
        if ($startResult.Output) { Write-Host $startResult.Output }
        $confirmedTransition = $startResult.ExitCode -eq 0 -or $startResult.Output -match 'SERVICE_START_PENDING'
        $startIssued = $true
    } elseif ($serviceState -in @('SERVICE_START_PENDING', 'SERVICE_STOP_PENDING', 'SERVICE_CONTINUE_PENDING')) {
        $confirmedTransition = $true
    } else {
        throw "Service startup failed: $serviceState"
    }
    $remainingMs = [int][Math]::Max(0, $TimeoutSec * 1000 - $elapsed.Elapsed.TotalMilliseconds)
    if ($remainingMs -gt 0) { Start-Sleep -Milliseconds ([Math]::Min($PollIntervalMs, $remainingMs)) }
}
throw "Service did not reach RUNNING within $TimeoutSec seconds"
