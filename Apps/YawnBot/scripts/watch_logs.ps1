param (
	[string]$ServerIp = $env:SERVER_IP,
	[string]$User = "root"
)

# Watch-Logs.ps1 - View Real-time YawnBot Logs

# Ensure we are running from Project Root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$ScriptDir\..\YawnBot.sln") {
	Set-Location "$ScriptDir\.."
}

Write-Host "📜 Connecting to $ServerIp to watch logs..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to exit." -ForegroundColor Gray

# 2. Watch Logs via SSH
ssh -t ${User}@${ServerIp} "journalctl -u yawn-bot -f"
