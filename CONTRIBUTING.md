# Contributing to XML Visual Editor

Thank you for your interest in contributing to XML Visual Editor! This document provides guidelines for contributing to the project.

## How to Report Bugs

Please use [GitHub Issues](https://github.com/IvoMil/xml-visual-editor/issues) with the **Bug Report** template. Include:

- **VS Code version** and **Extension version**
- **Operating system** (Windows/Linux/macOS)
- **Steps to reproduce** the issue
- **Expected vs. actual behavior**
- **XML/XSD snippets** that trigger the bug (if applicable)
- **Screenshots** if the issue is visual

## How to Suggest Features

Open a [GitHub Issue](https://github.com/IvoMil/xml-visual-editor/issues) using the **Feature Request** template. Describe the problem you're trying to solve and your proposed solution.

## How to Contribute Code

### Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/<your-username>/xml-visual-editor.git`
3. **Create a feature branch**: `git checkout -b feature/my-feature` or `bugfix/my-fix`

### Build Prerequisites

- **CMake** 3.21+
- **vcpkg** (manifest mode — dependencies are auto-installed)
- **C++20 compiler**: MSVC 17+, GCC 12+, or Clang 15+
- **Node.js** 18+ (for the VS Code extension)

### Building

**C++ core engine:**
```bash
cmake --preset ci
cmake --build build/ci
```

**C++ tests:**
```bash
ctest --test-dir build/ci
```

**VS Code extension:**
```bash
cd vscode-extension
npm install
npm run compile
npm test
```

### Coding Standards

- **C++**: Google style, 120-character line limit, 4-space indent, `xve::` namespace
- **TypeScript**: Strict mode, ESLint (airbnb-typescript-prettier), Prettier
- **Naming**: PascalCase (types), snake_case (functions/variables), kPascalCase (constants)
- **File size limit**: Keep individual source files under 500 lines
- **Tests**: Catch2 for C++, Mocha for TypeScript — all changes must include tests

### Submitting a Pull Request

1. Ensure all tests pass (`ctest` for C++, `npm test` for TypeScript)
2. Run formatting and linting checks
3. Submit a PR against `main` with a descriptive title and description
4. Reference any related issues in the PR description

## Architecture Overview

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the project architecture. Key rules:

- The **core engine** (`core/`) must be platform-independent (no Win32, GTK, Qt, VS Code API)
- The **VS Code extension** communicates with the engine via **JSON-RPC over stdin/stdout**
- All cross-layer data must be **JSON-serializable**

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.
