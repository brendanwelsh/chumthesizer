# Toggle Windows Precision-Touchpad 3/4-finger gestures (slides AND taps) on/off, so
# they don't hijack your fingers (switch desktops/apps, open Search/Start, Task view,
# action center) while you play Chumthesizer.
#
#   powershell -File scripts/touchpad-gestures.ps1 off | on | toggle | status
#
# "off" backs up your current values first; "on" restores them (or sensible defaults).
param([ValidateSet("off", "on", "toggle", "status")] [string]$Action = "toggle", [switch]$NoApply)
$ErrorActionPreference = "Stop"

$key = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad"
$names = @("ThreeFingerSlideEnabled", "FourFingerSlideEnabled", "ThreeFingerTapEnabled", "FourFingerTapEnabled")
$defaults = @{ ThreeFingerSlideEnabled = 1; FourFingerSlideEnabled = 2; ThreeFingerTapEnabled = 1; FourFingerTapEnabled = 1 }
$backupDir = Join-Path $env:LOCALAPPDATA "Chumthesizer"
$backup = Join-Path $backupDir "gestures-backup.json"

$sig = '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
$U = Add-Type -MemberDefinition $sig -Name Native -Namespace Chum -PassThru
function Broadcast { $r = [UIntPtr]::Zero; [void]$U::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, "PrecisionTouchPad", 2, 300, [ref]$r) }

function Refresh-Shell {
  if ($NoApply) { return }
  # the 3/4-finger gestures are handled by the Windows shell, which only re-reads these
  # when Explorer restarts - so nudge it (your taskbar blinks for ~1s).
  Write-Output "Refreshing Explorer to apply (taskbar may blink for a second)..."
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 700
  if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
}

function Get-Vals {
  $p = Get-ItemProperty -Path $key
  $h = @{}
  foreach ($n in $names) { $v = $p.$n; if ($null -eq $v) { $v = -1 }; $h[$n] = [int]$v }
  $h
}
function Set-AllZero {
  foreach ($n in $names) { Set-ItemProperty -Path $key -Name $n -Value 0 -Type DWord }
  Broadcast; Refresh-Shell
}
function Set-From($vals) {
  foreach ($n in $names) {
    $v = $vals[$n]; if ($null -eq $v -or $v -le 0) { $v = $defaults[$n] }  # never restore to "off"
    Set-ItemProperty -Path $key -Name $n -Value ([int]$v) -Type DWord
  }
  Broadcast; Refresh-Shell
}

$cur = Get-Vals
$isOn = @($names | Where-Object { $cur[$_] -ne 0 }).Count -gt 0

if ($Action -eq "status") {
  $s = ($names | ForEach-Object { "$_=$($cur[$_])" }) -join "  "
  Write-Output ("$s  ->  " + $(if ($isOn) { "ON" } else { "OFF" }))
  return
}
if ($Action -eq "toggle") { $Action = if ($isOn) { "off" } else { "on" } }

if ($Action -eq "off") {
  if ($isOn) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $cur | ConvertTo-Json | Set-Content -Path $backup -Encoding UTF8
  }
  Set-AllZero
  Write-Output "Touchpad 3/4-finger gestures (slides + taps): OFF - your fingers stay in Chumthesizer."
}
else {
  $vals = $null
  if (Test-Path $backup) {
    try { $b = Get-Content $backup -Raw | ConvertFrom-Json; $vals = @{}; foreach ($n in $names) { $vals[$n] = [int]$b.$n } } catch {}
  }
  if ($null -eq $vals) { $vals = $defaults }
  Set-From $vals
  Write-Output "Touchpad 3/4-finger gestures: ON."
}
