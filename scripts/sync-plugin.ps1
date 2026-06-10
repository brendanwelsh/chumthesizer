# Best-effort: mirror the plugin source into the installed UlanziDeck Plugins folder so that
# `npm run app` always ships the latest plugin. This NEVER fails the build - if Ulanzi Studio
# isn't installed, or a file is locked because Studio is holding the plugin, we just warn.
# A full quit + reopen of Ulanzi Studio loads the freshly-synced copy.
$ErrorActionPreference = 'Continue'
$name = 'com.ulanzi.trackpadsynth.ulanziPlugin'
$src = Join-Path $PSScriptRoot "..\ulanzi-plugin\$name"
try { $src = (Resolve-Path $src).Path } catch { Write-Host "[plugin] source not found; skipping sync"; exit 0 }

$pluginsRoot = Join-Path $env:APPDATA "Ulanzi\UlanziDeck\Plugins"
if (-not (Test-Path $pluginsRoot)) { Write-Host "[plugin] Ulanzi Studio not installed; skipping plugin sync"; exit 0 }
$dest = Join-Path $pluginsRoot $name

if (-not (Test-Path (Join-Path $src 'node_modules\ws'))) {
  Write-Host "[plugin] node_modules\ws missing in source - run 'npm run setup:plugin' once; skipping sync for now"
  exit 0
}

# robocopy tolerates in-use files and skips unchanged ones (/XO), so re-running is cheap.
# It returns 0-7 on success; anything >=8 means a real copy error. Always exit 0 either way.
robocopy $src $dest /E /XO /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
$code = $LASTEXITCODE
if ($code -lt 8) { Write-Host "[plugin] synced -> $dest (restart Ulanzi Studio to load changes)" }
else { Write-Host "[plugin] sync hit locked files (Studio running?) - run 'npm run install:plugin' after quitting Studio" }
exit 0
