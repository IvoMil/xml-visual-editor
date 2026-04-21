# Architecture — XML Visual Editor (C++ Multi-Platform)

## Overview

XML Visual Editor is a multi-platform XML editing toolkit with XSD schema awareness.
A shared C++ core engine provides XML/XSD processing, exposed through platform-specific
frontends for VS Code, Notepad++, and command-line use.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Platform Frontends                         │
│                                                               │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  VS Code Extension│  │ Notepad++    │  │  CLI Tools    │  │
│  │  (TypeScript)     │  │ Plugin (C++) │  │  (C++)        │  │
│  │  JSON-RPC Client  │  │ Static Link  │  │  Static Link  │  │
│  └────────┬─────────┘  └──────┬───────┘  └───────┬───────┘  │
│           │ JSON-RPC           │ Direct C++ API    │ C++ API  │
│           │ stdin/stdout       │                   │          │
│  ┌────────┴────────────────────┴───────────────────┴───────┐ │
│  │                  C++ Core Engine                         │ │
│  │  ┌─────────────────────────────────────────────────┐    │ │
│  │  │              Service Layer                       │    │ │
│  │  │  DocumentService │ SchemaService │ ValidationSvc │    │ │
│  │  │  FileService     │ HelperDataService             │    │ │
│  │  └──────────────┬──────────────────────────────────┘    │ │
│  │                  │                                       │ │
│  │  ┌───────────────┴──────────────────────────────────┐   │ │
│  │  │           Core Processing                         │   │ │
│  │  │  XML Document Model │ XSD Schema Parser          │   │ │
│  │  │  Content Model      │ Validation Engine          │   │ │
│  │  └──────────────────────────────────────────────────┘   │ │
│  │                                                          │ │
│  │  Dependencies: pugixml │ nlohmann_json │ <filesystem>   │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Layers

### 1. C++ Core Engine (`core/`)

Platform-independent shared library providing all XML/XSD processing logic.

**Public headers** (`core/include/xmlvisualeditor/`):
- `core/document.h` — XML document model and operations
- `core/schema.h` — XSD schema types and queries
- `services/service_container.h` — Service façade (DI container)
- `services/document_service.h` — Document lifecycle management
- `services/schema_service.h` — Schema loading and queries
- `services/validation_service.h` — XML validation
- `services/file_service.h` — File I/O abstraction
- `services/helper_data_service.h` — Cursor-context-aware panel data
- `services/grid_view_service.h` — Grid view tree/table data computation
- `json_rpc/server.h` — JSON-RPC 2.0 server (stdin/stdout)

**Key types** (namespace `xve`):
- `Document` — parsed XML document handle
- `Element` — XML element reference with navigation
- `SchemaInfo` — loaded schema with type/element definitions
- `ContentModelInfo` — compositor structure (sequence/choice/all) with nested elements
- `ContentModelState` — allowed children at a position
- `ElementsPanelData` — content model tree annotated with instance state for UI
- `AttributesPanelData` — attributes with is_set, current_value, enum_values for UI
- `NodeDetailsV2` — enriched element info with compositor context + instance state
- `Diagnostic` — validation error/warning with location
- `GridTreeNode` — hierarchical grid view node with table mode and flip state
- `GridTableData` — tabular representation of repeated child elements

### 2. JSON-RPC Server (`core/src/json_rpc/`)

The engine binary (`xve-engine`) runs as a subprocess, communicating via JSON-RPC 2.0
over stdin/stdout. Methods mirror the Service Layer API.

**Method categories:**
- **Document**: open, openFromString, close, getContent, update
- **Schema**: load, loadFromString, unload, getRootElements, getElementInfo,
  getAllowedChildren, getAllowedAttributes, getEnumerationValues
- **Validation**: validateWellFormedness, validateSchema
- **Helper** (V2): getElementsPanelData, getAttributesPanelData, getNodeDetails,
  insertElement, insertRequiredChildren — combines schema + document state for
  panel-ready data, schema-aware insertion, and recursive required subtree generation

- **Grid View**: getTreeData, getTableRegions, updateCell, insertRow, deleteRow,
  getNodeAtLine — structured grid data, edit operations, and focus sync

**Total: 27 JSON-RPC methods.**

### 3. VS Code Extension (`vscode-extension/`)

TypeScript extension spawning the engine binary and providing:
- Sidebar webview panels (Elements, Attributes, Info) with shared table renderer
- Panel auto-activation: panels auto-reveal on XML file open/switch via focus+refocus pattern
- Cursor tracking and context detection (client-side, 9 contexts A–I)
- Schema auto-detection and loading (local + HTTP download with recursive resolution)
- Insert Required mode (toggle, recursive children + attributes insertion)
- Schema-aware completion provider: element completions with choice/sequence headers,
  attribute name/value completions, text content enum completions, `resolveCompletionItem`
  with rich documentation popup (attributes, enums, compositor context)
