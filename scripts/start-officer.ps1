param([string]$Emulator = 'Pixel_8')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'use-local-tools.ps1')
$adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$emulatorExe = Join-Path $env:ANDROID_HOME 'emulator/emulator.exe'
$devices = & $adb devices
if (-not ($devices -match '^emulator-\d+\s+device')) {
  & $emulatorExe -accel-check
  if ($LASTEXITCODE -ne 0) {
    throw 'Emulator acceleration is unavailable. Run scripts/enable-emulator-hypervisor.ps1 in administrator PowerShell, save your work, and restart Windows.'
  }
  $available = & $emulatorExe -list-avds
  if ($Emulator -notin $available) { throw "Emulator '$Emulator' not found. Available: $($available -join ', ')" }
  Start-Process -FilePath $emulatorExe -ArgumentList @('-avd', $Emulator) -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 2
    $devices = & $adb devices
    $device = ($devices | Where-Object { $_ -match '^emulator-\d+\s+device' } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    if ($device) { $boot = & $adb -s $device shell getprop sys.boot_completed }
  } until ($boot -match '1' -or (Get-Date) -gt $deadline)
  if ($boot -notmatch '1') { throw 'Emulator did not finish booting within three minutes. Check Android Studio Device Manager.' }
}
$device = ((& $adb devices | Where-Object { $_ -match '^emulator-\d+\s+device' } | Select-Object -First 1) -split '\s+')[0]
try { Invoke-WebRequest 'http://127.0.0.1:3000/api/v1/public/notices' -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch { throw 'Start the local database and API first (see README). The emulator connects to the host at 10.0.2.2:3000.' }
Push-Location (Join-Path $projectRoot 'apps/officer-mobile')
try { & flutter.bat run -d $device --dart-define=API_URL=http://10.0.2.2:3000/api/v1 }
finally { Pop-Location }
