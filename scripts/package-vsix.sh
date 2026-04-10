#!/usr/bin/env bash
# Build the C++ engine and package a platform-specific VSIX.
#
# Usage:
#   ./scripts/package-vsix.sh [platform]
#
# Platform: win32-x64 | linux-x64 | darwin-x64 | darwin-arm64
# Default: auto-detect from current OS/arch.
#
# Multi-platform CI: build natively on each OS, copy binary to
# vscode-extension/bin/, then run: npx vsce package --target <platform>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$REPO_ROOT/vscode-extension"
BIN_DIR="$EXT_DIR/bin"

# Detect platform if not specified
detect_platform() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Linux)  os="linux" ;;
        Darwin) os="darwin" ;;
        *)      echo "Unsupported OS: $os" >&2; exit 1 ;;
    esac

    case "$arch" in
        x86_64)  arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)       echo "Unsupported arch: $arch" >&2; exit 1 ;;
    esac

    echo "${os}-${arch}"
}

PLATFORM="${1:-$(detect_platform)}"
echo "=== Target platform: $PLATFORM ==="

# --- Build C++ engine (Release) ---
echo ""
echo "=== Building C++ engine (Release) ==="
BUILD_DIR="$REPO_ROOT/build/release"

if [ ! -f "$BUILD_DIR/CMakeCache.txt" ]; then
    echo "Configuring CMake (Release)..."
    cmake --preset release
fi

cmake --build "$BUILD_DIR" --config Release

# --- Copy engine binary ---
echo ""
echo "=== Copying engine binary ==="
mkdir -p "$BIN_DIR"

ENGINE_BIN="$BUILD_DIR/core/Release/xve-engine"
if [ ! -f "$ENGINE_BIN" ]; then
    # Try non-config-subdirectory layout (single-config generators)
    ENGINE_BIN="$BUILD_DIR/core/xve-engine"
fi

if [ ! -f "$ENGINE_BIN" ]; then
    echo "Error: Engine binary not found" >&2
    exit 1
fi

cp "$ENGINE_BIN" "$BIN_DIR/xve-engine"
chmod +x "$BIN_DIR/xve-engine"
echo "Copied -> $BIN_DIR/xve-engine"

# --- Compile TypeScript ---
echo ""
echo "=== Compiling TypeScript extension ==="
cd "$EXT_DIR"
npm run compile

# --- Package VSIX ---
echo ""
echo "=== Packaging VSIX for $PLATFORM ==="
npx vsce package --target "$PLATFORM"

echo ""
echo "=== Done ==="
ls -la "$EXT_DIR"/*.vsix 2>/dev/null || echo "(no .vsix files found)"
