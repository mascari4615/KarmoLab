# setup-dev-link.ps1
$ErrorActionPreference = "Stop"

# 확장 고유 ID
$extensionId = "mascari4615.karmo-vscode-extension-1.1.0"
$legacyId = "mascari4615.karmo-vscode-extension-dev"

# 대상 경로 목록 (일반 VS Code & Antigravity IDE)
$targetDirs = @(
	"$HOME\.vscode\extensions",
	"$HOME\.antigravity\extensions"
)

$sourcePath = (Get-Item .).FullName

Write-Host ">>> VS Code & Antigravity 확장 개발자 링크 설정 시작" -ForegroundColor Cyan

foreach ($dir in $targetDirs) {
	if (-not (Test-Path $dir)) {
		Write-Host "경로를 찾을 수 없어 건너뜁니다: $dir" -ForegroundColor Gray
		continue
	}

	$targetPath = Join-Path $dir $extensionId
	$legacyPath = Join-Path $dir $legacyId

	Write-Host "`n[대상] $dir" -ForegroundColor Green

	# 1. 기존 잔재 정리
	foreach ($p in @($targetPath, $legacyPath)) {
		if (Test-Path $p) {
			Write-Host "기존 확장 폴더/링크 제거: $p" -ForegroundColor Yellow
			cmd /c "rmdir /s /q `"$p`"" 2>$null
			if (Test-Path $p) { Remove-Item -Path $p -Recurse -Force }
		}
	}

	# 2. Junction 생성
	Write-Host "심볼릭 링크(Junction) 생성 중..." -ForegroundColor Cyan
	New-Item -ItemType Junction -Path $targetPath -Target $sourcePath | Out-Null
}

# 3. 컴파일
Write-Host "`n>>> 프로젝트를 컴파일합니다..." -ForegroundColor Cyan
npm run compile

Write-Host "`n>>> 모든 설정 완료!" -ForegroundColor Green
Write-Host "1. VS Code 또는 Antigravity IDE를 재시작/새로고침하세요."
Write-Host "2. 이제 실시간으로 소스 코드 변경 사항이 양쪽 모두에 반영됩니다."
