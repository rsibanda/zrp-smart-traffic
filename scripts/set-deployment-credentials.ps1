# Run interactively in your own PowerShell window. Values are never written to files.
[CmdletBinding()]
param(
  [switch]$PersistUserEnvironment,
  [switch]$UseDatabaseUrl,
  [switch]$Gui
)

$ErrorActionPreference = 'Stop'
function Read-DeploymentCredential([string]$Name) {
  if (-not $Gui) {
    return Read-Host $Name -AsSecureString
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $dialog = New-Object System.Windows.Forms.Form
  try {
    $dialog.Text = 'Deployment credential'
    $dialog.ClientSize = New-Object System.Drawing.Size(520, 145)
    $dialog.StartPosition = 'CenterScreen'
    $dialog.FormBorderStyle = 'FixedDialog'
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Paste the complete $Name value (Ctrl+V):"
    $label.SetBounds(12, 12, 495, 30)
    $inputBox = New-Object System.Windows.Forms.TextBox
    $inputBox.UseSystemPasswordChar = $true
    $inputBox.ShortcutsEnabled = $true
    $inputBox.SetBounds(12, 48, 495, 24)
    $save = New-Object System.Windows.Forms.Button
    $save.Text = 'Continue'
    $save.SetBounds(315, 95, 90, 28)
    $save.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.SetBounds(415, 95, 90, 28)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $dialog.Controls.AddRange(@($label, $inputBox, $save, $cancel))
    $dialog.AcceptButton = $save
    $dialog.CancelButton = $cancel
    $dialog.Add_Shown({ $inputBox.Focus() })
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      throw 'Credential entry cancelled.'
    }
    if ($inputBox.Text.Length -eq 0) { return New-Object System.Security.SecureString }
    return ConvertTo-SecureString $inputBox.Text -AsPlainText -Force
  } finally {
    if ($null -ne $inputBox) { $inputBox.Clear() }
    $dialog.Dispose()
  }
}
$credentialNames = @('RENDER_API_KEY', 'NETLIFY_AUTH_TOKEN')
if ($UseDatabaseUrl) {
  $credentialNames += 'DATABASE_URL'
} else {
  $credentialNames += 'NEON_API_KEY'
}

Write-Output 'Enter rotated credentials at the hidden prompts. Blank entries leave existing values unchanged.'
if ($PersistUserEnvironment) {
  Write-Output 'Values will be stored in your Windows user environment as well as this PowerShell process. They remain available until removed.'
} else {
  Write-Output 'Values apply only to this PowerShell process and applications launched from it.'
}

foreach ($credentialName in $credentialNames) {
  $secureValue = Read-DeploymentCredential $credentialName
  $buffer = [IntPtr]::Zero
  $plainValue = $null
  try {
    if ($secureValue.Length -eq 0) {
      Write-Output "$credentialName unchanged."
      continue
    }
    $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer)
    $plainValue = $plainValue.Trim()
    if ($plainValue.Length -lt 20 -or $plainValue -match '[^\x21-\x7E]' -or
        $plainValue.Contains('\_') -or $plainValue.Contains('"') -or $plainValue.Contains("'")) {
      Write-Output "$credentialName rejected: paste only the complete raw value, without quotes, spaces or escaped underscores. Existing value preserved."
      continue
    }
    if ($credentialName -eq 'RENDER_API_KEY' -and -not $plainValue.StartsWith('rnd_')) {
      Write-Output 'RENDER_API_KEY rejected: expected a Render API key beginning with rnd_. Existing value preserved.'
      continue
    }
    if ($credentialName -eq 'DATABASE_URL' -and $plainValue -notmatch '^postgres(ql)?://') {
      Write-Output 'DATABASE_URL rejected: expected a PostgreSQL connection URL. Existing value preserved.'
      continue
    }
    [Environment]::SetEnvironmentVariable($credentialName, $plainValue, 'Process')
    if ($PersistUserEnvironment) {
      [Environment]::SetEnvironmentVariable($credentialName, $plainValue, 'User')
    }
    Write-Output "$credentialName configured."
  } catch {
    throw "Could not configure $credentialName. No credential value has been printed."
  } finally {
    if ($buffer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
    }
    $plainValue = $null
    $secureValue.Dispose()
  }
}

Write-Output 'Credential setup finished. Do not paste values into chat.'
