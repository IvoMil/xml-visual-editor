# XML Visual Editor

Multi-platform toolkit for advanced XSD schema aware XML editing.

## Overview

XML Visual Editor is a VS Code extension / Notepad++ plugin that provides:
- **Text View (Primary Focus)**: XML editing in VS Code and Notepad++, enriched with schema-aware assistance and contextual helpers.
- **Real-Time XSD Validation**: On-demand schema validation with inline problem markers (red underlines) and Problems panel integration. Validation can run automatically on edit (500ms debounce), and/or on open, and save.
- **Schema Viewer**: A dedicated schema exploration view showing XSD structure in a collapsible 3-column table with icons, color-coded compositors, and an Info Panel for element details.
- **Interactive Helpers**: Real-time helper panels for Elements (allowed children), Attributes (edit values) and Info (schema details) — all update on cursor move.
- **Schema-Aware Editing**: Intelligent completions and contextual hints when typing, based on your XSD structure.
- **XML Formatting**: Pretty-Print (indent) and Linearize (compact) commands with toolbar buttons and Shift+Alt+F support.
- **Tag Autoclose**: Automatic closing tag insertion with toggle in XML Actions toolbar.

All platforms share a **C++ core engine** built with pugixml and nlohmann_json, delivered as:
- **VS Code Extension** — TypeScript frontend with JSON-RPC communication to C++ engine
- **Notepad++ Plugin** — C++ DLL with direct core engine integration (Windows)
- **CLI Tools** — Command-line XML validation and schema introspection

## Current Features

### C++ Core Engine
- pugixml-based Document/Element model with round-trip fidelity
- XSD schema parser: full type resolution, content model computation, compositor handling (sequence/choice/all), `xs:group ref` inlining
- Service layer: DocumentService, FileService, ValidationService, SchemaService, HelperDataService
- HelperDataService: content model tree with instance state (is_satisfied, is_exhausted, can_insert), choice branch detection, compositor context, schema-aware element insertion, recursive required children insertion
- JSON-RPC 2.0 server (stdin/stdout) — 23 methods across Document, Validation, Schema, and Helper categories
- XSD validation with line/column diagnostics and element path context
- XML formatting: Pretty-Print (pugixml `format_indent`) and Linearize (pugixml `format_raw`)
- 148 Catch2 unit test cases (1568 assertions)

### VS Code Extension
- **Helper Panels** — three interactive sidebar panels that update on every cursor move:
  - **Elements Panel**: content model tree with compositor badges (sequence/choice/all), cardinality, instance state styling (bold=unsatisfied, dim=exhausted, strikethrough=inactive branch), insert buttons with cursor-adjacent highlighting, focus algorithm, interactive enum value selection (click to set), and boolean type support (true/false chooser)
  - **Attributes Panel**: editable form with enum dropdowns, fixed value locks, required/optional indicators, add/remove buttons
  - **Info Panel**: collapsible sections showing type info, documentation, compositor context, instance state, and enumeration values
- **Schema-Aware Completions** — IntelliSense-style completions triggered by `<`, space, `"`, `'`:
  - Element completions with content model tree flattening, choice headers, cardinality info, and remaining count
  - Attribute name completions (filters already-set, required/optional labels)
  - Attribute value completions (enum values with quote-bounded replace range)
  - Text content completions (enum values for simple-type elements)
  - Rich documentation popup with attributes table, enumerations, and compositor context
  - Inactive choice branch hiding (Rule 1 filter — hidden from completion dropdown)
  - Toggle Insert Required mode (inserts recursive required children + attributes)
- **XML Formatting** — Pretty-Print and Linearize commands:
  - Pretty-Print: format XML with 4-space indentation via C++ engine (toolbar button + Shift+Alt+F)
  - Linearize: compact single-line XML, strips insignificant whitespace (toolbar button)
- **Tag Autoclose** — automatic closing tag insertion:
  - Inserts `</tag>` when typing `>` that completes an opening tag
  - Handles attributes, namespace prefixes, and quoted `>` in attribute values
  - Exclusions: self-closing, comments, CDATA, processing instructions, duplicate close tags
  - Toggle on/off via toolbar button or `xmlVisualEditor.autoCloseTag` setting
