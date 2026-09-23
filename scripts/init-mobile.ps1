$ErrorActionPreference = 'Stop'
$mobileRoot = Join-Path $PSScriptRoot '../apps/officer-mobile'
Push-Location $mobileRoot
try {
  # Preserve reviewed source even if the installed Flutter template replaces it.
  $preservedFiles = @{}
  foreach ($relativePath in @('lib/main.dart', 'test/widget_test.dart', 'pubspec.yaml', 'analysis_options.yaml')) {
    $preservedFiles[$relativePath] = [System.IO.File]::ReadAllBytes((Join-Path $mobileRoot $relativePath))
  }
  try {
    flutter create --platforms=android --project-name officer_mobile --no-pub .
    if ($LASTEXITCODE -ne 0) { throw 'Flutter platform generation failed' }
  } finally {
    foreach ($relativePath in $preservedFiles.Keys) {
      [System.IO.File]::WriteAllBytes((Join-Path $mobileRoot $relativePath), $preservedFiles[$relativePath])
    }
  }
  $debugManifest = Join-Path $mobileRoot 'android/app/src/debug/AndroidManifest.xml'
  [System.IO.File]::WriteAllText($debugManifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application android:usesCleartextTraffic="true"/></manifest>')
  flutter pub get
  if ($LASTEXITCODE -ne 0) { throw 'Flutter dependency resolution failed' }
} finally { Pop-Location }
