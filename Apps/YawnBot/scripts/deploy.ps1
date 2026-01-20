
param (
	[string]$ServerIp = $env:SERVER_IP,
	[string]$User = "root"
)

# Check if ServerIp is provided
if ([string]::IsNullOrEmpty($ServerIp)) {
	Write-Host "Error: ServerIp is required. Please provide it as a parameter or set the SERVER_IP environment variable." -ForegroundColor Red
	exit 1
}

# Deploy.ps1 - YawnBot Deployment Script

# Ensure we are running from Project Root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Check relative to scripts/ folder
if (Test-Path "$ScriptDir\..\YawnBot.sln") {
	Set-Location "$ScriptDir\.."
}

$RemotePath = "/root/yawn-bot"
# Path relative to Project Root (after Set-Location)
$LocalPath = "src\YawnBot\bin\Release\net9.0\linux-x64\publish\*"

Write-Host "🚀 Starting Deployment to $ServerIp..." -ForegroundColor Cyan

# 2. Build via WSL (or native)
# Using native dotnet build for Linux
Write-Host "🔨 Building for Linux (x64)..." -ForegroundColor Yellow

# Build specific project file
dotnet publish src/YawnBot/YawnBot.csproj -c Release -r linux-x64 --self-contained
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# Calculate and Print Total Size
$PublishDir = "src\YawnBot\bin\Release\net9.0\linux-x64\publish"
if (Test-Path $PublishDir) {
	$Size = (Get-ChildItem -Path $PublishDir -Recurse | Measure-Object -Property Length -Sum).Sum
	$SizeMB = [math]::Round($Size / 1MB, 2)
	Write-Host "📦 Total Upload Size: $SizeMB MB" -ForegroundColor Cyan
}

# 3. Stop Service (to release file lock)
Write-Host "🛑 Stopping Service..." -ForegroundColor Yellow
ssh ${User}@${ServerIp} "systemctl stop yawn-bot"

# 4. Upload Files
# Note: Requires SSH Key setup for passwordless login, or manual password entry.
Write-Host "📤 Uploading files via SCP..." -ForegroundColor Yellow
scp -r $LocalPath ${User}@${ServerIp}:${RemotePath}
if ($LASTEXITCODE -ne 0) { Write-Host "Upload failed!" -ForegroundColor Red; exit 1 }

# 5. Start Service
Write-Host "✅ Starting Service..." -ForegroundColor Yellow
ssh ${User}@${ServerIp} "systemctl start yawn-bot && systemctl status yawn-bot --no-pager"

Write-Host "🚀 Deployment Complete!" -ForegroundColor Green

# 6. Auto-watch Logs
Write-Host "📜 Switching to log view in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3
./scripts/watch_logs.ps1