- **Schema Management** — auto-detection from `xsi:schemaLocation` / `xsi:noNamespaceSchemaLocation`, HTTP/HTTPS downloading with recursive import/include resolution, persistent local caching
- **Validation** — on-demand and automatic (on edit/open/save) schema validation with inline problem markers and Problems panel integration
- **Cursor Tracking** — client-side XML context detection (9 cursor contexts A–I) with 150ms debounce
- **Auto-Activation** — panels auto-open on XML file activation, persist across file switches and sidebar close/reopen
- 115 Mocha tests (focus algorithm, cursor helpers, completion types, completion provider, filter rules, tag autoclose, wildcard rendering, compositor insertion)

### Infrastructure
- CMake + vcpkg build system with debug/release presets
- CI/CD pipeline (GitHub Actions) for multi-platform builds
- Agent suite (9 agents) and skill definitions (12 skills) for AI-assisted development

## Plans

See [Project Plan](docs/PROJECT_PLAN.md) for the full roadmap (Phases 1–7).

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project Initialization | ✅ Complete |
| 1 | Core Engine Foundation | ✅ Complete |
| 2 | Schema Support | ✅ Complete |
| 3a | Extension Scaffold | ✅ Complete |
| 3b | Helper Panels V1 → V2 | ✅ Complete |
| 3c | V2 Panel Parity | ✅ Complete |
| 3d | Panel Bugfixes (9 rounds) | ✅ Complete |
| 3e | Completion Provider | ✅ Complete |
| 3g | VS Code API Refactor | ✅ Complete |
| 3h | Helper Panel Enhancements | ✅ Complete |
| 3i | Indexed Path & Focus Fixes | ✅ Complete |
| 4a | Validation Options & Settings | ✅ Complete |
| 4b | Extension Settings & Menu | ✅ Complete |
| 4c | Smart Insertion Position | ✅ Complete |
| 4e | Pretty-Print, Linearize & Tag Autoclose | ✅ Complete |
| 4g | Schema Wildcard (xs:any) Enrichment | ✅ Complete |
| 4i | Compositor Insertion & Nested Choice | ✅ Complete |
| 4j | TS File Size Refactoring | ✅ Complete |
| 4h | Marketplace Publishing | ✅ Complete |
| 5 | Future Enhancements | 📋 Backlog |
| 6 | Notepad++ Plugin | 📋 Backlog |
| 7 | CLI Tools & Polish | 📋 Backlog |

## Prerequisites

- **C++20 compiler**: MSVC 17+ (Visual Studio 2022), GCC 12+, or Clang 15+
- **CMake 3.21+**
- **vcpkg** (package manager)
- **Node.js 18+** and **npm** (for VS Code extension)

## Quick Start

```bash
# Clone
git clone https://github.com/IvoMil/xml-visual-editor.git
cd xml-visual-editor

# Configure (requires VCPKG_ROOT environment variable)
cmake --preset debug

# Build
cmake --build build/debug

# Test
ctest --test-dir build/debug -V
```

## Project Structure

```
xml-visual-editor/
├── core/                    → C++ core engine (static library + JSON-RPC server)
│   ├── include/             → Public headers
│   ├── src/                 → Implementation
│   └── tests/               → Catch2 tests
├── vscode-extension/        → VS Code extension (TypeScript)
├── notepad-plus-plus/       → Notepad++ plugin (C++ DLL, Windows)
├── cli/                     → CLI tools (standalone binaries)
├── docs/                    → Documentation
├── scripts/                 → Quality check scripts
├── .github/                 → CI workflows, issue templates
├── CMakeLists.txt           → Root build configuration
├── vcpkg.json               → Package dependencies
└── CMakePresets.json        → Build presets
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Coding Standards](docs/CODING_STANDARDS.md)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Quality Checks

```bash
# Run all quality checks
./scripts/quality_check.sh    # Linux/macOS
.\scripts\quality_check.ps1   # Windows
```

## License

MIT License — see [LICENSE](LICENSE) for details.

Dependencies use compatible permissive licenses: pugixml (MIT), nlohmann_json (MIT), Catch2 (BSL-1.0), Google Benchmark (Apache-2.0).

