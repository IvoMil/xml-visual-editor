#!/usr/bin/env pwsh
# Annotation gate — fails on process-historical tokens in production source.
#
# Forbidden in code/comments/JSDoc/CSS-comment/test-display-strings:
#   Round N, Phase N (as project-phase ref), Z1..Z16, Q1..Q9, B.1.a..B.6.e,
#   C1./C2., section refs §N, Iteration N, dated refs (YYYY-MM-DD).
#
# Reference: .github/skills/coding-standards/SKILL.md §Annotation Style
#            .github/skills/quality-gates/SKILL.md §Annotation Regex Gate
#
# Usage:
#   pwsh ./scripts/check-annotations.ps1            # default scan
#   pwsh ./scripts/check-annotations.ps1 -Verbose   # also list false positives

[CmdletBinding()]
param(
    [string[]] $Roots = @('core', 'vscode-extension/src'),
    [string[]] $Include = @('*.ts', '*.cpp', '*.h', '*.hpp')
)

$ErrorActionPreference = 'Stop'

# Detection regex — matches process-historical tokens in any text context.
$pattern = '(Round \d|Phase \d|\bZ\d{1,2}\b|\bQ\d{1,2}\b|Iteration \d|§\d|\bB\.\d|\bC\d\.)'

# Known-good exclusions: false positives that the regex matches but are not
# annotations. Each entry is a regex that matches the FULL trimmed line.
$falsePositivePatterns = @(
    # TypeScript regex character classes like [a-zA-Z0-9_\-.:] — `Z0` matches
    # `\bZ\d` but is part of an alphanumeric range, not an annotation.
    '\[[a-zA-Z0-9_\\\-.:]+\]'
)

$realHits = @()
$falsePositives = @()

foreach ($root in $Roots) {
    if (-not (Test-Path $root)) { continue }
    $files = Get-ChildItem -Path $root -Recurse -File -Include $Include
    foreach ($file in $files) {
        $matches = Select-String -Path $file.FullName -Pattern $pattern -AllMatches
        foreach ($m in $matches) {
            $line = $m.Line.Trim()
            $isFalsePositive = $false
            foreach ($fp in $falsePositivePatterns) {
                if ($line -match $fp) { $isFalsePositive = $true; break }
            }
            $rel = Resolve-Path -Relative $m.Path
            $entry = "{0}({1}): {2}" -f $rel, $m.LineNumber, $line
            if ($isFalsePositive) { $falsePositives += $entry }
            else { $realHits += $entry }
        }
    }
}

if ($VerbosePreference -eq 'Continue' -and $falsePositives.Count -gt 0) {
    Write-Host "`n--- Ignored false positives ($($falsePositives.Count)) ---" -ForegroundColor DarkGray
    $falsePositives | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
}

if ($realHits.Count -eq 0) {
    Write-Host "Annotation gate: PASS (0 process-historical tokens in $($Roots -join ', '))" -ForegroundColor Green
    exit 0
}

Write-Host "Annotation gate: FAIL ($($realHits.Count) hits)" -ForegroundColor Red
Write-Host "Process-historical tokens are forbidden in production source." -ForegroundColor Red
Write-Host "See .github/skills/coding-standards/SKILL.md §Annotation Style." -ForegroundColor Red
Write-Host ""
$realHits | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
exit 1
