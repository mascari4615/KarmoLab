# Search paths: Docs/ (global) + Apps/*/docs/ + Unity/*/docs/ (project-local)
$searchPaths = @("Docs", "Apps/*/docs", "Unity/*/docs")
$files = @()
foreach ($pattern in $searchPaths) {
    if (Test-Path $pattern) {
        $files += Get-ChildItem -Path $pattern -Recurse -Filter "*.md" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "Archive" }
    }
}
$foundErrors = $false

Write-Host "--- Compliance Check Report ---" -ForegroundColor Cyan

foreach ($file in $files) {
    if ($file.Name -ieq "README.md") { continue }
    
    $path = $file.FullName
    $content = Get-Content -Path $path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($content)) { continue }
    
    $lines = $content -split '\r?\n'
    $fileErrors = @()
    
    # 1. Check Summary
    $hasSummary = $false
    $summaryIndex = -1
    $h1Index = -1
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $l = $lines[$i].Trim()
        if ($l -match '^#\s') {
            if ($h1Index -eq -1) { $h1Index = $i }
        }
        if ($l -match '^Summary:') {
            if ($summaryIndex -eq -1) { $summaryIndex = $i; $hasSummary = $true }
        }
    }
    
    if (-not $hasSummary) { $fileErrors += "❌ Missing 'Summary:' field" }
    elseif ($h1Index -ne -1 -and $summaryIndex -lt $h1Index) {
        $fileErrors += "❌ 'Summary:' must be placed AFTER the primary H1 header"
    }
    
    # 2. Check Headers
    $inCodeBlock = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $l = $lines[$i].Trim()
        if ($l -match '^```') {
            $inCodeBlock = -not $inCodeBlock
            continue
        }
        if ($inCodeBlock) { continue }
        
        if ($l -match '^#+') {
            if ($i + 1 -lt $lines.Count) {
                if (-not [string]::IsNullOrWhiteSpace($lines[$i+1])) {
                    $fileErrors += "❌ Header at Line $($i+1) ('$l') not followed by blank line"
                }
            }
        }
    }
    
    if ($fileErrors.Count -gt 0) {
        $foundErrors = $true
        Write-Host "`n📄 $path" -ForegroundColor Yellow
        foreach ($err in $fileErrors) { Write-Host "   $err" }
    }
}

if (-not $foundErrors) { Write-Host "`n✅ All documents are compliant!" -ForegroundColor Green }