- Activity Bar view container with XML Actions tree view (file, schema, validation status)
- Native toolbar buttons (Elements panel: Filter, Documentation, Type, Expand, Collapse, Insert Required)
- Multi-category settings (16 settings: General, Helper Panels, Validation)
- Gutter decorations (error/warning icons) with CodeActionProvider fix suggestions
- Font customization for panels and completion dropdown
- Schema tree viewer (planned)
- **Document Grid View** (XMLSpy-style) — Custom Editor for visual XML editing (toggle with Text View)
- Commands (validate, insert element, format, etc.)

**Cursor context classification stays client-side** in TypeScript — it is pure text
parsing (not schema-dependent) and avoids per-keystroke content transfer to engine.
Notepad++ will implement cursor context via Scintilla API.

#### 3.1 Document Grid View (`vscode-extension/src/grid-view/`)

A **Custom Editor** (`CustomTextEditorProvider`) that renders XML as a hierarchical
tree+table grid, toggling with the native text editor. The user switches between
Text View and Grid View — only one is visible at a time. Both views operate on the
same `TextDocument`, so edits in either view are immediately available when switching.

**Key design decisions:**
- **Custom Editor API** (toggle view) — user switches between Text and Grid View via a
  command; Custom Editor shares the underlying `TextDocument` for native undo/redo
- **Custom MVC renderer** — the XMLSpy-style tree+table hybrid is not well-served by
  MIT grid libraries (ag-grid Tree Data = Enterprise-only; Tabulator doesn't support
  dynamic tree↔table toggle); MVC architecture (model/view/controller) ensures
  maintainability
- **Grid edits translate to WorkspaceEdit** — all grid edits go through the C++ engine,
  which returns updated XML; the extension applies `WorkspaceEdit` to the `TextDocument`,
  reusing native undo/redo and validation triggers
- **Helper panels reuse same code paths** — grid node selection maps to the same cursor
  contexts (A-I) that drive Elements/Attributes/Info panels in Text View

**Capabilities:**
- Tree view: elements as collapsible nodes, attributes as leaf items
- Table mode: repeated elements rendered as table rows (auto-detected, user-toggleable)
- Flip rows/columns: transpose table orientation
- Cell editing: inline value editing with Enter/Escape
- Row/column selection and Excel-style copy/paste
- Expand/collapse with `+`/`-` keyboard shortcuts
- Focus preservation when switching between Text and Grid views
- Helper panels (Elements, Attributes, Info) work identically in both views
- Theme-aware styling using VS Code CSS variables
- Schema validation highlighting in grid cells

**Data flow:**
```
Toggle: Text View ←──→ Grid View (Custom Editor) — same TextDocument

Text Editor ──onDidChangeTextDocument──→ document.update ──→ C++ Engine
                                                                │
Grid View  ←──gridView.getTreeData────←────────────────────────┘
    │
    └──gridView.updateCell──→ C++ Engine ──→ returns XML ──→ WorkspaceEdit ──→ TextDocument
```

**New JSON-RPC methods** (`gridView.*` family):
- `gridView.getTreeData` — hierarchical node structure for full document
- `gridView.getTableRegions` — tabular data for repeated-element sections
- `gridView.updateCell` — apply cell edit, return updated XML for WorkspaceEdit
- `gridView.insertRow` / `deleteRow` — row operations
- `gridView.getNodeAtLine` — line-to-node mapping for focus sync

**New C++ service:** `GridViewService` in the service layer, computing tree/table
data structures from the document model with schema-aware table mode detection.

### 4. Notepad++ Plugin (`notepad-plus-plus/`)

Windows-only C++ DLL linking core as a static library:
- Plugin menu commands
- Dockable panels for schema/validation info
- Scintilla messaging for editor operations

### 5. CLI Tools (`cli/`)

Standalone command-line binaries:
- `xve-validate` — XML validation with diagnostics
- `xve-schema-info` — Schema structure display

## Build System

- **CMake 3.21+** with CMakePresets.json
- **vcpkg** manifest mode for dependencies
- **Targets**: xve-core (STATIC), xve-engine (EXE), xve-npp-plugin (DLL), xve-cli (EXE), xve-tests (EXE)

## Layer Rules

1. Core engine has **no platform-specific code** (no Win32, GTK, Qt, VS Code API)
2. VS Code extension communicates with engine **only via JSON-RPC**
3. Notepad++ plugin may use Win32 API; links core statically
4. All data crossing layer boundaries is **JSON-serializable**
5. Services accessed through **ServiceContainer** (singleton)

