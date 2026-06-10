# Installs (copies) the Trackpad Synth Bridge plugin into the local UlanziDeck Plugins folder.
# Then fully quit + reopen Ulanzi Studio to load it. Run from the repo root: npm run install:plugin
$ErrorActionPreference = 'Stop'
$name = 'com.ulanzi.trackpadsynth.ulanziPlugin'
$src = Join-Path $PSScriptRoot "..\ulanzi-plugin\$name"
$src = (Resolve-Path $src).Path
$dest = Join-Path $env:APPDATA "Ulanzi\UlanziDeck\Plugins\$name"

if (-not (Test-Path (Split-Path $dest))) {
  Write-Error "UlanziDeck Plugins folder not found at $(Split-Path $dest). Is Ulanzi Studio installed?"
}
if (-not (Test-Path (Join-Path $src 'node_modules\ws'))) {
  Write-Error "node_modules\ws missing in the plugin. Run 'npm run setup:plugin' first."
}
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $src $dest -Recurse -Force
Write-Host "Installed -> $dest"
Write-Host "Now fully quit and reopen Ulanzi Studio, then add 'Filter & Transport' to the dial and"
Write-Host "'Drum Pad' to all 7 keys. The synth connects automatically over ws://127.0.0.1:48907."
