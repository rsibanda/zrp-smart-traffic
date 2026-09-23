$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
  Write-Output 'Existing .env preserved.'
  return
}
function New-LocalSecret {
  $bytes = New-Object byte[] 24
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$databaseSecret = New-LocalSecret
$demoSecret = New-LocalSecret
$content = @"
POSTGRES_USER=traffic_demo
POSTGRES_PASSWORD=$databaseSecret
POSTGRES_DB=traffic_demo
DATABASE_URL=postgresql://traffic_demo:${databaseSecret}@127.0.0.1:5432/traffic_demo?schema=public
PORT=3000
HOST=127.0.0.1
WEB_ORIGIN=http://localhost:5173
DEMO_PASSWORD=$demoSecret
"@
[System.IO.File]::WriteAllText($envPath, $content)
Write-Output 'Created ignored .env with random local credentials. Read DEMO_PASSWORD locally to sign in.'
