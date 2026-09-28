# Publishes claim to itch.io with butler (https://github.com/itchio/butler).
# One-time setup: see the "itch.io" section in README.md.
# Usage: powershell -ExecutionPolicy Bypass -File tools\publish-itch.ps1 [-Target user/game] [-Channel html5] [-DryRun]
param(
    [string]$Target = $env:ITCH_TARGET,   # e.g. "myname/claim"
    [string]$Channel = "html5",
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $PSScriptRoot "itch-target.txt"
if (-not $Target -and (Test-Path $configFile)) { $Target = (Get-Content $configFile -Raw).Trim() }
if (-not $Target) {
    $Target = Read-Host "itch.io target (user/game, e.g. myname/claim)"
    if (-not $Target) { throw "No target given." }
    Set-Content -Path $configFile -Value $Target
}

if (-not (Get-Command butler -ErrorAction SilentlyContinue)) {
    throw "butler not found in PATH. See README.md (itch.io section)."
}

# Stage everything except dev-only files (same as the manual zip without tools/)
$stage = Join-Path $env:TEMP "claim-itch-build"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
$exclude = @("tools", ".git", ".gitignore", ".claude", "AGENTS.md", "CLAUDE.md", "README.md")
Get-ChildItem -Path $root -Force | Where-Object { $exclude -notcontains $_.Name } |
    ForEach-Object { Copy-Item $_.FullName -Destination $stage -Recurse -Force }
Get-ChildItem -Path $stage -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

$count = (Get-ChildItem -Path $stage -Recurse -File).Count
Write-Host "Staged $count files in $stage"
if ($count -gt 1000) { throw "itch.io allows max 1000 files for HTML games ($count staged)." }

# Version shown on itch.io: git commit, if available
$version = ""
try { $version = (git -C $root describe --tags --always --dirty 2>$null) } catch {}

$pushArgs = @("push", $stage, "${Target}:${Channel}")
if ($version) { $pushArgs += @("--userversion", $version) }
if ($DryRun) { $pushArgs += "--dry-run" }

Write-Host "butler $($pushArgs -join ' ')"
& butler @pushArgs
if ($LASTEXITCODE -ne 0) { throw "butler push failed ($LASTEXITCODE)" }
if (-not $DryRun) { & butler status "${Target}:${Channel}" }
