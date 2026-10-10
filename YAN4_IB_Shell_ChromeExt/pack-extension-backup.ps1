# YAN4 IB Shell — 확장 백업 zip 생성
# 출력: ..\확장프로그램 백업\YAN4_IB_Shell_ChromeExt_v{version}.zip
$ErrorActionPreference = "Stop"

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path (Split-Path -Parent $src) (([string][char]0xD655)+([string][char]0xC7A5)+([string][char]0xC7A0)+([string][char]0xADF8)+([string][char]0xB7A8)+([string][char]0xC5D4)+" "+([string][char]0xBC31)+([string][char]0xC5C5))
$ver = (Get-Content (Join-Path $src "manifest.json") -Raw | ConvertFrom-Json).version
$zipName = "YAN4_IB_Shell_ChromeExt_v$ver.zip"
$zipPath = Join-Path $backupDir $zipName
$temp = Join-Path $env:TEMP ("yan4-shell-pack-" + [guid]::NewGuid().ToString("n"))

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path $temp -Force | Out-Null

$include = @(
  "manifest.json", "shell.js", "gm-bridge.js", "sla-download-bg.js",
  "yan4-ats-page.js", "yan4-ats-page.css",
  "yan4-sla-page.js", "yan4-sla-page.css",
  "yan4-rcrt-label-print.js", "yan4-bipyo-label-print.js",
  "recvq-fetch-hook.js",
  "icon96.png", "icon128.png", "privacy-policy.html"
)
foreach ($f in $include) {
  Copy-Item (Join-Path $src $f) (Join-Path $temp $f) -Force
}
foreach ($dir in @("vendor", "media")) {
  Copy-Item (Join-Path $src $dir) (Join-Path $temp $dir) -Recurse -Force
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$temp\*" -DestinationPath $zipPath -Force
Remove-Item $temp -Recurse -Force

$z = Get-Item $zipPath
Write-Host "OK: $($z.FullName)"
Write-Host "Size: $([math]::Round($z.Length / 1MB, 2)) MB"
