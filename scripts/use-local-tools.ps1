$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolPaths = @(
  (Join-Path $projectRoot '.tools/node-v22.23.2-win-x64'),
  (Join-Path $projectRoot '.tools/git/cmd'),
  (Join-Path $projectRoot '.tools/flutter/bin'),
  (Join-Path $projectRoot '.tools/postgres/pgsql/bin')
) | Where-Object { Test-Path -LiteralPath $_ }
$javaRoot = Join-Path $projectRoot '.tools/java'
if (Test-Path -LiteralPath $javaRoot) {
  $env:JAVA_HOME = (Get-ChildItem -LiteralPath $javaRoot -Directory | Select-Object -First 1).FullName
  $toolPaths += (Join-Path $env:JAVA_HOME 'bin')
}
$androidRoot = Join-Path $projectRoot '.tools/android-sdk'
if (Test-Path -LiteralPath $androidRoot) {
  $env:ANDROID_HOME = $androidRoot
  $toolPaths += (Join-Path $androidRoot 'platform-tools')
}
$env:PATH = ($toolPaths -join ';') + ';' + $env:PATH
$env:npm_config_cache = Join-Path $projectRoot '.tools/npm-cache'
Write-Output 'Workspace tools enabled for this PowerShell session.'
