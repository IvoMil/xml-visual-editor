<#
.SYNOPSIS
    Builds the C++ engine and packages platform-specific VSIX files.

.DESCRIPTION
    1. Builds the C++ engine in Release mode (Windows only locally).
    2. Compiles the TypeScript extension.
    3. Copies the engine binary to vscode-extension/bin/.
    4. Packages a platform-specific VSIX using vsce.

.PARAMETER Platform
    Target platform: win32-x64, linux-x64, darwin-x64, darwin-arm64, or all.
    Defaults to win32-x64.

.EXAMPLE
    .\scripts\package-vsix.ps1
    .\scripts\package-vsix.ps1 -Platform all
    .\scripts\package-vsix.ps1 -Platform linux-x64
#>

param(
    [ValidateSet("win32-x64", "linux-x64", "darwin-x64", "darwin-arm64", "all")]
    [string]$Platform = "win32-x64"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtDir = Join-Path $RepoRoot "vscode-extension"
$BinDir = Join-Path $ExtDir "bin"
$CmakePath = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"

# ---------------------------------------------------------------------------
# Multi-platform CI setup notes:
#
# For GitHub Actions, create a matrix build with jobs for each platform:
#   strategy:
#     matrix:
#       include:
#         - os: windows-latest
#           platform: win32-x64
#           engine_ext: .exe
#         - os: ubuntu-latest
#           platform: linux-x64
#           engine_ext: ""
#         - os: macos-latest
#           platform: darwin-x64
#           engine_ext: ""
#         - os: macos-latest
#           platform: darwin-arm64
#           engine_ext: ""
#
# Each job builds the C++ engine natively, copies it to vscode-extension/bin/,
# and runs: npx vsce package --target ${{ matrix.platform }}
# Then upload the .vsix as a build artifact.
# ---------------------------------------------------------------------------

function Invoke-EngineBuild {
    Write-Host "`n=== Building C++ engine (Release) ===" -ForegroundColor Cyan

    if (-not (Test-Path $CmakePath)) {
        Write-Error "CMake not found at: $CmakePath"
        return $false
    }

    $BuildDir = Join-Path $RepoRoot "build\release"

    # Configure if not already configured
    if (-not (Test-Path (Join-Path $BuildDir "CMakeCache.txt"))) {
        Write-Host "Configuring CMake (Release)..."
        & $CmakePath --preset release
        if ($LASTEXITCODE -ne 0) { Write-Error "CMake configure failed"; return $false }
    }

    # Build
    Write-Host "Building..."
    & $CmakePath --build $BuildDir --config Release
    if ($LASTEXITCODE -ne 0) { Write-Error "CMake build failed"; return $false }

    return $true
}

function Copy-EngineBinary {
    Write-Host "`n=== Copying engine binary ===" -ForegroundColor Cyan

    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
        Write-Host "Created $BinDir"
    }

    $SourceBinary = Join-Path $RepoRoot "build\release\core\Release\xve-engine.exe"
    $DestBinary = Join-Path $BinDir "xve-engine.exe"

    if (-not (Test-Path $SourceBinary)) {
        Write-Error "Engine binary not found at: $SourceBinary"
        return $false
    }

    Copy-Item -Path $SourceBinary -Destination $DestBinary -Force
    Write-Host "Copied $SourceBinary -> $DestBinary"
    return $true
}

function Invoke-ExtensionBuild {
    Write-Host "`n=== Compiling TypeScript extension ===" -ForegroundColor Cyan

    Push-Location $ExtDir
    try {
        npm run compile
        if ($LASTEXITCODE -ne 0) { Write-Error "npm run compile failed"; return $false }
    } finally {
        Pop-Location
    }
    return $true
}

function New-VsixPackage {
    param([string]$TargetPlatform)

    Write-Host "`n=== Packaging VSIX for $TargetPlatform ===" -ForegroundColor Cyan

    Push-Location $ExtDir
    try {
        npx vsce package --target $TargetPlatform
        if ($LASTEXITCODE -ne 0) { Write-Error "vsce package failed for $TargetPlatform"; return $false }
    } finally {
        Pop-Location
    }
    return $true
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$Platforms = if ($Platform -eq "all") {
    @("win32-x64", "linux-x64", "darwin-x64", "darwin-arm64")
} else {
    @($Platform)
}

$NonWindowsPlatforms = @("linux-x64", "darwin-x64", "darwin-arm64")
$HasWindowsPlatform = $Platforms | Where-Object { $_ -eq "win32-x64" }
$HasNonWindowsPlatform = $Platforms | Where-Object { $_ -in $NonWindowsPlatforms }

# Build engine (Windows only)
if ($HasWindowsPlatform) {
    if (-not (Invoke-EngineBuild)) { exit 1 }
    if (-not (Copy-EngineBinary)) { exit 1 }
}

if ($HasNonWindowsPlatform) {
    Write-Host "`nNote: Cross-compilation for non-Windows platforms is not supported locally." -ForegroundColor Yellow
    Write-Host "Use CI (GitHub Actions) to build native binaries for Linux/macOS." -ForegroundColor Yellow
    Write-Host "Non-Windows platforms requested: $($HasNonWindowsPlatform -join ', ')" -ForegroundColor Yellow
}

# Compile TypeScript
if (-not (Invoke-ExtensionBuild)) { exit 1 }

# Package VSIX for each platform
foreach ($p in $Platforms) {
    if ($p -in $NonWindowsPlatforms) {
        Write-Host "`nSkipping VSIX packaging for $p (no native binary available locally)." -ForegroundColor Yellow
        continue
    }
    if (-not (New-VsixPackage -TargetPlatform $p)) { exit 1 }
}

Write-Host "`n=== Done ===" -ForegroundColor Green
Get-ChildItem -Path $ExtDir -Filter "*.vsix" | ForEach-Object {
    Write-Host "  $($_.Name)" -ForegroundColor Green
}
