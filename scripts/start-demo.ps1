param([switch]$Build)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'use-local-tools.ps1')
Push-Location $projectRoot
try {
  & (Join-Path $PSScriptRoot 'start-local-db.ps1')
  $apiReady = $false
  try {Invoke-WebRequest 'http://127.0.0.1:3000/api/v1/public/notices' -UseBasicParsing -TimeoutSec 3 | Out-Null; $apiReady = $true} catch {}
  if (-not $apiReady) {
    if ($Build -or -not (Test-Path 'apps/api/dist/main.js')) {
      & npm.cmd run db:generate
      if ($LASTEXITCODE -ne 0) {throw 'Prisma client generation failed'}
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) {throw 'Application build failed'}
    }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) {throw 'Database migration failed'}
    New-Item -ItemType Directory -Path '.tools' -Force | Out-Null
    Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'apps/api/dist/main.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.tools/api.out.log' -RedirectStandardError '.tools/api.err.log' | Out-Null
    $deadline = (Get-Date).AddSeconds(180)
    do {
      Start-Sleep -Seconds 1
      try {Invoke-WebRequest 'http://127.0.0.1:3000/api/v1/public/notices' -UseBasicParsing -TimeoutSec 2 | Out-Null; $apiReady = $true} catch {}
    } until ($apiReady -or (Get-Date) -gt $deadline)
    if (-not $apiReady) {throw 'API did not start; inspect .tools/api.err.log'}
  }
  $webReady = $false
  try {Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 3 | Out-Null; $webReady = $true} catch {}
  if (-not $webReady) {
    $vite = Join-Path $projectRoot 'apps/dashboard/node_modules/vite/bin/vite.js'
    if (-not (Test-Path $vite)) {$vite = Join-Path $projectRoot 'node_modules/vite/bin/vite.js'}
    Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"' + $vite + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'apps/dashboard') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.tools/dashboard.out.log') -RedirectStandardError (Join-Path $projectRoot '.tools/dashboard.err.log') | Out-Null
    $deadline = (Get-Date).AddSeconds(180)
    do {
      Start-Sleep -Seconds 1
      try {Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2 | Out-Null; $webReady = $true} catch {}
    } until ($webReady -or (Get-Date) -gt $deadline)
    if (-not $webReady) {throw 'Dashboard did not start; inspect .tools/dashboard.err.log'}
  }
  Write-Output 'Dashboard and public portal: http://localhost:5173'
  Write-Output 'API documentation: http://127.0.0.1:3000/api/docs'
  Write-Output 'Run scripts/start-officer.ps1 to launch the Android officer app.'
} finally {Pop-Location}
