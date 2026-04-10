#!/usr/bin/env bash
# Quality check script for XML Visual Editor
set -e

EXIT_CODE=0

echo "=== XML Visual Editor Quality Checks ==="

# C++ format check
if command -v clang-format &> /dev/null; then
    echo -e "\n--- C++ Format Check ---"
    find core/ -name '*.cpp' -o -name '*.h' | xargs clang-format --dry-run -Werror || EXIT_CODE=1
else
    echo -e "\n--- C++ Format Check: SKIPPED (clang-format not found) ---"
fi

# CMake build + test
if [ -d "build/debug" ]; then
    echo -e "\n--- C++ Build + Test ---"
    cmake --build build/debug || EXIT_CODE=1
    ctest --test-dir build/debug -V || EXIT_CODE=1
else
    echo -e "\n--- C++ Build: SKIPPED (no build/debug directory) ---"
fi

# TypeScript checks
if [ -d "vscode-extension/node_modules" ]; then
    echo -e "\n--- TypeScript Checks ---"
    cd vscode-extension
    npm run lint || EXIT_CODE=1
    npx tsc --noEmit || EXIT_CODE=1
    cd ..
else
    echo -e "\n--- TypeScript Checks: SKIPPED (no node_modules) ---"
fi

echo -e "\n=== Quality Checks Complete ==="
if [ $EXIT_CODE -eq 0 ]; then
    echo "All checks PASSED"
else
    echo "Some checks FAILED"
fi
exit $EXIT_CODE
