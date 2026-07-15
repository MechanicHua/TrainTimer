param(
    [string]$Configuration = "Release",
    [string]$RuntimeIdentifier = "win-x64",
    [string]$DotNet = "dotnet",
    [string]$NodeArchivePath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LauncherProject = Join-Path $ProjectRoot "windows\TrainTimer.Launcher\TrainTimer.Launcher.csproj"
$DistRoot = Join-Path $ProjectRoot "dist"
$OutputRoot = Join-Path $DistRoot "TrainTimer-Windows"
$RuntimeRoot = Join-Path $OutputRoot "Resources\runtime"
$ZipPath = Join-Path $DistRoot "TrainTimer-Windows-$RuntimeIdentifier.zip"

if (Test-Path $OutputRoot) {
    Remove-Item $OutputRoot -Recurse -Force
}
New-Item $RuntimeRoot -ItemType Directory -Force | Out-Null

& $DotNet publish $LauncherProject `
    --configuration $Configuration `
    --runtime $RuntimeIdentifier `
    --self-contained true `
    --output $OutputRoot `
    -p:EnableWindowsTargeting=true

Copy-Item (Join-Path $ProjectRoot "package.json") $RuntimeRoot
foreach ($directory in @("src", "public", "vendor")) {
    Copy-Item (Join-Path $ProjectRoot $directory) $RuntimeRoot -Recurse
}

$ThreeTarget = Join-Path $RuntimeRoot "node_modules\three"
New-Item (Split-Path -Parent $ThreeTarget) -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "node_modules\three") $ThreeTarget -Recurse

if ($NodeArchivePath) {
    if (-not (Test-Path $NodeArchivePath)) {
        throw "Node archive does not exist: $NodeArchivePath"
    }
    $NodeTemp = Join-Path $env:TEMP "TrainTimer-Node-$([Guid]::NewGuid())"
    Expand-Archive $NodeArchivePath $NodeTemp
    $NodeExe = Get-ChildItem $NodeTemp -Filter "node.exe" -Recurse | Select-Object -First 1
    if (-not $NodeExe) {
        throw "node.exe was not found in $NodeArchivePath"
    }
    $NodeTarget = Join-Path $OutputRoot "Resources\node"
    New-Item $NodeTarget -ItemType Directory -Force | Out-Null
    Copy-Item $NodeExe.FullName (Join-Path $NodeTarget "node.exe")
    Remove-Item $NodeTemp -Recurse -Force
}

Copy-Item (Join-Path $ProjectRoot "windows\README-Windows.md") (Join-Path $OutputRoot "README.md")

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
Compress-Archive -Path (Join-Path $OutputRoot "*") -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host "Windows launcher: $OutputRoot"
Write-Host "Archive: $ZipPath"
if (-not $NodeArchivePath) {
    Write-Warning "No portable Node archive was supplied. The launcher will use Node.js installed on the Windows computer."
}
