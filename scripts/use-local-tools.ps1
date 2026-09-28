$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolPaths = @(
  (Join-Path $projectRoot '.tools/node-v22.23.2-win-x64'),
  (Join-Path $projectRoot '.tools/git/cmd'),
  (Join-Path $projectRoot '.tools/flutter/bin'),
  (Join-Path $projectRoot '.tools/postgres/pgsql/bin')
) | Where-Object { Test-Path -LiteralPath $_ }
$studioJava = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'
$javaRoot = Join-Path $projectRoot '.tools/java'
if (Test-Path (Join-Path $studioJava 'bin/java.exe')) {
  $env:JAVA_HOME = $studioJava
  $toolPaths += (Join-Path $env:JAVA_HOME 'bin')
} elseif (Test-Path -LiteralPath $javaRoot) {
  $env:JAVA_HOME = (Get-ChildItem -LiteralPath $javaRoot -Directory | Select-Object -First 1).FullName
  $toolPaths += (Join-Path $env:JAVA_HOME 'bin')
}
$androidRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
if (-not (Test-Path (Join-Path $androidRoot 'platform-tools/adb.exe'))) {
  $androidRoot = Join-Path $projectRoot '.tools/android-sdk'
}
if (Test-Path -LiteralPath $androidRoot) {
  $env:ANDROID_HOME = $androidRoot
  $env:ANDROID_SDK_ROOT = $androidRoot
  $toolPaths += (Join-Path $androidRoot 'platform-tools')
  $toolPaths += (Join-Path $androidRoot 'emulator')
}
$env:PATH = ($toolPaths -join ';') + ';' + $env:PATH
$env:npm_config_cache = Join-Path $projectRoot '.tools/npm-cache'
Write-Output 'Workspace tools enabled for this PowerShell session.'
