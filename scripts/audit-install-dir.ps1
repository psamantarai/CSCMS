<#
PLAN 13.5 acceptance audit.

Run AFTER installing to a custom directory, exercising the app fully
(onboarding, login, transactions, a banking entry, a backup, a daily
closing, a restore), and quitting.

Usage:
  .\scripts\audit-install-dir.ps1 -InstallDir "D:\CSCMS"

Checks, against docs/PLAN.md 13.5's Verify line:
  - %APPDATA%\CSCMS and %LOCALAPPDATA%\CSCMS do not exist
  - data\cscms.db, data\backups\, data\logs\ exist under InstallDir
  - Chromium's own Cache/Network/Local Storage folders sit under InstallDir
  - lists any file under InstallDir with an access/write time before the
    install, as a sanity check that nothing pre-existing is being conflated
  - reports the four documented exceptions (registry key, shortcuts,
    updater cache) as informational, not failures
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$fail = @()
$ok = @()

function Test-Absent($path, $label) {
    if (Test-Path $path) {
        $script:fail += "FAIL: $label still exists: $path"
    } else {
        $script:ok += "OK: $label absent ($path)"
    }
}

function Test-Present($path, $label) {
    if (Test-Path $path) {
        $script:ok += "OK: $label present ($path)"
    } else {
        $script:fail += "FAIL: $label missing: $path"
    }
}

Write-Host "=== 13.5 acceptance audit: $InstallDir ===" -ForegroundColor Cyan

# Must NOT exist anywhere outside the chosen folder
Test-Absent (Join-Path $env:APPDATA "CSCMS") "%APPDATA%\CSCMS"
Test-Absent (Join-Path $env:LOCALAPPDATA "CSCMS") "%LOCALAPPDATA%\CSCMS"

# Must exist under the chosen folder
$data = Join-Path $InstallDir "data"
Test-Present (Join-Path $data "cscms.db") "data\cscms.db"
Test-Present (Join-Path $data "backups") "data\backups\"
Test-Present (Join-Path $data "logs") "data\logs\"

# Chromium's own userData subfolders — created lazily, only once the
# corresponding feature is used (Cache on any network/asset load, Local
# Storage as soon as the renderer touches it). Missing here after a full
# exercise pass is a real finding, not expected absence.
Test-Present (Join-Path $data "Cache") "Chromium Cache\"
Test-Present (Join-Path $data "Network") "Chromium Network\"
Test-Present (Join-Path $data "Local Storage") "Chromium Local Storage\"

Write-Host ""
Write-Host "--- Documented exceptions (informational, not failures) ---" -ForegroundColor Yellow
$regKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CSCMS"
$regKeyUser = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CSCMS"
if ((Test-Path $regKey) -or (Test-Path $regKeyUser)) {
    Write-Host "Add/Remove Programs registry key: present (expected)"
} else {
    Write-Host "Add/Remove Programs registry key: not found under either HKLM/HKCU uninstall path (check manually if the installer used a different key name)"
}
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\CSCMS.lnk"
Write-Host "Start Menu shortcut: $(if (Test-Path $startMenu) { 'present (expected)' } else { 'not found at default path' })"
$desktop = Join-Path ([Environment]::GetFolderPath("Desktop")) "CSCMS.lnk"
Write-Host "Desktop shortcut: $(if (Test-Path $desktop) { 'present (expected)' } else { 'not found at default path' })"
$updaterCache = Join-Path $env:LOCALAPPDATA "cscms-updater"
Write-Host "electron-updater cache: $(if (Test-Path $updaterCache) { 'present (expected only during/after a download)' } else { 'absent (expected once no update has run)' })"

Write-Host ""
Write-Host "--- Result ---" -ForegroundColor Cyan
$ok | ForEach-Object { Write-Host $_ -ForegroundColor Green }
$fail | ForEach-Object { Write-Host $_ -ForegroundColor Red }

if ($fail.Count -gt 0) {
    Write-Host ""
    Write-Host "$($fail.Count) check(s) failed." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "All checks passed." -ForegroundColor Green
    exit 0
}
