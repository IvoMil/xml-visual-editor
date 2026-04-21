# XML Visual Editor

Multi-platform toolkit for advanced XSD schema-aware XML editing, with an XMLSpy-style hierarchical Grid View for any XML document.

## Overview

XML Visual Editor is a VS Code extension / Notepad++ plugin that provides:
- **Text View (Primary Focus)**: XML editing in VS Code and Notepad++, enriched with schema-aware assistance and contextual helpers.
- **Grid View (Read-Only, new in 0.6.0)**: An XMLSpy-style hierarchical grid rendering of any XML document, with auto-detected tables for repeated-sibling groups, hybrid tables for mixed scalar/structural columns, row/column orientation flip, column-scoped chevron drill-down, and multi-row/column selection. Editing and bidirectional text↔grid sync are planned for the next release.
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
- Catch2 unit test suite (grid-view service, hybrid candidacy, JSON writer, b1 fixture coverage)

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
- **Grid View (Read-Only)** — XMLSpy-style hierarchical grid view of the active XML document:
  - Launched via the `XML: Toggle Grid View` command or XML Actions toolbar; replaces the text editor for the document in the same tab
  - Auto-detects repeated-sibling groups and renders them as tables with row-index column, element numbering, and distinct header/row-id styling
  - **Hybrid tables**: runs whose members mix scalar values with sub-elements qualify as tables when they share a tag (union-shape candidacy); column set is the union of attribute and child-element names across the run
  - **Column-scoped chevron drill-down**: chevron cells expand in place inside their own column track; nested tables (including tables inside drill-downs inside drill-downs) render with their own headers, toggle icons, and column-paint highlighting
  - **Orientation flip**: per-section ⇆ icon flips rows↔columns while preserving selection across the flip
  - **Tree / table mode toggle**: per-section ⊟/⊞ icons switch a section between tree-ladder mode and table mode (multi-run sections toggle independently)
  - **Multi-row and multi-column selection** with plain-click, Ctrl+Click toggle, Shift+Click range, Shift+Arrow range-extend, Ctrl+A, Escape; row and column selection are mutually exclusive per node
  - **Batch expand/collapse**: `+`/`-` operate on the whole selection; `+` drills one level deeper each press
  - **Tree indent guides** + visible 1px grid lines + mixed-content row splitting (`Abc` child row for text nodes) + XML comment rows
  - Grid state (expansions, drill-down openings, selection, toggle states) survives tab switches
  - **Read-only in this release** — inline editing and bidirectional text↔grid sync are planned for the next phase
- 548 Mocha tests (focus algorithm, cursor helpers, completion types, completion provider, filter rules, tag autoclose, wildcard rendering, compositor insertion, grid view model, grid view renderer, hybrid tables, column-scoped drill-down, multi-select)

### Infrastructure
- CMake + vcpkg build system with debug/release presets
- CI/CD pipeline (GitHub Actions) for multi-platform builds
- Agent suite (10 agents) and skill definitions (12 skills) for AI-assisted development

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
| 5b.1 | Grid View Scaffold | ✅ Complete |
| 5b.2 | Grid View Table Mode | ✅ Complete |
| 5b.3 | Grid View Expand/Collapse, Navigation, Hybrid Tables & Drill-Down | ✅ Complete |
| 5b.3c | Annotation Cleanup & Standards Codification | 📋 Next |
| 5b.4 | Grid View Bidirectional Sync & Inline Editing | 📋 Backlog |
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

