# Installs (copies) the Chum Pedal Bridge plugin into the local Elgato Stream Deck Plugins folder.
# Then fully quit + reopen the Stream Deck software to load it. Run from the repo root:
#   npm run install:sd-plugin
$ErrorActionPreference = 'Stop'
$name = 'com.chum.chumthesizer.sdPlugin'
$src = Join-Path $PSScriptRoot "..\streamdeck-plugin\$name"
$src = (Resolve-Path $src).Path
$dest = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins\$name"

if (-not (Test-Path (Split-Path $dest))) {
  Write-Error "Stream Deck Plugins folder not found at $(Split-Path $dest). Is the Elgato Stream Deck software installed?"
}
if (-not (Test-Path (Join-Path $src 'node_modules\ws'))) {
  Write-Error "node_modules\ws missing in the plugin. Run 'npm run setup:sd-plugin' first."
}
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $src $dest -Recurse -Force
Write-Host "Installed -> $dest"
Write-Host "Now fully quit and reopen the Elgato Stream Deck software, then drag 'Chum Pedal' onto"
Write-Host "all 3 pedals. Chumthesizer connects automatically over ws://127.0.0.1:48909."
