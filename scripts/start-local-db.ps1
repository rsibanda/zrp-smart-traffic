$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pgBin = Join-Path $projectRoot '.tools/postgres/pgsql/bin'
if (Test-Path (Join-Path $projectRoot '.tools/postgres-minimal/pgsql/share/postgres.bki')) {
  $pgBin = Join-Path $projectRoot '.tools/postgres-minimal/pgsql/bin'
}
if (-not (Test-Path (Join-Path $pgBin 'pg_ctl.exe'))) {
  throw 'Portable PostgreSQL is absent. Use docker compose up -d --wait or install the official binaries into .tools/postgres.'
}
& (Join-Path $PSScriptRoot 'init-local-env.ps1')
$settings = @{}
Get-Content (Join-Path $projectRoot '.env') | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
foreach ($key in @('POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD')) {
  if (-not $settings[$key]) { throw "Missing $key in .env" }
}
$dataPath = Join-Path $projectRoot '.tools/postgres-data'
$passwordPath = Join-Path $projectRoot '.tools/postgres-password'
if (-not (Test-Path (Join-Path $dataPath 'PG_VERSION'))) {
  [System.IO.File]::WriteAllText($passwordPath, $settings.POSTGRES_PASSWORD)
  try {
    & (Join-Path $pgBin 'initdb.exe') -D $dataPath -U $settings.POSTGRES_USER --pwfile=$passwordPath --auth=scram-sha-256 --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialisation failed' }
  } finally { Remove-Item -LiteralPath $passwordPath -ErrorAction SilentlyContinue }
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataPath -l (Join-Path $projectRoot '.tools/postgres.log') -o '-h 127.0.0.1 -p 5432' -w start
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed; inspect .tools/postgres.log' }
}
$previousPassword = $env:PGPASSWORD
if ($settings.POSTGRES_DB -notmatch '^[A-Za-z0-9_]+$') { throw 'Use an alphanumeric local database name' }
try {
  $env:PGPASSWORD = $settings.POSTGRES_PASSWORD
  $exists = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -U $settings.POSTGRES_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$($settings.POSTGRES_DB)'"
  if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to local PostgreSQL' }
  if ($exists -ne '1') {
    & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -U $settings.POSTGRES_USER $settings.POSTGRES_DB
    if ($LASTEXITCODE -ne 0) { throw 'Demo database creation failed' }
  }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Output 'Local PostgreSQL ready on 127.0.0.1:5432.'
