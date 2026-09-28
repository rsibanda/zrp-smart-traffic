# Run once from an administrator PowerShell, then restart Windows yourself.
# No automatic restart and no change to existing emulator data.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$result = Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart
if ($result.RestartNeeded) {
  Write-Output 'Windows Hypervisor Platform enabled. Save your work and restart Windows before starting the emulator.'
} else {
  Write-Output 'Windows Hypervisor Platform is enabled. Check the emulator with scripts/start-officer.ps1.'
}
