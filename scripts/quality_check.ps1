#!/usr/bin/env pwsh
# Quality check script for XML Visual Editor

$ErrorActionPreference = "Stop"
$exitCode = 0

Write-Host "=== XML Visual Editor Quality Checks ===" -ForegroundColor Cyan

# C++ format check
if (Get-Command clang-format -ErrorAction SilentlyContinue) {
    Write-Host "`n--- C++ Format Check ---" -ForegroundColor Yellow
    $cppFiles = Get-ChildItem -Path "core" -Include "*.cpp", "*.h" -Recurse
    foreach ($file in $cppFiles) {
        $result = & clang-format --dry-run -Werror $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  FAIL: $($file.FullName)" -ForegroundColor Red
            $exitCode = 1
        }
    }
    if ($exitCode -eq 0) { Write-Host "  PASS" -ForegroundColor Green }
} else {
    Write-Host "`n--- C++ Format Check: SKIPPED (clang-format not found) ---" -ForegroundColor DarkYellow
}

# CMake build + test
if (Test-Path "build/debug") {
    Write-Host "`n--- C++ Build + Test ---" -ForegroundColor Yellow
    cmake --build build/debug
    if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
    ctest --test-dir build/debug -V
    if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
} else {
    Write-Host "`n--- C++ Build: SKIPPED (no build/debug directory) ---" -ForegroundColor DarkYellow
}

# TypeScript checks
if (Test-Path "vscode-extension/node_modules") {
    Write-Host "`n--- TypeScript Checks ---" -ForegroundColor Yellow
    Push-Location vscode-extension
    npm run lint 2>&1
    if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
    npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
    Pop-Location
} else {
    Write-Host "`n--- TypeScript Checks: SKIPPED (no node_modules) ---" -ForegroundColor DarkYellow
}

Write-Host "`n=== Quality Checks Complete ===" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Host "All checks PASSED" -ForegroundColor Green
} else {
    Write-Host "Some checks FAILED" -ForegroundColor Red
}
exit $exitCode
