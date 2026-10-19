param([ValidateSet('x64','arm64')][string]$Architecture='x64')
$ErrorActionPreference='Stop'
$AppRoot=Split-Path $PSScriptRoot -Parent
Set-Location $AppRoot
$HostArchitecture=[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($HostArchitecture -ne $Architecture) {
  throw "Pinned Flutter 3.35 selects the host architecture. Run this on a Windows $Architecture host; current host is $HostArchitecture."
}
flutter pub get --enforce-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency resolution failed' }
flutter build windows --release
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
$Bundle=Join-Path $AppRoot "build/windows/$Architecture/runner/Release"
Get-ChildItem $Bundle -File | Get-FileHash -Algorithm SHA256 | ConvertTo-Json | Set-Content (Join-Path $AppRoot "build/windows/$Architecture/checksums.json")
Write-Output 'Build output only. Installation, BLE, rendering and hardware performance acceptance remain pending.'
