# Zips the plugin folder (including node_modules/ws) into dist/ for sharing.
# Recipients unzip into %APPDATA%\Ulanzi\UlanziDeck\Plugins\ and restart Ulanzi Studio.
# Run from the repo root: npm run pack:plugin
$ErrorActionPreference = 'Stop'
$name = 'com.ulanzi.trackpadsynth.ulanziPlugin'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pluginDir = Join-Path $root "plugins\ulanzi-plugin\$name"
$distDir = Join-Path $root 'dist-plugin'
$zip = Join-Path $distDir "$name.zip"

if (-not (Test-Path (Join-Path $pluginDir 'node_modules\ws'))) {
  Write-Warning "node_modules\ws not found in the plugin. Run 'npm run setup:plugin' first so the shared zip actually works."
}
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $pluginDir -DestinationPath $zip -Force
Write-Host "Packed -> $zip"
