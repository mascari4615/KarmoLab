# Watch-Logs.ps1 - View Real-time YawnBot Logs

# Ensure we are running from Project Root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$ScriptDir\..\YawnBot.sln") {
	Set-Location "$ScriptDir\.."
}

# 1. Load Environment Variables
if (Test-Path "src/YawnBot/.env") {
	Get-Content "src/YawnBot/.env" | ForEach-Object {
		if ($_ -match "^(?!#)(.+?)=(.*)") {
			[Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
		}
	}
}

$ServerIp = $env:SERVER_IP
if ([string]::IsNullOrEmpty($ServerIp)) {
	Write-Host "Error: SERVER_IP not found in src/YawnBot/.env" -ForegroundColor Red
	exit 1
}

$User = "root"

Write-Host "📜 Connecting to $ServerIp to watch logs..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to exit." -ForegroundColor Gray

# 2. Watch Logs via SSH
ssh -t ${User}@${ServerIp} "journalctl -u yawn-bot -f"
