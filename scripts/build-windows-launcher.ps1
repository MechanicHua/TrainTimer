param(
    [string]$Configuration = "Release",
    [string]$RuntimeIdentifier = "win-x64",
    [string]$NodeArchivePath = "",
    [string]$NodeExecutablePath = "",
    [switch]$AllowSystemNode,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NativeSolution = Join-Path $ProjectRoot "windows\TrainTimer.Native\TrainTimer.Native.sln"
$InstallerScript = Join-Path $ProjectRoot "windows\installer\TrainTimer.iss"
$DistRoot = Join-Path $ProjectRoot "dist"
$NativeBuildRoot = Join-Path $DistRoot "native-build"
$NativeExe = Join-Path $NativeBuildRoot "TrainTimer.exe"
$OutputRoot = Join-Path $DistRoot "TrainTimer-Windows"
$ZipPath = Join-Path $DistRoot "TrainTimer-Windows-$RuntimeIdentifier.zip"
$Package = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$AppVersion = [string]$Package.version

if ($RuntimeIdentifier -ne "win-x64") {
    throw "The native launcher currently supports only win-x64."
}

function Resolve-MSBuild {
    $command = Get-Command "msbuild.exe" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installation = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath
        if ($installation) {
            $candidate = Join-Path $installation "MSBuild\Current\Bin\MSBuild.exe"
            if (Test-Path $candidate) { return $candidate }
        }
    }
    throw "MSBuild with the Visual C++ x64 toolchain was not found. Install Visual Studio Build Tools 2022 (Desktop development with C++)."
}

function Resolve-InnoCompiler {
    $command = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if (-not $base) { continue }
        $candidate = Join-Path $base "Inno Setup 6\ISCC.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

function Copy-PortableNode([string]$DestinationRoot) {
    $nodeTargetDirectory = Join-Path $DestinationRoot "Resources\node"
    $nodeTarget = Join-Path $nodeTargetDirectory "node.exe"
    $resolvedNode = $null
    $nodeTemp = $null

    try {
        if ($NodeExecutablePath) {
            if (-not (Test-Path $NodeExecutablePath -PathType Leaf)) {
                throw "Node executable does not exist: $NodeExecutablePath"
            }
            $resolvedNode = (Resolve-Path $NodeExecutablePath).Path
        } elseif ($NodeArchivePath) {
            if (-not (Test-Path $NodeArchivePath -PathType Leaf)) {
                throw "Node archive does not exist: $NodeArchivePath"
            }
            $nodeTemp = Join-Path $env:TEMP "TrainTimer-Node-$([Guid]::NewGuid())"
            Expand-Archive $NodeArchivePath $nodeTemp
            $nodeFile = Get-ChildItem $nodeTemp -Filter "node.exe" -Recurse | Select-Object -First 1
            if (-not $nodeFile) { throw "node.exe was not found in $NodeArchivePath" }
            $resolvedNode = $nodeFile.FullName
        } else {
            $currentBundledNode = Join-Path $OutputRoot "Resources\node\node.exe"
            if (Test-Path $currentBundledNode -PathType Leaf) {
                $resolvedNode = $currentBundledNode
            } else {
                $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
                if ($nodeCommand) { $resolvedNode = $nodeCommand.Source }
            }
        }

        if ($resolvedNode) {
            New-Item $nodeTargetDirectory -ItemType Directory -Force | Out-Null
            Copy-Item $resolvedNode $nodeTarget
            return $true
        }
        return $false
    } finally {
        if ($nodeTemp -and (Test-Path $nodeTemp)) { Remove-Item $nodeTemp -Recurse -Force }
    }
}

New-Item $DistRoot -ItemType Directory -Force | Out-Null
$msbuild = Resolve-MSBuild
& $msbuild $NativeSolution /m /t:Build "/p:Configuration=$Configuration" "/p:Platform=x64" /nologo /verbosity:minimal
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $NativeExe -PathType Leaf)) {
    throw "The native TrainTimer.exe build did not complete successfully."
}

$stagingRoot = Join-Path $DistRoot ".TrainTimer-Windows-$([Guid]::NewGuid())"
$runtimeRoot = Join-Path $stagingRoot "Resources\runtime"
New-Item $runtimeRoot -ItemType Directory -Force | Out-Null

try {
    Copy-Item $NativeExe (Join-Path $stagingRoot "TrainTimer.exe")
    Copy-Item (Join-Path $ProjectRoot "package.json") $runtimeRoot
    foreach ($directory in @("src", "public", "vendor")) {
        Copy-Item (Join-Path $ProjectRoot $directory) $runtimeRoot -Recurse
    }
    Copy-Item (Join-Path $ProjectRoot "windows\README-Windows.md") (Join-Path $stagingRoot "README.md")
    if (Test-Path (Join-Path $ProjectRoot "LICENSE") -PathType Leaf) {
        Copy-Item (Join-Path $ProjectRoot "LICENSE") (Join-Path $stagingRoot "LICENSE")
    }

    $hasBundledNode = Copy-PortableNode $stagingRoot
    if (-not $hasBundledNode -and -not $AllowSystemNode) {
        throw "No portable node.exe was found. Pass -NodeArchivePath or -NodeExecutablePath; use -AllowSystemNode only for a developer-only package."
    }

    if (Test-Path $OutputRoot) { Remove-Item $OutputRoot -Recurse -Force }
    Move-Item $stagingRoot $OutputRoot
} catch {
    if (Test-Path $stagingRoot) { Remove-Item $stagingRoot -Recurse -Force }
    throw
}

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $OutputRoot "*") -DestinationPath $ZipPath -CompressionLevel Optimal

$installerPath = $null
if (-not $SkipInstaller) {
    $iscc = Resolve-InnoCompiler
    if (-not $iscc) {
        Write-Warning "Inno Setup 6 was not found; the portable ZIP was created, but the installer was skipped."
    } else {
        & $iscc "/DSourceRoot=$OutputRoot" "/DOutputRoot=$DistRoot" "/DAppVersion=$AppVersion" $InstallerScript
        if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed to build the installer." }
        $installerPath = Join-Path $DistRoot "TrainTimer-Windows-x64-Setup.exe"
    }
}

Write-Host "Native launcher: $NativeExe"
Write-Host "Portable package: $OutputRoot"
Write-Host "Portable archive: $ZipPath"
if ($installerPath) { Write-Host "Installer: $installerPath" }
