# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- **Public-CI Windows build failure**: Two C++ Catch2 tests (`GridViewService hybrid table candidacy - fixture integration` and `GridViewService hybrid candidacy on multi-section fixture file`) now skip gracefully with a `WARN` message when their XML fixture files are not reachable, mirroring the pre-existing pattern in `test_grid_view_perf.cpp`. On local / private-CI environments (where fixtures under `resources/sample_files/` are present) the tests still run the full assertion set (240 assertions). Introduces a shared `core/tests/unit/test_fixture_helpers.h` header exposing `xve::test::FindFixture` and `xve::test::ReadFileToString`. No runtime or user-facing behaviour change.

### Changed
- Roadmap: inserted Sub-Phase 5b.3c (Annotation Cleanup & Standards Codification) before Sub-Phase 5b.4, to remove process-historical comment tokens from `core/` and `vscode-extension/src/` on a clean baseline prior to bidirectional-sync work. No user-facing behaviour change.
- **Annotation cleanup**: stripped process-historical comment tokens (round/decision/section refs) from production source under `core/` and `vscode-extension/src/` (including all Mocha test files under `vscode-extension/src/test/grid-view/`). Comment-only and test-display-string refactor — no behavioural change. Full Catch2 suite (159/159) and Mocha suite (548/548) remain green. New `scripts/check-annotations.ps1` lint gate is wired into `scripts/quality_check.ps1` to prevent regressions; the gate's detection regex matches `Round N`, `Phase N`, `Z\d`, `Q\d`, `B.\d`, `C\d.`, `§\d`, and `Iteration N` tokens.

### Fixed
- **Public CI fixture-loading tests** were failing on `windows-latest` because `core/tests/unit/test_grid_view_b1_fixture.cpp` and the "fixture integration" test case in `core/tests/unit/test_grid_view_hybrid_candidacy.cpp` hard-required a fixture file under `resources/` (which is excluded from the public repo via `.publicignore`). Both tests now use a new shared helper `core/tests/unit/test_fixture_helpers.h` that walks parent directories looking for the fixture and `WARN()`-skips the test when it is absent, mirroring the pattern already used by `test_grid_view_perf.cpp`. Behaviour on the private repo is unchanged: 159/159 tests still pass with full assertion coverage.

## [0.6.0] - 2026-04-21

### Highlights
- **Grid View (read-only) released**: A XMLSpy-style hierarchical grid rendering of any XML document, launched from the `XML: Toggle Grid View` command or the XML Actions toolbar. The grid auto-detects repeated-sibling groups and renders them as tables (including "hybrid" tables whose columns mix scalar values with sub-elements), supports rows/columns orientation flip, per-section tree/table mode toggling, column-scoped chevron drill-down for nested structures at any depth, multi-row and multi-column selection with keyboard and mouse, batch expand/collapse, tree indent guides, visible grid lines, and full state preservation across tab switches. **This release ships read-only**; inline editing, bidirectional text↔grid sync, and schema-aware grid operations are planned for the next phase.

### Added
- **Grid View column-scoped chevron drill-down**: Chevron cells inside a hybrid table now drill down in place within their own column rather than opening a full-width block below the row. Each expanded chevron host renders a column-bounded sub-grid (`.g-drill-box`) that reuses the main renderer for its contents, so nested tables, labels, attributes, toggle icons, column-paint highlighting, and further drill-down all work uniformly at any nesting depth. Multiple hosts in the same row can be expanded simultaneously; outer-row non-host cells extend vertically to span the tallest drill-down in the row. Grid View state (expansions, drill-down openings, selection, table-mode/flip toggles) is now fully preserved when switching away from the Grid View tab and back. Chevron glyphs across the grid (tree rows, element labels, table cells, segment headers) now render at a single consistent small size.
- **Grid View orientation flip — hybrid tables** (Phase 5b.3b, Round B.1): Repeated-sibling groups whose members share the same attribute and element-child structure now render as a hybrid table even when some columns contain sub-elements; chevron-bearing columns drill down in place. Per-section toggle icons let the user switch a section between tree mode and table mode, and flip table rows ↔ columns when in table mode. The table-mode-ON icon sits in the header-row gutter, the flip icon in the top-left corner cell, and the table-mode-OFF icon appears on selected hybrid-capable sections. Initial grid state is now fully collapsed on open.
- **Grid View column multi-select** (Phase 5b.3b, Round B.1): Column headers are selectable alongside rows (plain click / Ctrl+Click / Shift+Click), with Shift+Left/Shift+Right range extension and Escape to clear. Row and column selection are mutually exclusive on the same node. Selection survives orientation flips — rows selected before a flip render as column-highlighted cells afterwards, and vice versa.
- **Grid View multi-row selection and batch expand/collapse** (Phase 5b.3b, Round B.6): The Grid View supports multi-row selection with anchor + active-cursor semantics. Mouse: plain click replaces, Ctrl+Click toggles, Shift+Click extends. Keyboard: Shift+Arrow/Home/End extends, Escape collapses to the cursor, Ctrl+A selects all visible rows. `+` and `-` now operate on every selected row at once in a single re-render, with direction-guard so `+` only expands and `-` only collapses. Pressing `+` drills the selection one level deeper: newly revealed child rows (attributes, `#group` labels, table-row bodies, comments, text values) join the selection, so repeated `+` opens the whole subtree. `-` collapses innermost first, so ancestors stay open until their selected descendants have closed. `+` on a row inside a table region expands every chevron-bearing cell in that row. Selection survives document updates via id reconciliation; cursor fallback prefers the first surviving id in document order. Live-edit reconcile is debounced to 150 ms and expansion state survives tree rebuilds on tab switch or edit.

- **Grid View scaffold** (Phase 5b.1): CustomTextEditorProvider-based Grid View with toggle command, C++ `GridViewService` + `gridView.getTreeData` JSON-RPC method, MVC tree renderer with element/attribute icons, VS Code theme integration
- **Grid View table mode** (Phase 5b.2): Auto-detection of repeated child elements rendered as HTML tables, element numbering (`<1>`, `<2>`), parent count annotations (`(N)`), distinct header/row-ID styling
- **Grid View expand/collapse & navigation** (Phase 5b.3): Click-to-toggle chevrons, +/- keyboard shortcuts, arrow key tree navigation (Up/Down/Left/Right), Tab/Shift+Tab cycling, node selection with visual highlight, shared column boundaries for sibling name-value grids
- **Grid View global grid system** (Phase 5b.3b): Single root-level CSS Grid with shared column tracks (`repeat(N, max-content) 1fr`); `display: contents` flat row rendering so all rows — tree, attribute, table header, table data — place their cells into the SAME global grid lines; table candidacy refined to keep every element reachable via its own chevron (Issue F fix)
- **Grid View visible global grid lines** (Phase 5b.3b, Round A): 1px vertical + horizontal grid lines on every column/row boundary, drawn via `column-gap: 1px` / `row-gap: 1px` on `.grid-root` with a border-coloured root background showing through the gaps; per-column `.g-indent` cells with `min-width: var(--indent)` realise the lines at exact `max-content` boundaries and give sibling chevrons visibly distinct X positions per XML depth
- **Grid View mixed-content handling** (Phase 5b.3b, Round A): Elements with attributes and a text value (e.g. `<intData allowAdjust="false" maxVal="500" minVal="3">96</intData>`) render the text as a separate `r-text` child row with an `Abc` icon when expanded, and an XMLSpy-style inline summary in the value cell when collapsed
- **Grid View attribute-only collapsibility** (Phase 5b.3b, Round A): Elements with attributes but no children (e.g. `<foo bar="x"/>`) gain a chevron; attributes are only emitted when the element is expanded; collapsed state shows a `bar="x"` summary in the value cell
- **Grid View text-only repeated-group column** (Phase 5b.3b, Round A): Repeated sibling elements that carry text values but no attributes/children (e.g. 9× `<plotGroupId>...</plotGroupId>`) now synthesise a `(value)` column so each text node is visible instead of rendering empty rows
- **Grid View perf diagnostics** (Phase 5b.3b, Round A): New `XML Grid View` output channel logs `fetch/model/render/htmlSize` timings per refresh, reachable via `View → Output` without opening DevTools
- **Grid View editable vs structural cells** (Phase 5b.3b, Round B.3): New `g-editable` class marks attribute values, element text values, and table data cells; structural cells (indent, name, row-id, headers, `(N)` summaries) now use a shaded background so the user can tell editable data from read-only scaffolding at a glance
- **Grid View XML comments** (Phase 5b.3b, Round B.2): Comment nodes now survive the C++ engine tree walk and render as dedicated `r-comment` rows with a `<!--` icon and italic description-coloured text; comments are skipped by keyboard navigation; comments inside a table-candidate parent split the run into two table regions (`foo (3)` → comment → `foo (2)`) matching XMLSpy ordering, and comments inside a single table row (e.g. above `<x>`/`<y>`) render as a standalone comment row above the row data instead of occupying a data column
- **Grid View pre/post-root comments** (Phase 5b.3b, Round B.2): Comments that appear at document scope (outside the root element) are now emitted by the engine as `preRootComments` / `postRootComments` and rendered above/below the root row (e.g. `<!--FEWS Donau-->` above `<Parameters>`)
- **Grid View tree guides** (Phase 5b.3b, Round B.3): Continuous 1px vertical indent guides rendered via `background: linear-gradient` on `.g-indent` cells (`row-gap: 0` + per-cell `border-bottom` preserves horizontal separators); uses `--vscode-tree-indentGuidesStroke` to match the Explorer panel
- **Grid View styled indent-guide bar** (Phase 5b.3b, Round B.5): Indent guide widened to 2px and fallback colour opacity raised from 0.4 to 0.75, so ancestor indent columns read as a visible styled bar (matching VS Code's Explorer reference) rather than a faint 1px hairline; still `--vscode-tree-indentGuidesStroke`-driven and still preserved across selection/hover

### Changed
- **Grid View perf — `gridView.getTreeData`** (Phase 5b.3b, Round B.4): C++ engine now serialises the tree directly to a JSON string via a purpose-built writer instead of constructing an intermediate `nlohmann::json` DOM, and computes each node's `node_id` inline during the recursive build (eliminating per-node `Element::GetPath` walks). On SpatialDisplay.xml (~20k lines, 17,971 nodes, 6.65 MB response) Debug engine total drops from ~3750 ms to ~269 ms — a 14× speedup. End-to-end extension fetch on the same file: cold (first open, includes engine spawn + first pugixml parse) ~1.68 s; warm (engine reused, document already parsed) ~0.58 s — down from ~9.9 s before. Wire output is byte-identical to the previous implementation (keys emitted in alphabetical order to match `nlohmann::json`'s default `std::map` dump order, verified by reference equality test). Env-gated `XVE_GRID_PROFILE` timing instrumentation retained (zero cost when unset) for future perf triage.

### Refactor
- **File-size cleanup** (Phase 5b.3b, Round B): Ten pre-existing source files exceeding the 500-line ceiling split into behaviour-named siblings across C++ (`schema_parser_types.cpp`, several `test_schema_*` and `test_grid_view_*` test files) and TypeScript (`xml-cursor-parser.ts`, `extension.ts`, `elements-focus.test.ts`, `completion-provider.test.ts`, and grid-renderer test files). Zero behavioural changes; all tests continue to pass. All resulting files are under 500 lines.
- **Test names describe behaviour** (Phase 5b.3b): ~65 `TEST_CASE` / `SECTION` / `describe` / `it` / `test` display-name strings across ~20 C++ and TypeScript test files renamed from bug / round / phase codes to behaviour-descriptive labels. Catch2 tag identifiers and in-file comments referencing original issue labels are preserved for traceability. Zero production-code changes; zero test-count delta.

### Fixed
- **Grid View OFF-icon alignment + run-member indent** (Phase 5b.3b, Round 6/7): The tree-ladder table-mode-OFF icon (⊞) now sits in the same narrow gutter column that holds the table-mode-ON icon (⊟) when the run is flipped — previously it landed one track too far left, under the parent section's indent guides. In the same change, attributes and child elements of a run member (e.g. `id`, `kind`, `name`, `value`, `meta` under an `<item>` in a tree-ladder run) are now clearly indented one step to the right of their parent row, so the parent/child hierarchy is visually obvious again.
- **Grid View hybrid-table candidacy accepts union-shape runs** (Phase 5b.3b, Round 7): Repeated-sibling element runs now qualify as hybrid tables even when members have different attribute sets or different child-element sets. The table's column set is the union of attribute names and element-child names across the run, ordered by first appearance. Members that lack a given attribute or child render an empty cell in that column. Runs of one, single-child parents, and runs split by comments still do not qualify. This lets sections like differing-attribute lists and extra-child-element lists render as tables by default instead of falling back to tree-ladder mode.
- **Grid View table-mode-OFF icon always-on for tree-ladder runs** (Phase 5b.3b, Round 6): The ⊞ icon that flips a tree-ladder section back to a table is now always visible on every table-candidate run rendered as a tree ladder, and sits on the top element row of the run at that element's own indent depth — previously it was gated on selection and could land on an attribute row under the first run member. Non-candidate sections (single child, differing-shape siblings, runs split by comments) still never emit the icon, and a collapsed parent paints no icon. Clicking ⊞ still flips the entire run to a table.
- **Grid View stuck on "loading..."** (Phase 5b.3b, Round 5): A regression in the webview selection-handling script left the grid showing a permanent loading state after toggling into Grid View. Fixed and covered by a new syntax smoke test that parses the emitted webview script at CI time to prevent recurrence.
- **Grid View table-mode-OFF icon missing on hybrid-only sections** (Phase 5b.3b, Round 5): The icon used to switch a hybrid-capable section from tree mode back to table mode never appeared on sections whose children mix scalar values with sub-elements. Dispatch now treats scalar-only and hybrid-capable sections uniformly for UI purposes.
- **Grid View table-region labels selectable** (Phase 5b.3b, Round B.6): Table-region group labels (e.g. `timeSeriesSet (39)`) are no longer dropped by selection reconcile after a document update.
- **Grid View comment rows selectable** (Phase 5b.3b, Round B.6): Comment rows now respond to plain click and render with the theme's selection background when selected; they remain inert to arrow-key navigation but are included in Shift+Click / Shift+Arrow ranges.
- **Grid View row selection** (Phase 5b.3b, Round B.3): Selection highlight now correctly paints the actual row cells (name, value, table data, row-id) instead of the leading `.g-indent` columns; explicit per-cell-class selectors beat the `g-editable`/`t-rowid` backgrounds, and selected-row indent cells stay structural-gray
- **Grid View scrollbars** (Phase 5b.3b, Round B.3): Horizontal scrollbar now appears when a wide table region (e.g. `timeSeriesSet` in ImportEVN.xml) exceeds viewport width; `#grid-container` is viewport-anchored with `overflow: auto` so both axes scroll inside the grid
- **Grid View chevrons**: Replaced codicon font dependency with Unicode ▶/▼ characters (codicons not available in webview)
- **Grid View table group navigation**: Table region labels (e.g., `timeSeriesSet (39)`) now selectable and navigable via keyboard
- **Grid View attribute-only elements**: Elements with attributes but no text value (e.g., `<timeStep unit="..."/ >`) now display attribute values in table cells
- **Grid View table regions collapsed by default**: Table-mode groups (e.g., timeSeriesSet, externUnit) now start collapsed with ▶ chevron, matching non-table nodes
- **Grid View table-region keyboard nav**: Table-region-labels use unique `#group` suffixed node IDs preventing selection conflict with first table row; ArrowDown from header enters table
- **Grid View expandable attribute-only cells**: Attribute-only elements in table cells now render with ▶/▼ chevron; collapsed shows inline summary, expanded shows name-value sub-grid
- **Grid View chevron indent** (Phase 5b.3b, Round A): Name-cell `padding-left` bumped to 16px and `.expand-toggle` `margin-right` to 4px so the chevron sits visibly inside the name cell with a clear gap to the left grid boundary
- **Grid View indent hierarchy** (Phase 5b.3b, Round A): `.g-indent` cells receive `min-width: var(--indent)` so empty indent columns no longer collapse to 0 width under `max-content`; parent/child chevrons now sit ~20px apart per depth level

### Fixed
- **Grid View toggle**: Toggle command now closes the text editor before opening Grid View in the same tab position (was opening a separate tab)
- **Grid View rendering**: Webview now renders HTML tree via GridModel/GridRenderer (was displaying raw JSON data)
- **Grid View loading**: Added `onDidChangeViewState` handler and `retainContextWhenHidden` to prevent "Grid View loading..." stuck state when switching between tabs
- **Grid View column ordering** (Phase 5b.2): Table columns sorted by document order across all rows
- **Grid View name-value grid** (Phase 5b.2): Attributes and leaf children in two-column grid with visible borders
- **Grid View nesting** (Phase 5b.2): L-bracket borders (left + bottom) for clear parent-child hierarchy
- **Grid View restart** (Phase 5b.2): Grid view sends `document.update` before `getTreeData` on restart
- **Grid View headers** (Phase 5b.2): Complex children as standalone headers, leaf children as grid rows; table-region-label aligned with tree-node headers

### Fixed
- **Version consistency**: Aligned project version to `0.5.0` across `CMakeLists.txt`, `vcpkg.json`, and version test
- **CI**: Temporarily disabled macOS and Ubuntu builds (Windows-only until platform builds are fixed)

## [0.5.0] - 2026-04-10

### Added — Phase 5a: Open-Source Dual-Repo Setup
- **Dual-repo architecture**: Private working repo + public open-source mirror (`IvoMil/xml-visual-editor`) with filtered sync
- **Public repo scaffolding**: Issue templates (bug report, feature request), PR template, CODE_OF_CONDUCT.md
- **`CONTRIBUTING.md`**: Contributor guidelines with build instructions, coding standards, and architecture overview

### Changed
- **`vscode-extension/README.md`**: Updated 8 screenshot URLs from `xml-visual-editor-assets` repo to `xml-visual-editor` public repo path
- **`README.md`**: Removed links to private-only docs (PROJECT_PLAN.md, SKILLS.md), fixed clone URL from SSH alias to HTTPS, added CONTRIBUTING.md link, updated project structure

## [0.5.0] - 2026-03-27

### Added — Phase 4h: Marketplace Publishing Preparation
- **Extension icon**: 128×128 PNG icon for VS Code Marketplace (moved to `vscode-extension/resources/icons/icon.png`)
- **Marketplace README**: Separate feature-focused README for the marketplace listing (`vscode-extension/README.md`) with feature overview, screenshot placeholders, settings table, requirements, and known limitations
- **Package.json marketplace metadata**: Publisher `IvoSoft`, version `0.4.0`, preview flag, keywords (xml, xsd, schema, validation, editor, formatting, xpath, intellisense), gallery banner, updated categories and description
- **Multi-platform VSIX packaging**: PowerShell script (`scripts/package-vsix.ps1`) and bash script (`scripts/package-vsix.sh`) for building platform-specific VSIX packages (win32-x64, linux-x64, darwin-x64, darwin-arm64)
- **Release build**: C++ engine built in Release mode (~580 KB), bundled at `vscode-extension/bin/xve-engine.exe`
- **Updated .vscodeignore**: Proper exclusions for VSIX packaging (excludes TS sources, maps, tests; includes bin/, resources/, compiled JS)
- **Updated .gitignore**: Added `vscode-extension/bin/` (build artifact, not committed)

### Fixed
- **Prettier formatting**: Fixed 15 pre-existing formatting issues across TypeScript source files
- **Settings gear publisher ID**: Changed `@ext:IvoMil.xml-visual-editor` to `@ext:IvoSoft.xml-visual-editor` in the openSettings command handler

### Changed
- **README screenshots**: All 8 image references active (7 PNG screenshots + 1 GIF animation in `vscode-extension/resources/screenshots/`)
- **Default settings**: `validateOnType` default changed to `false`; `insertRequiredActive` default changed to `true`
- **Marketplace README**: Removed features schema-requirement table for cleaner layout

## [0.4.14] - 2026-03-27

### Fixed — Insert Element Issues (Comments, Enums, Path Resolution)
- **Comment handling in completion/insertion (TS)**: `buildIndexedPath` and `computeElementIndex` now strip XML comments before parsing, preventing incorrect element paths/indices when comments contain XML-like tags (e.g., `<!-- <someTag>old</someTag> -->`). New `stripXmlComments` utility in `xml-cursor-helpers.ts`.
- **Name-ambiguous element type resolution (C++)**: `InsertRequiredChildren` and `InsertElement` now use path-based type resolution via `ResolveElementTypeByPath` → `GetContentModelByType`/`GetAllowedAttributesByType`. Fixes incorrect default values (e.g., "a" instead of "instantaneous" for `parameterType`) when the same element name maps to different types in different schema contexts.
- **Elements panel enum display (TS)**: `getEnumValuesHtml` now uses `helper.getNodeDetails` (path-based resolution) instead of `schema.getElementInfo` (name-only). Fixes enum radio buttons not appearing for name-ambiguous elements like `parameterType`.
- **Text-content completions enum lookup (TS)**: `getTextContentCompletions` now uses `helper.getNodeDetails` for path-based enum resolution, same fix as elements panel.
- **Diagnostic logging (C++)**: Added `[XVE-DEBUG]` stderr logging to `InsertElement` and `InsertRequiredChildren` for diagnosing completion dropdown insert failures (Bug A — resolved, logging removed).
- **7 new TS regression tests**: 5 `stripXmlComments` unit tests + 2 completion context/provider regression tests for comment handling. Total: 122 TS tests, 151 C++ tests.

### Fixed — Round 2: Panel Insert + Cursor Positioning with Comments
- **Elements Panel insert with comments (TS)**: `callInsertRequiredChildren` and `handleInsertRequiredFallback` in `insert-required-operations.ts` now strip XML comments before counting element tags, preventing wrong indexed paths when comments contain XML-like tags.
- **Cursor placement inside comment after insert (TS)**: `repositionCursorToElement` in `cursor-reposition.ts` now skips tag matches that fall inside XML comments (`<!-- ... -->`), preventing cursor from landing inside a comment instead of at the newly inserted element.

## [0.4.13] - 2026-03-26

### Changed — TypeScript File Size Refactoring
- **xml-completion-provider.ts (737→429)**: Extracted `completion-helpers.ts` (263 lines — `stripPathIndex`, `flattenContentModel`, `collectElementNames`, `buildHeaderItem`, range detection helpers) and `completion-resolve.ts` (58 lines — `resolveCompletionItemData`).
- **elements-panel.ts (704→422)**: Extracted `elements-cursor-utils.ts` (297 lines — `markCursorPosition`, `markCursorPositionInBranch`, `markSubtreeBeforeCursor`, `nodeContainsElement`, `computeFocusedChild`, `extractSimpleTextContent`). Barrel re-exports preserve existing import paths.
- **editor-operations.ts (622→410)**: Extracted `insert-required-operations.ts` (263 lines — `handleInsertRequiredFallback`, `callInsertRequiredChildren`). Private methods delegate to standalone functions.
- **xml-commands.ts (579→385)**: Extracted `formatting-commands.ts` (208 lines — `prettyPrint`, `linearize`, `stripWhitespace`, `expandSelfClosingTag`, `getIndentString`). Uses `import type` for `XmlCommandDeps`.
- All 4 original files now under 500-line limit per CODING_STANDARDS.md.
- Zero behavior changes. All 115 TypeScript tests passing. ESLint and Prettier clean.

## [0.4.12] - 2026-03-25

### Fixed — Phase 4i Round 3: Validation, Panel Expansion & Insertion Bugs
- **Auto-close tag interference via completion dropdown (TS)**: Extended the suppress/unsuppress mechanism to `element-insertion-commands.ts` — the completion dropdown path (`completionInsertElement`, `completionInsertRequired`) now also suppresses auto-close during `workspace.applyEdit()` calls, preventing duplicate close tags when inserting elements from the completion dropdown with auto-close enabled.
- **Validation false positive for choice-with-sequences (C++)**: Fixed choice satisfaction check in `schema_validator_content.cpp` — when a choice member is a sequence-group representative, the validator now checks ALL elements in that sequence (not just the first/representative). This prevents false "Missing required choice" errors when the first element of a choice-sequence is optional but other required elements are present (e.g., `showArrowsOnLines` optional + `timeSeriesSet` required in SpatialDisplay.xsd).
- **Elements Panel collapses nested choices at cursor positions (C++)**: Fixed `ApplyChoiceExclusion()` in `helper_data_service_tree.h` — now propagates `active_branch` to sequence child nodes when they represent the active branch of a choice. This ensures the webview's `shouldExpand` logic keeps active sequence branches expanded during panel re-renders on cursor movement.
- **Auto-close tag interference during element insertion (TS)**: Fixed malformed XML produced when "Insert + required" mode inserts elements while auto-close tags is enabled. Added suppress/unsuppress mechanism to `TagAutoCloseService` — `EditorOperations` suppresses auto-close before programmatic `workspace.applyEdit()` calls and re-enables it after. Prevents duplicate close tags from being inserted by the auto-close handler during document replacement.
- **Attributes Panel hover documentation (TS)**: Restored `title` attribute on attribute table rows so hovering any cell shows the attribute documentation as a tooltip, independent of the Doc column toggle.
- **Attributes Panel documentation indicator icon (TS)**: Added a small blue circle "i" icon next to attribute names that have documentation, displayed in its own narrow column between Name and Value. Provides a visual cue that hovering will show a tooltip.
- **C++ regression tests**: 3 new Catch2 test cases — choice sequence with optional first element (4 sections, 13 assertions), sequence node active_branch propagation (5 sections, 34 assertions), alternate branch active_branch verification (2 sections, 12 assertions). Total: 151 C++ test cases, 1627 assertions.

## [0.4.11] - 2026-03-25

### Added — Phase 4i: Compositor-Level Insertion
- **Elements Panel compositor Insert buttons (TS)**: Sequence, choice, and all compositor rows now show an "Insert" button when the compositor is insertable (`can_insert && !is_exhausted`). Clicking inserts the first concrete child element of the compositor group. Combined with "Insert + required" mode, this recursively inserts all required children of the sequence/choice.
- **Completion Dropdown compositor-level insert (TS)**: Sequence and choice header items in the completion dropdown now trigger element insertion when selected (Enter key). Resolves the first insertable element name from the compositor's children and invokes `completionInsertElement` command.
- **`getFirstInsertableElement()` utility (TS)**: New exported function in `schema-table-renderer.ts` that recursively walks compositor children to find the first non-wildcard element name. Used by both Elements Panel and Completion Provider.
- **Cardinality badges on compositor nodes (TS)**: Compositor rows (sequence/choice/all) in the Elements Panel now always display a cardinality chip. Required compositors show `1..1 (required)`, optional show `0..1 (0 left)`, etc. Previously only shown for non-default cardinality.
- **Regression tests**: 13 new Mocha tests — 10 for `getFirstInsertableElement` and compositor insert buttons (schema-table-renderer), 3 for compositor header completion commands (completion-provider).

### Fixed — Nested Choice Groups, Validation & Insertion
- **BuildContentModelTree nested choice flattening (C++)**: Fixed both `model_type=="choice"` and `model_type=="sequence"` code paths in `BuildContentModelTree()` — when a sequence sub-node within a choice contains inner `<choice>` elements (e.g., xCellSize/columnWidth and yCellSize/rowHeight inside CellSizeGroup), they were displayed as flat siblings instead of nested choice groups. Round 2 fix: the sequence/all path had `elem_to_cg` contamination from seq_group_rep expansion; replaced with a clean `local_cg` map built solely from `choice_groups`.
- **InsertRequiredChildren nested choice handling (C++)**: Fixed `InsertRequiredChildren` in `helper_data_service_insert.cpp` — when inserting required children of a parent sequence, nested choice groups within sub-sequences were skipped because the same `elem_to_cg` contamination mapped all elements to the parent CG. Added `do_nested_choices` lambda that correctly detects nested CGs and inserts the first alternative of each unsatisfied required nested choice. Both satisfied (active branch) and unsatisfied (fresh) paths now handled.
- **Validation: missing required choice group satisfaction (C++)**: `ValidateChildren()` in `schema_validator.cpp` now checks that each required (minOccurs > 0) choice group has at least one member present. Previously, elements in choice groups had their individual minOccurs check skipped (correct), but no check ensured the overall choice was satisfied. Nested choices within inactive sequence branches are correctly skipped.
- **TS completionInsertElement parameter (TS)**: Fixed missing `compositorInsert?: boolean` 5th parameter in `completionInsertElement` command registration, enabling proper compositor-level insertion from completion dropdown.
- **C++ regression tests**: 2 tree builder tests (sequence path + choice path nested choice verification), 5 validation tests (22 assertions) covering choice group satisfaction for empty, valid, and partially-missing cases.
- **File size refactoring**: Split `helper_data_service.cpp` (842→449 lines) into tree-building helpers (`helper_data_service_tree.h/cpp`), insertion logic into `helper_data_service_insert.cpp` (454 lines) + `helper_data_service_insert_element.cpp` (174 lines), and `schema_validator.cpp` (514→172 lines) into content validation (`schema_validator_content.cpp`) and value validation (`schema_validator_value.cpp`).

## [0.4.10] - 2026-03-25

### Fixed — Panel Bug Fixes (Issues from Phase 4h Verification)
- **Choice group flattening for group-ref with sequence-with-nested-choices (C++)**: Fixed `ProcessChoiceChildren()` in `schema_parser_compositor.cpp` — when a `<group ref>` resolves to a sequence containing nested `<choice>` elements (e.g., `GridFirstCellCenterAndCellSize` in `grids.xsd`), the nested choice elements were incorrectly flattened into top-level choice options. Now correctly treated as a sequence branch, preserving the nested structure. Root cause: growth of `choice_groups` from inner choices was misinterpreted as the group-ref itself being a choice.
- **Attributes panel highlight text contrast (TS)**: Added CSS override for `.focused-attr .attr-type` and `.focused-attr .attr-doc` to use `--vscode-list-activeSelectionForeground` color, making Doc/Type column text readable when a row is highlighted.
- **Completion dropdown: active sequence branch incorrectly hidden (TS)**: Fixed `flattenContentModel()` in completion provider — when a choice's active branch is a sequence (not a direct element), the branch was incorrectly treated as inactive because sequence nodes don't have a `name` matching `active_branch`. Also stopped propagating `parentActiveBranch` into active sequence children. Now all elements in the active sequence branch are shown in the dropdown.
- **C++ regression test**: 1 new Catch2 test case (group-ref sequence with nested choices) — verifies correct `choice_groups`, `sequence_groups`, and `choice_path` structure.
- **TS regression tests**: 1 new Mocha test verifying attributes panel CSS contrast rules, 1 new Mocha test verifying `flattenContentModel` correctly identifies active sequence branches.

## [0.4.9] - 2026-03-25

### Added — Phase 4h: Schema Gap Remediation (G4, G2, G5, G1)
- **G4: minExclusive/maxExclusive facet parsing (C++)**: `Restrictions` struct now includes `min_exclusive` and `max_exclusive` optional fields. Schema parser reads `<minExclusive>` and `<maxExclusive>` facets from XSD `<restriction>` elements.
- **G2: appinfo extraction (C++)**: New `ExtractAppinfo()` method captures `<appinfo>` text from `<annotation>` elements. Stored as separate `appinfo` field on `ElementInfo` and `TypeInfo` (not merged with documentation). Extracted in `ProcessElement`, `ProcessComplexType`, and `ProcessSimpleType`.
- **G5: Facets exposed via JSON-RPC + Info Panel**: `NodeDetails` struct now includes `restrictions` (all 7 facet types: minInclusive, maxInclusive, minExclusive, maxExclusive, minLength, maxLength, pattern) and `appinfo`. `helper.getNodeDetails` JSON-RPC response serializes non-empty restriction objects. Info Panel (TypeScript) displays "Value Constraints" section with all restriction facets and "App Info" section below documentation.
- **G1: anyAttribute parsing (C++)**: `AttributeInfo` extended with `is_wildcard`, `namespace_constraint`, and `process_contents` fields. `ExtractAttributes()` detects `<anyAttribute>` elements and creates synthetic `AttributeInfo` entries (name=`*`, is_wildcard=true). Plumbed through `HelperDataService` to `AttributeInstanceInfo` and serialized in JSON-RPC attributes panel responses.
- **C++ regression tests**: 4 new Catch2 test cases (15 sections, 85 assertions) covering exclusive facets, appinfo extraction, NodeDetails restrictions, and anyAttribute parsing.
- **Test XML/XSD files**: `resources/sample_files/gap_remediation_test.xsd` and `.xml` — self-contained schema+instance exercising all 4 remediated gaps.

### Fixed
- **Pre-existing Prettier formatting**: Fixed formatting issues across 28 TypeScript source files.

### Deferred
- **G3: Identity constraints (key/unique/keyref)**: Deferred to Phase 5 backlog (PROJECT_PLAN.md item #11). Validation-only concern with no editing UX impact.

## [0.4.8] - 2026-03-25

### Added — Phase 4h: Delft-FEWS Schema Gap Analysis
- **Comprehensive XSD schema inventory**: Analyzed 272 Delft-FEWS XSD files (3.66 MB) across 7 subdirectories with exact construct frequency counts for 54 XSD constructs.
- **Deep pattern analysis**: Documented compositor nesting patterns (choice-in-sequence, sequence-in-choice, nested choices), type extension chains, abstract type usage, group composition patterns, union type patterns, wildcard usage, and xs:all usage with concrete examples.
- **C++ implementation capability audit**: Mapped every Delft-FEWS XSD construct to its C++ implementation status across schema_parser, SchemaService, HelperDataService, and JSON-RPC layers.
- **Prioritized gap report**: Identified 5 gaps (G1-G5), all Low to Medium severity. No critical gaps — engine handles 95%+ of constructs. Key gaps: facets not exposed via JSON-RPC (G5/Medium), minExclusive/maxExclusive not parsed (G4/Low), anyAttribute not parsed (G1/Low), identity constraints not parsed (G3/Low), appinfo not extracted (G2/Low).
- **Intermediate analysis reports**: 4 detailed reports in `docs/schema_analysis/` for traceability (01_inventory_and_frequencies.md, 02_deep_pattern_analysis.md, 03_cpp_implementation_audit.md, 04_gap_report.md).
- **New specialist agents**: `xsd-schema-analyst.agent.md` (read-only XSD analysis) and `gap-analyst.agent.md` (gap analysis with pugixml context).
- **New XSD analysis skill**: `.github/skills/xsd-analysis/SKILL.md` with comprehensive W3C XSD 1.0 construct checklist.

## [0.4.7] - 2026-03-24

### Added — Phase 4g: Schema Wildcard (xs:any) Enrichment
- **xs:any metadata capture (C++)**: `ElementInfo` now stores `is_wildcard`, `namespace_constraint` (e.g., `##other`), and `process_contents` (e.g., `lax`, `strict`, `skip`) for xs:any wildcard elements. `ContentModelNode` propagates `is_wildcard` and `namespace_constraint` to the UI layer.
- **xs:any documentation extraction (C++)**: Annotations on `<xs:any>` elements are now extracted via `ExtractDocumentation()`, matching how named elements are documented.
- **Choice group documentation (C++)**: `ContentModelInfo` now stores `choice_groups_documentation` parallel to `choice_groups`, capturing annotations on choice group containers.
- **Wildcard JSON-RPC serialization (C++)**: `ContentModelNodeToJson` now includes `is_wildcard` (always) and `namespace_constraint` (when non-empty) in helper panel responses.
- **Elements panel wildcard rendering (TS)**: xs:any wildcards shown as info-only rows with ⊘ icon, `(any)` display name, namespace constraint badge, documentation, and cardinality — but no Insert button (`can_insert = false`).
- **Completion provider wildcard filter (TS)**: Wildcard elements are excluded from IntelliSense completions (no confusing `*` entries in dropdown).
- **Info panel namespace/processContents (TS)**: When viewing a wildcard element, the Info panel General grid now displays Namespace and Process Contents fields.
- **C++ regression tests**: 4 new Catch2 test cases (53 assertions) covering xs:any metadata, choice group wildcards, default namespace handling, and raw schema parser metadata.
- **TS unit tests**: 6 new Mocha tests for wildcard rendering (icon, badge, no insert, documentation, cardinality, negative test).

### Fixed — Round 9: Auto-close corruption + space-before-self-close
- **Auto-close deletion detection removed**: Removed the "second pass" deletion detection from `TagAutoCloseService` that caused data corruption. When a user deleted a space before `>` in `<tag attr="val" >`, the deletion detection fired and inserted a spurious `</tag>`, turning child elements into siblings. This was the root cause of the pretty-print corruption bug.
- **RemoveSpaceBeforeSelfClose removed (C++)**: Removed the post-processing function that stripped the space pugixml adds before `/>` in self-closing tags. pugixml's default serialization `<tag attr="val" />` is now preserved.
- **Strip whitespace no longer removes space before `/>` (TS)**: The `stripWhitespace` command no longer applies the `/ +\/>/g` regex to collapse spaces before `/>` in self-closing tags.

### Added — Round 8: Attributes Panel Type/Doc Columns & Font Fixes
- **Toggleable Type and Documentation columns**: Attributes panel now has Type and Documentation columns that can be toggled on/off via toolbar icons ($(symbol-class) / $(circle-slash) for Type, $(open-preview) / $(eye-closed) for Documentation), matching the existing Elements panel toggle pattern.
- **Column reorder**: Attributes table columns reordered from `Name | Type | Value` to `Name | Value | Type | Doc` to prioritize editing flow.
- **Font size inheritance**: Removed hardcoded `font-size: 11px` from `.attr-name`, `.attr-type`, `.fixed-value`, input/select elements. These now inherit from body which respects the XVE panel font size setting. `thead th` uses relative `0.9em`.
- **Info panel h1 font-size**: Added `font-size: inherit` to h1 to override browser default 2em, matching other panel fonts.
- **Schema unavailable status**: When an XML file references a schema that cannot be loaded, the Actions panel now shows "⚠ Schema unavailable" instead of falsely reporting "✔ Valid". `loadSchemaForDocument()` returns `SchemaLoadResult` enum (`'loaded' | 'no-reference' | 'load-failed'`). Validation status `-2` represents schema-unavailable state.
- **New commands**: `toggleAttrDocColumn`/`toggleAttrDocColumnHidden`, `toggleAttrTypeColumn`/`toggleAttrTypeColumnHidden` — 4 commands for Attributes panel column visibility toggle.
- **Regression tests**: 27 new tests (22 for xml-commands toggles, 5 for AttributesPanelProvider.sendMessage).

### Fixed — Round 7: Unified Element Name Styling (Attributes & Info Panels)
- **Attributes panel header**: Removed hardcoded `font-size: 13px` and blanket `font-weight: 600` from `.element-header`. Added `.element-header.required` class that sets `font-weight: 700` only when the element is required (`minOccurs >= 1`). Both postMessage sites (cursor-change and panel-refresh) now forward `minOccurs`.
- **Info panel header**: Removed `font-size: 1.15em` from `h1`. Added default `font-weight: normal` with an `h1.required` override for bold. Header now renders element name inside `<element>` angle-bracket markup with a conditional `required` CSS class. Added `esc()` helper for XSS safety.
- **C++ engine — `min_occurs` in AttributesPanelData**: Added `min_occurs` field to `AttributesPanelData` struct (`helper_data_service.h`). `ComputeAttributesPanelData()` populates it via `GetElementInfoByPath` / `GetElementInfo`. The field is included in the `helper.getAttributesPanelData` JSON-RPC response.
- **TS interface update**: `AttributesPanelData` interface (`engine-client.ts`) extended with `min_occurs: number`.

### Fixed — Round 6 Bugfixes (Colors, Element Expansion, Auto-close)
- **Elements panel color regression**: Removed hardcoded CSS overrides `body.vscode-dark { --xve-tag-color: #4EC9B0 }` and `body.vscode-light { --xve-tag-color: #800000 }` from `schema-table-styles.ts`. These overrode the dynamic theme color set in `:root` via higher CSS specificity. The `:root` selector now solely controls element colors using the extracted theme tag color.
- **Bug P — Empty element expansion (final fix)**: Replaced the empty pcdata hack (which didn't survive the document.update re-parse round-trip) with `pugi::format_no_empty_element_tags` flag in `Document::ToString()`. Added `expand_empty` parameter to `ToString()`. Insert operations (`InsertElement`, `InsertRequiredChildren`) now use `expand_empty = true`, ensuring all empty elements serialize as `<foo></foo>` regardless of re-parsing.
- **Auto-close regression**: Restructured `handleChange` in `tag-autoclose.ts` to a two-pass approach. First pass scans all content changes for `>` in typed/pasted text (normal auto-close). Second pass handles deletion detection (e.g. deleting `/` from `<foo/>`) only for single pure-deletion events. Fixes regression where multi-change events from VS Code could bypass the normal `>` detection path.
- **Load Schema icon**: Replaced `\u2795` (➕ Heavy Plus Sign, renders as emoji) with `\u2295` (⊕ Circled Plus) for consistent thin-outline style matching other toolbar icons.
- **Auto-close init desync**: Panel showed auto-close ON by default but service was disabled if persisted config was false. Added `xmlActionsProvider.setAutoCloseActive(autoCloseDefault)` during extension activation to sync panel state with config.
- **Helper panels not loading on startup**: `cursorTrackingService.forceRefresh()` was inside the `if (isXml)` block in the `onReady` callback, so panels never populated if timing was off. Moved `forceRefresh()` outside the conditional so it always runs after documents/schemas load. Also initialized XML Actions panel with active file name on startup.

### Added — Expand Self-Closing Tag Command
- **New command**: `xmlVisualEditor.expandSelfClosingTag` — converts `<foo/>` to `<foo></foo>` with cursor between tags. Available via right-click context menu ("XML Visual Editor" → "Expand Self-Closing Tag").

### Removed
- **Ctrl+Shift+X keybinding**: Removed conflicting keybinding for Expand Self-Closing Tag (conflicts with VS Code Extensions sidebar shortcut). Context menu access remains.

### Added — Regression Tests (Round 6)
- **ToString expand_empty test**: `test_element_expansion.cpp` — 3 new Catch2 sections testing `Document::ToString(true, "    ", true)` with single and multiple self-closing elements, plus preservation of already-expanded elements.
- **Expand self-closing test**: `expand-self-closing.test.ts` — 8 Mocha tests covering simple tags, attributes, namespaced tags, cursor positioning, and negative cases.
- **Updated schema-table-styles tests**: Replaced dark/light override assertions with dynamic theming verification.

### Fixed — Round 5 Bugfixes (Config Warnings, Cursor Position, Element Expansion)
- **Config resource-scope warnings**: Fixed 8 `getConfiguration('xmlVisualEditor')` calls across `extension.ts`, `xml-fix-provider.ts`, `gutter-decoration-service.ts`, and `xml-commands.ts` to pass resource URI (document.uri or activeTextEditor?.document.uri). Eliminates VS Code warnings for `autoCloseTag`, `validateOnOpen`, `validateOnSave`, `validation.showGutterWarnings`, `validation.showFixSuggestions`, `indentation`, and panel settings.
- **Bug O — Cursor jumps to end of document after insertion**: After `InsertRequired` children via full document replacement, cursor was not repositioned. Added `repositionCursorToElement()` shared utility in `cursor-reposition.ts`. Fixed 4 code paths: `callInsertRequired()` and `handleInsertRequired()` in `editor-operations.ts`, `completionInsertRequired` and `completionInsertElement` in `element-insertion-commands.ts`.
- **Bug P — Empty element expansion**: Elements without required attributes now insert as `<foo></foo>` (expanded) instead of `<foo/>` (self-closing). Elements with required attributes stay self-closing. Applies to both `InsertElement` and `InsertRequiredChildren` in `helper_data_service_insert.cpp`. Uses empty pcdata child node to force pugixml expanded serialization.

### Added — Regression Tests
- **Bug P regression test**: `test_element_expansion.cpp` — Catch2 test verifying expanded vs self-closing behavior based on required attributes.
- **Bug O regression test**: `cursor-reposition.test.ts` — 8 Mocha tests covering exact line match, offset search, self-closing tags, elements with attributes, no-match fallback, and partial name rejection.

### Improved — Workflow Orchestrator
- **Test writing as hard gate**: Updated `.github/agents/workflow-orchestrator.agent.md` — Phase 2 Step 5 now makes regression tests a MANDATORY gate (same priority as docs). Pre-commit checklists in Phase 3 and Phase 4 now include explicit test coverage verification.
- **Deduplicated plan template**: Removed workflow phase duplication from `<plan_template>` section. Plan template now contains only the PLAN.md file structure (Implementation Tasks table, Test Coverage table, Status, Deviations). Workflow definition stays in the `<workflow>` section only.

### Added — Context Menu Expansion
- **Pretty Print / Linearize / Strip Whitespace**: Available in editor right-click context menu under "XML Visual Editor" submenu (Format group).
- **Check Well-Formedness / Validate XML**: Available in context menu (Validate group).
- **Select Current Element / Go to Matching Tag**: Navigation commands in context menu (Navigate group). `Select Current Element` highlights the full enclosing element including open/close tags. `Go to Matching Tag` jumps between open and close tag positions.
- **Insert Required**: Available in context menu (Validate group).
- **`findEnclosingElementRange()`**: New utility in `xml-cursor-parser.ts` — stack-based scanner that finds enclosing element open/close tag boundaries for cursor position. Used by Select Current Element and Go to Matching Tag commands.

### Fixed — Bug L: Cardinality for Elements in Unbounded Sequences
- **Elements panel**: Elements inside `<xs:sequence maxOccurs="unbounded">` now correctly show `1..∞` instead of `1..1`. Added propagation at end of `BuildContentModelTree()` in `helper_data_service.cpp` — when parent compositor has `max_occurs != 1`, multiplies into child element nodes' `max_occurs`.
- **Info panel**: `ComputeNodeDetails()` now propagates parent sequence/all compositor `max_occurs` into effective max (was only doing choice groups). Also updates `details.max_occurs` to the effective value so the Info panel "Occurrence" field shows the correct multiplied cardinality.
- **Choice groups**: `ApplyChoiceExclusion()` also propagates repeatable choice `max_occurs` to children for display.
- **Regression tests**: 3 new Catch2 test cases in `test_helper_data_cardinality.cpp` — unbounded choice, bounded choice, unbounded sequence cardinality propagation.

### Fixed — Bug N: Pretty-Print Strips XML Comments
- **Root cause**: `pugi::parse_default` does not include `pugi::parse_comments` — comments were silently discarded during DOM parsing.
- **Fix**: Added `pugi::parse_comments` to parse flags in `Document::ParseString()` (`document.cpp`).

### Fixed — Miscellaneous
- **`validateOnType` resource scope warning**: `getConfiguration('xmlVisualEditor')` in `validation-service.ts` now passes `document.uri` to avoid VS Code warning about accessing resource-scoped configuration without a resource.
- **Schema load timeout**: Increased from 10s to 60s in `schema-service.ts` for large schemas.

### Added — Phase 4f Features
- **Copy XML Path command**: `xmlVisualEditor.copyXmlPath` — copies the simple XPath (e.g., `/root/parent/child`) for the element at cursor to clipboard. Toolbar button in XML Actions panel.
- **Copy XML Path with Predicates command**: `xmlVisualEditor.copyXmlPathWithPredicates` — copies XPath with positional predicates (e.g., `/root[1]/items[1]/item[2]`) to clipboard. Toolbar button in XML Actions panel.
- **Context menu submenu**: "XML Visual Editor" submenu in editor right-click context menu with Copy XML Path and Copy XML Path with Predicates commands.
- **Indentation setting**: `xmlVisualEditor.indentation` enum setting (`"editor"`, `"2"`, `"4"`, `"tab"`) — controls Pretty-Print indentation. `"editor"` (default) reads VS Code editor tab settings.
- **XPath computation (client-side)**: `buildSimpleXPath()`, `buildXPathWithPredicates()` and variants added to `xml-cursor-helpers.ts`. `CursorElementInfo` extended with `simpleXPath` and `xpathWithPredicates` fields.
- **XPath unit tests**: 14 new Mocha tests covering simple/predicate XPath generation, all cursor contexts, self-closing tags, edge cases.

### Fixed — Phase 4e Round 3 Bugfixes
- **Bug H — Tag autoclose completely broken**: Rewrote `TagAutoCloseService` to compute `>` position directly from `change.rangeOffset` in `onDidChangeTextDocument` instead of using `setTimeout(0)` + cursor position (race condition). Removed `handleSelectionChange` which caused false autoclose on arrow key navigation past existing `>` characters.
- **Bug I — Toolbar below status messages**: Swapped HTML order in `xml-actions-provider.ts` so toolbar renders above status section.
- **Bug J — Space before `/>` in self-closing tags**: Added `RemoveSpaceBeforeSelfClose()` post-processor to `Document::ToString()` in C++ core. pugixml outputs `<elem />` by default; now stripped to `<elem/>`.
- **Bug K — Well-formedness check no feedback**: Enhanced `checkWellFormedness` command to show explicit info/warning message dialogs and update XML Actions panel validation status.

### Fixed — Phase 4f Bugfixes
- **Bug A — Completion filter for before-cursor choice groups (TypeScript)**: Rule 2b in completion provider now checks `parentChoiceNode?.cursor_adjacent` instead of unconditionally showing all `inChoiceGroup` elements before cursor. Optional choice groups (e.g., 0..1 with 0 instances) that are entirely before cursor are no longer shown in completions. Added `parentChoiceNode` field to `FlatCompletionEntry` propagated through `flattenContentModel()`. 3 regression tests.
- **Bug B — Cursor-aware insertion not activated (TypeScript)**: `cursor_line` parameter was never passed from TypeScript to the C++ engine's `helper.insertElement` JSON-RPC call. Fixed both `element-insertion-commands.ts` and `editor-operations.ts` to pass `editor.selection.active.line`. The C++ cursor-aware insertion logic (marker technique for sibling positions, InsertChildBefore/After) now activates correctly.
- **Bug D — XML Actions toolbar buttons disappear on focus loss**: Converted XML Actions panel from TreeDataProvider to WebviewViewProvider. TreeView's `view/title` buttons hide on focus loss (VS Code platform limitation). WebviewView renders HTML buttons that are always visible. Complete rewrite of `xml-actions-provider.ts` (155 lines) with HTML toolbar, grouped buttons, toggle state methods.

### Fixed — Phase 4e Round 2 Bugfixes
- **Bug B — Cursor-aware element insertion (C++)**: `InsertElement` now accepts optional `cursor_line` hint. When inserting among same-name siblings, uses marker technique to determine sibling line positions and inserts near cursor position rather than always appending at the end. JSON-RPC `helper.insertElement` accepts optional `cursor_line` parameter.
- **Bug C — Scroll to inserted element**: Added `editor.revealRange(newPos, InCenterIfOutsideViewport)` in `element-insertion-commands.ts` and `editor-operations.ts` so the editor viewport follows cursor after element insertion.
- **Bug E — Pretty-print indentation settings**: Pretty-print and Shift+Alt+F now read VS Code `editor.tabSize` / `editor.insertSpaces` to determine indentation. C++ `Document::ToString()` accepts custom indent string. JSON-RPC `document.prettyPrint` accepts optional `indent` parameter.
- **Bug F — Toolbar button order**: Reordered XML Actions toolbar: Check Well-Formedness, Validate, Load Schema, Toggle Insert Required, Pretty Print, Linearize, Strip Whitespace, Toggle Autoclose, Settings (last).

### Added — Phase 4e Round 2 Enhancements
- **Strip Whitespace command**: `xmlVisualEditor.stripWhitespace` — removes trailing whitespace per line and unnecessary spaces before `/>` in self-closing tags. Toolbar button `$(whitespace)` in XML Actions panel. Regex-based, TypeScript-only operation.

### Added — Phase 4e Pretty-Print, Linearize & Tag Autoclose
- **Pretty-Print command**: `xmlVisualEditor.prettyPrint` — formats XML with proper indentation (4-space indent, newlines). Toolbar button `$(list-tree)` in XML Actions panel. Also registered as `DocumentFormattingEditProvider` for `xml` language (Shift+Alt+F works). C++ engine method `document.prettyPrint` reuses pugixml `format_indent`.
- **Linearize command**: `xmlVisualEditor.linearize` — strips insignificant whitespace, compact single-line XML. Toolbar button `$(dash)` in XML Actions panel. Preserves text content within elements and attribute values. C++ engine method `document.linearize` uses pugixml `format_raw`.
- **Tag Autoclose**: Automatic closing tag insertion when typing `>` that completes an opening tag. New service in `src/services/tag-autoclose.ts`. Handles: tags with attributes, namespace prefixes (`ns:tag`), multiple attributes with `>` in quoted values. Exclusions: self-closing (`/>`), comments (`-->`), CDATA (`]]>`), processing instructions (`?>`), duplicate close tags on same line.
- **Tag Autoclose toggle**: Toolbar button `$(tag)` in XML Actions panel with active/inactive state. Setting: `xmlVisualEditor.autoCloseTag` (boolean, default: true). Toggle updates setting and button icon reflects current state.
- **C++ formatting tests**: 13 new Catch2 test cases (48 assertions) in `test_document_formatting.cpp` — covers pretty-print idempotency, linearize roundtrip, text content preservation, XML declaration preservation, error handling.
- **TypeScript autoclose tests**: 29 new Mocha tests in `tag-autoclose.test.ts` — covers basic tags, attributes, namespaces, all exclusion cases, same-line close tags, edge/boundary cases.
- **Extension refactoring**: `extension.ts` split into 3 files to stay under 500-line limit: `extension.ts` (496 lines), `commands/element-insertion-commands.ts` (250 lines), `commands/xml-commands.ts` (314 lines).
- **ESLint workspace fix**: Added `eslint.workingDirectories` to workspace settings for correct tsconfig resolution.
- **Test counts**: C++ 117 test cases (1109 assertions), TypeScript 107 tests — all passing, zero regressions.

### Added — Phase 4c Smart Insertion Position
- **C++ `InsertElementResult` struct**: Enhanced `InsertElement` to return `InsertElementResult{success, new_content, inserted_line, inserted_column}` instead of `std::optional<std::string>`. Uses a temporary marker attribute technique to reliably locate the inserted element's position in serialized output regardless of duplicate element names.
- **JSON-RPC `helper.insertElement` enhanced**: Response now includes `inserted_line` and `inserted_column` (0-based) for cursor positioning.
- **Completion provider engine-based insertion**: Element completion items now use an empty `insertText` with a `completionInsertElement` command instead of snippet-based cursor insertion. Elements are inserted at the schema-correct position via the C++ engine.
- **`completionInsertElement` command**: New VS Code command that calls `helper.insertElement`, replaces the full document, positions cursor at the inserted element, and optionally triggers `helper.insertRequiredChildren` when Insert Required mode is ON.
- **Elements panel engine-based insertion**: `handleInsertElement` in `editor-operations.ts` now tries engine-based schema-ordered insertion first (via `helper.insertElement`), falling back to cursor-based insertion when engine/schema is unavailable.
- **Private `callInsertRequired` helper**: Extracted shared Insert Required logic into a reusable helper method in `EditorOperations`.
- **C++ unit tests**: New test sections for `InsertElementResult` struct fields, insertion position verification (line/column correctness).

### Phase 4b Finalization
- **Documentation update**: Updated all design documents to reflect actual implemented behavior after 11 rounds of bugfixes. DESIGN_COMPLETION_PROVIDER.md §4.3 rewritten with Rule 1/2/3 filter system, §4.9 updated (inactive branches hidden, not strikethrough), test counts updated to 78. DESIGN_HELPER_PANELS.md §5.3.5 added (type_hint content model lookup). DESIGN_MENU_SETTINGS.md status changed to IMPLEMENTED. ARCHITECTURE.md updated with Phase 4b features (Activity Bar, gutter decorations, settings, etc.). phase4b_settings_menu_PLAN.md updated with bugfix rounds 3-11 summaries.
- **Test fixes**: 4 stale Mocha tests updated to match Round 11 Rule 1/2/3 filter behavior (inactive branch hiding, exhausted choice header removal, choice group before_cursor handling). 78 tests passing.

### Fixed — Phase 4b Bugfix Round 11
- **Bug 10 — Completion filter rewrite (TypeScript)**: Completely rewrote the element completion dropdown filter with 3 clear rules: (1) ALWAYS hide inactive branch elements, (2) hide active-branch exhausted elements before cursor (already present, can't insert again), (3) show all elements after cursor including exhausted ones with "(present)" description. Removed dependency on `parentChoiceExhausted` property. Fixes: `name` element in optional choice was hidden after cursor even though it should show as present.
- **Bug 11 — InsertRequired type collision (C++)**: `fill_required` lambda now accepts a `type_hint` parameter for type-aware content model lookups via `GetContentModelByType`. Fixes: when elements with the same name exist in different contexts with different types (e.g., "suffix" as `xs:string` in one type and `AdditionComplexType` in another), the flat `element_cache_` first-one-wins caching caused wrong type resolution. Now all recursive calls propagate `type_name` from `ElementInfo`, and the initial call derives the target type from the parent's content model. Fixes: inserting `<suffix>` no longer fails to insert required choice children from `AdditionComplexType`.
- **Tests**: 8 new TypeScript filter tests (Bug 10 rules), 2 existing filter tests updated. 2 new C++ test cases: pure choice type insertion + type collision scenario. C++ 104 test cases (1055 assertions), TypeScript compiles clean — all passing.

### Added — Phase 4c Smart Insertion Plan
- **Feature plan**: `phase4c_smart_insertion_PLAN.md` — design for schema-order-aware element insertion. C++ `InsertElement` and `helper.insertElement` JSON-RPC endpoint already exist but are unused by the TypeScript extension. Plan covers wiring completion provider and Elements panel Insert button to use engine-based positioning.

### Added — Extension Settings & Menu (Phase 4b)
- **Activity Bar view container**: XML Visual Editor now registers in the Activity Bar with a custom `<>` SVG icon, providing a discoverable entry point. Users can freely dock panels anywhere.
- **XML Actions tree view**: New tree view at top of container showing current file, loaded schema, and validation status. Hosts Validate, Well-Formed, Load Schema, and Settings buttons as view/title icons.
- **Native view/title toolbar buttons**: Elements panel toolbar buttons (Filter, Documentation, Type, Expand All, Collapse All, Insert Required) migrated from webview HTML to native VS Code view/title icons with codicon integration.
- **Multi-category settings**: Settings organized into 3 categories (General, Helper Panels, Validation) with 16 total settings. New settings: `panels.autoReveal`, `panels.showElements/Attributes/Info`, `panels.fontSize/fontFamily`, `completion.fontSize/fontFamily`, `validation.showInlineDecorations/showGutterWarnings/showFixSuggestions/maxProblems`.
- **Configuration reactivity**: All settings changes take effect immediately via `onDidChangeConfiguration` handlers. Font changes re-render all panels.
- **Gutter decoration service**: Error (red circle) and warning (yellow triangle) SVG icons in editor gutter, controlled by `validation.showGutterWarnings` setting. Hover shows diagnostic message.
- **Fix suggestions (CodeActionProvider)**: Lightbulb quick-fix suggestions for "insert missing required element" and "correct element name typo" (Levenshtein distance), controlled by `validation.showFixSuggestions` setting (default: off).
- **Visual styling updates**: Element icons changed from 🔹 to stylized `<>`. Colors aligned with VS Code theme variables (`symbolIcon-fieldForeground`, `symbolIcon-propertyForeground`, `symbolIcon-enumeratorForeground`, `symbolIcon-classForeground`). Choice completion headers use `CompletionItemKind.Enum` for theme-aware coloring.
- **XML editor defaults**: `configurationDefaults` for `[xml]` files: word wrap on, auto-closing brackets/quotes, quick suggestions enabled.
- **Panel font injection**: Custom font-size/family CSS injected into all webview panels via shared `getPanelFontCss()` utility.
- **32 new unit tests**: XmlActionsProvider (10), GutterDecorationService (6), XmlFixProvider (11), getPanelFontCss (5). All 93 tests passing.

### Fixed — Phase 4b Bugfix Round 5
- **Sticky header opaque background (Bug L)**: Changed `th` and `.filter-bar` background to `--vscode-sideBar-background` which is always opaque, preventing content from showing through the sticky header.
- **Filter bar persistence (Bug M)**: Filter visibility and text now persisted via `vscode.getState()` instead of DOM-based save/restore. Survives the loading spinner intermediate update cycle that previously destroyed filter state.
- **XML token colors matching editor theme (Bugs N/O/P)**: Replaced unreliable `--vscode-debugTokenExpression-name/string` CSS variables with actual XML syntax colors injected from extension host. `getXmlTokenColors()` detects theme kind (Dark/Light) and provides matching colors: blue tags + cyan attrs (dark) or maroon tags + red attrs (light). Colors update live on theme change via `updateColors` webview messages.
- **Attribute value coloring (Bug S)**: Attribute values in the Attributes panel now colored to match editor theme (brown in dark themes, blue in light themes). Fixed CSS selectors (`.fixed-value`, `.attr-value input`, `.attr-value select`) to use `--xve-attr-value-color` instead of default foreground colors.
- **Dynamic theme color extraction (Bug T)**: Replaced hardcoded kind-based color lookup with dynamic reading of actual theme JSON files. Resolves theme `include` chains recursively (e.g., `dark_modern.json` → `dark_plus.json` → `dark_vs.json`), extracts TextMate `tokenColors` for `entity.name.tag`, `entity.other.attribute-name`, and `string` scopes. Works for ALL installed themes (built-in, Monokai, Solarized, Abyss, etc.). Falls back to kind-based defaults if theme file parsing fails.
- **Restored "(required)" in completion descriptions**: Completion items for required elements now show "(required)" in the description field, providing schema requirement visibility despite CompletionItem API limitations (no label color/bold).
- **Tests**: C++ 70 test cases (713 assertions), TypeScript 64 tests — all passing.

### Fixed — Phase 4b Bugfix Round 10
- **Bug A — maxOccurs validation for root compositor (C++)**: Validator now checks root compositor `maxOccurs` before reporting "Too many" errors. When `content_model->max_occurs == kUnbounded`, the element-level check is skipped entirely. When `max_occurs > 1`, an effective max is computed as `child_max * compositor_max`. Fixes false positives on repeating compositor patterns.
- **Bug 9 — Insert Required inserts ALL choice branches from group refs (C++)**: Root cause found in `schema_parser_compositor.cpp` — when `ProcessChoiceChildren` handled a group ref expanding to a pure choice (like FEWS `FunctionChoiceGroup` with 40+ alternatives), it erroneously created a `SequenceGroupInfo` for all choice alternatives. `InsertRequiredChildren` then treated the first alternative as a sequence representative and inserted ALL elements. Fix: added `new_elem_count > inner_choice_elem_count` guard — sequence_groups only created for mixed-content group refs (sequence-with-inner-choice), not pure choice group refs. 1 new test case with 19 assertions.
- **Bug B2 — Completion missing required attributes (TypeScript)**: The `completionInsertRequired` command handler in `extension.ts` had a `(result.total_inserted ?? 0) > 0` guard that prevented applying `new_content` when only attributes were added (no child elements). Removed the guard so attribute-only insertions are applied. Fixes: `<hardMin>` from completion now gets `constantLimit` attribute.
- **Bug D2 — Choice exhaustion filter hides active branch (TypeScript)**: The exhaustion filter in `xml-completion-provider.ts` blindly hid ALL elements when `parentChoiceExhausted=true`. Now uses `isInactiveBranch` field to only hide inactive branch elements. Active branch elements with remaining capacity (e.g., `moduleInstanceId` with `maxOccurs="unbounded"`) still shown in completions.
- **Tests**: C++ 102 test cases (1027 assertions), TypeScript compiles clean — all passing.

### Fixed — Phase 4b Bugfix Round 9
- **Bug A — maxOccurs=unbounded false positives (CRITICAL, 3-round persistent)**: Root cause found — when the same element name appeared in multiple `choice_groups` (from group refs), `choice_member_group_index` used last-write-wins, causing the bounded group to overwrite the unbounded one. Fixed `schema_validator.cpp` to prefer the group with highest `maxOccurs` (especially `kUnbounded`). Added safety-net in `schema_parser_compositor.cpp` to guarantee `choice_groups` and `choice_groups_occurrences` vectors are always the same size. Fixes: "Too many 'node'" (Topology.xml), "Too many 'nodes'" (Topology.xml), "Too many 'enumeration'" (Parameters.xml). 3 new regression tests.
- **Bug B — Insert Required inserts optional-sequence children**: Added `skip_min_occurs` guard in `InsertRequiredChildren()` — when the content model's root compositor has `min_occurs=0` and no existing children, skip all element insertion. Mirrors validator's `skip_min_occurs` logic. Fixes: `<hardMin>` insertion no longer adds 12 `monthLimit` elements when `<sequence minOccurs="0">`. 4 new tests.
- **Bug C — Choice headers missing "(required)" in completion**: Fixed `flush_choice_group` fallback in `helper_data_service.cpp` — changed heuristic-based `min_occurs = any_required ? 1 : 0` to XSD default `min_occurs = 1`. Choice compositor nodes now correctly show "(required)" in completion dropdown. 3 new tests.
- **Bug D — Completion shows satisfied/exhausted choice groups**: Added exhaustion filtering in `xml-completion-provider.ts` — elements with `parentChoiceExhausted=true` are now filtered out. Orphan header removal then automatically removes the choice header. 4 new tests.
- **Bug E — Attributes panel shows "(not set)" for configured attributes**: Root cause was a timing race — cursor tracking (150ms) fired before document sync (300ms), so the engine had stale data. Fixed `extension.ts` to sync document content before panel queries, and `editor-operations.ts` to force panel refresh after sync completes. 2 new C++ tests.
- **Bug F — Redundant type header in completion**: Changed `detail` field from `type_name` (redundant with documentation body) to cardinality string (e.g., `0..1`, `1..∞`), providing useful constraint info.
- **Bug G — Theme color mismatch for attribute values**: Added XML-specific TextMate scopes (`string.quoted.double.xml`, `.single.xml`) to color lookup with priority over generic `string`. Fixed specificity matching in `findColorForScope` to prefer longest-matching scope prefix.
- **Bug H — Insert button for inactive choice branch**: Added `isInactiveBranch` guard to `showInsert` condition in `schema-table-renderer.ts` — elements with `inactive-branch` class never show Insert button regardless of cursor position. 3 new tests.
- **Tests**: C++ 94 test cases (982 assertions), TypeScript 70 tests — all passing.

### Fixed — Phase 4b Bugfix Round 8
- **maxOccurs=unbounded false positives (Extension type inheritance)**: Fixed `ResolveExtension` in `schema_parser_types.cpp` to copy `choice_groups_occurrences` when merging extension content models. Previously, extended types lost track of which choice groups were unbounded, causing false "Too many X elements" errors for elements inside unbounded choices accessed through type extension. ⚠️ *Verification showed Parameters.xml and Topology.xml still failing — resolved in Round 9.*
- **Optional sequence validation (minOccurs=0)**: Added logic in `schema_validator.cpp` to skip minOccurs checks when the root compositor has `min_occurs=0` and NO elements from the content model are present. ✅ *Verified working.*
- **Compositor "(required)" in completions**: Updated `buildHeaderItem()` in `xml-completion-provider.ts` to show "(required)" suffix on choice/sequence compositor headers when `min_occurs > 0`. ⚠️ *Sequence headers worked, choice headers resolved in Round 9.*
- **Theme JSONC parse errors**: Replaced regex-based JSONC comment stripping with state-machine parser `stripJsoncComments()`. ✅ *Verified working.*
- **Theme race condition on switch**: Wrapped `onDidChangeActiveColorTheme` callback in 500ms `setTimeout`. ✅ *Verified working.*
- **14 new tests**: 3 C++ Catch2 regression tests, 8 TypeScript unit tests for `stripJsoncComments`, 3 TypeScript completion tests for compositor states.
- **Tests**: C++ 83 test cases (835 assertions), TypeScript 67 tests — all passing.

### Fixed — Phase 4b Bugfix Round 7
- **maxOccurs="unbounded" validation false positives**: Fixed element_cache_ deduplication in `schema_parser_compositor.cpp` to use `std::max` (with `kUnbounded` precedence) when merging element entries. Elements with `maxOccurs="unbounded"` in XSD are no longer capped to 1 when the same element appears in multiple compositor contexts. Fixes: "Too many 'enumeration' elements" (Parameters.xml), "Too many 'nodes'/'node' elements" (Topology.xml).
- **Choice group minOccurs validation for group refs**: Fixed `ProcessChoiceChildren` group ref branch to track ALL elements (not just inner choice elements) when a group ref contains both regular elements and nested choices. Elements from the expanded group now get `choice_path` set and are added to the outer `choice_group`, preventing false "required" errors for unselected choice branches. Fixes: "Element 'firstCellCenter' is required" (Grids.xml), "Element 'monthLimit' is required" (ValidationRuleSets.xml).
- **xs:any wildcard and namespace-prefixed elements**: Validator now checks for `"*"` wildcard in `allowed_names` before reporting "not allowed" errors. Also skips validation for elements with namespace prefixes (extension elements). Fixes: "Element 'Dam' is not allowed" (Locations.xml) where `<relatedLocationId:Dam>` uses a declared namespace prefix.
- **"(required)" text restored in completions**: Removed incorrect `min_occurs` zeroing for elements inside optional choice groups. The schema parser previously set `min_occurs=0` for all children when the parent choice had `minOccurs="0"`, hiding the element's actual requirement status. Elements now retain their declared `min_occurs`, and the validator already handles choice optionality via `choice_members` tracking. Completion descriptions correctly show "(required)" for elements that are required within their choice branch.
- **Theme color extraction improvements**: Added `vscode.LogOutputChannel` ("XVE Theme") for diagnostic logging at every failure point in theme resolution. Added case-insensitive fallback matching in `findThemeFile()`. Added file existence check before read. Improved JSONC stripping to handle trailing commas. All failures now logged instead of silent.
- **10 new regression tests**: 7 Catch2 validation tests (maxOccurs unbounded, choice group refs, xs:any wildcard, namespace prefixes, negative tests), 3 Catch2 min_occurs preservation tests (optional choice elements, sequence-within-choice, HelperDataService content model).
- **Tests**: C++ 80 test cases (801 assertions), TypeScript 64 tests — all passing.

### Fixed — Phase 4b Bugfix Round 4
- **Schema Structure header layout (Bug J)**: Removed `display: flex` from `th.col-name` that broke table grid. Added `.col-name-inner` wrapper div with flex layout for header content. Doc/Type column headers no longer float detached.
- **Filter bar persistence (Bug I)**: `updateContent` handler in webview now saves filter bar state (visibility + text) before innerHTML replacement and restores it after. Filter no longer disappears when panel data updates.
- **Focus/selection text readability (Bug G)**: Added CSS overrides on `.focused-child` and `.selected` rows to force `--vscode-list-activeSelectionForeground` for all colored text (elements, compositors, badges, cardinality chips).
- **Theme change reactivity (Bug H)**: Added `vscode.window.onDidChangeActiveColorTheme` listener in `extension.ts` that re-renders all webview panels when the user switches themes.
- **Element color CSS variables (Bug F)**: Replaced hardcoded `#4EC9B0`/`#800000` with `var(--vscode-debugTokenExpression-name, ...)` and `var(--vscode-debugTokenExpression-string, ...)` across Elements panel, Attributes panel, and Info panel styles.
- **Completion icons consistency (Bug A)**: All elements now use `<>` icon (removed `⚡` for choice groups). Choice headers use `◇`, sequence headers use `▷`.
- **Removed redundant "(required)" text (Bug C)**: Cardinality chips (e.g., `1..5`) already convey requirement status; removed duplicate "(required)" from completion item descriptions.
- **Toggle double-deletion + re-trigger (Bug D)**: Fixed Insert Required toggle to use `insertText='<'` with `replaceRange` instead of `additionalTextEdits` that deleted an extra character. Added `editor.action.triggerSuggest` after toggle to re-open the completion dropdown.
- **Wrong panel data for simple-type elements (Bug K)**: Fixed C++ `helper_data_service.cpp` to use `GetContentModelByType()` and `GetAllowedAttributesByType()` instead of fallback-enabled methods. Type name "string" no longer collides with element named "string" in FEWS schemas.
- **Test updated**: Updated completion test assertion for removed "(required)" text.
- **Tests**: C++ 70 test cases (713 assertions), TypeScript 64 tests — all passing.

### Fixed — Phase 4b Bugfix Round 3
- **Completion dropdown empty** (CRITICAL): Changed element `CompletionItemKind.Text` → `Field`, sequence headers → `Constant`. Fixed toggle `filterText` to include `<` prefix when `replaceRange` exists. Completion items now appear correctly in the dropdown.
- **XML Actions button order**: Reordered view/title menu entries to: Well-Formed, Validate, Load Schema, Insert Required, Settings. Note: VS Code tree view buttons only show on hover (platform limitation).
- **Element/Attribute theme colors**: Element names in Elements panel, Attributes panel header, and Info panel now use CSS custom property `--xve-element-color` (mapped to `--vscode-debugTokenExpression-name`, green in Dark Default). Attribute names use `--xve-attribute-color` (mapped to `--vscode-debugTokenExpression-string`, blue in Dark Default). Choice/sequence compositor colors changed from orange/blue to neutral grey (`--vscode-descriptionForeground`).
- **Expand/Collapse button location**: Moved from Elements panel native view/title bar to "Schema Structure" header row inside the webview, styled as compact codicon buttons.
- **Filter hides empty compositor groups**: `filterRows()` now traverses compositor rows bottom-up after filtering elements, hiding any choice/sequence/all rows that have no visible element descendants. Only compositor paths leading to matching elements remain visible.
- **Test suite overhaul**: Fixed 45 outdated test assertions across completion-provider, schema-service, and completion-types tests. Added `offsetAt`/`positionAt` to mock TextDocument. Updated schema-service mocks for `fs.existsSync` and `{ success: true }` response. New unit tests for schema-table-renderer and schema-table-styles. **Total: 64 tests passing**.

### Fixed — Phase 4b Bugfix Round 2
- **Activity Bar icon**: Replaced stroke-based SVG with fill-based `< / >` icon (`currentColor` compatible) for reliable rendering.
- **Panels disappearing after Settings**: `updateXmlContext()` now checks if ANY XML file is open (not just active editor), preventing views from hiding when opening Settings or non-XML tabs.
- **Settings overlay**: Added `suppressAutoReveal` flag to prevent panel focus during Settings navigation.
- **Schema Structure header offset**: Fixed `th { top: 37px }` → `top: 0` (removed legacy toolbar compensation). Added `body.filter-visible th { top: 33px }` for when filter bar is shown.
- **Dead CSS removed**: Removed unused `.toolbar` CSS rules (4 rule blocks) from `schema-table-styles.ts`.
- **Insert Required toggle**: Moved from Elements panel to XML Actions panel title bar. Removed confusing status bar indicator. Uses distinct icons: `$(circle-outline)` when OFF, `$(zap)` when ON.
- **Toggle visual feedback**: Filter, Documentation, and Type Column toggles now show distinct active/inactive icons via paired commands with context keys (`filterActive`, `docColumnVisible`, `typeColumnVisible`).
- **Settings categories**: Renamed first category from "XML Visual Editor" to "General". Moved completion font settings from Helper Panels to General.
- **Completion dropdown**: Fixed header removal filter that incorrectly broke on child sequence headers (now respects depth levels).
- **Cursor position marking**: Fixed `markCursorPosition()` exhausted compositor handling — elements AFTER the cursor in the active branch are no longer marked `before_cursor`. Added `markCursorPositionInBranch()` helper for recursive branch marking.
- **Focus computation**: Updated `computeFocusedChild()` to recurse into compositor children even when the compositor has `before_cursor=true`, finding the correct focused element inside exhausted compositor branches.
- **Element icon color**: `<>` icons now use `var(--vscode-foreground)` (neutral grey) to match editor tag punctuation instead of blue.
- **Sequence icon style**: Changed from filled `▶` to outline `▷`, consistent with outline choice `◇` icon.
- **Debug logging**: Added temporary `[XVE Completion]` console logs for completion data flow debugging.
- **13 new tests**: `elements-cursor-marking.test.ts` covering `markCursorPositionInBranch`, exhausted compositor handling, and `computeFocusedChild` active branch behavior. Total: 106 tests passing.

### Fixed — Choice Content Completeness (Phase 4a-bugfix Round 7)
- **Bug D — All-optional choice branches flagged incomplete** (`helper_data_service.cpp`): `ApplyChoiceExclusion()` now recognizes choices where all branches have `min_occurs=0` as satisfied even with `total_count=0`. Previously, `content_complete ✗ no` warning was shown for `dataLayer` element in `geoMap` when the choice had all-optional branches. C++ test added: "Choice with all-optional branches is content_complete" (2 sections).

### Fixed — Inactive Choice Branch Styling (Phase 4a-bugfix Round 7)
- **Bug E — Inactive branch elements not greyed out** (`schema-table-renderer.ts`): Removed `before_cursor === true` gate from `childActiveBranch` computation. Previously, inactive choice branch elements (e.g., `simpleString` in `<prefix>` choice context) were not greyed out when `before_cursor` was not set.

### Added — Regression Tests (Phase 4a-bugfix Round 7)
- 4 new TypeScript tests in `elements-focus.test.ts`: Bug C positional proximity focus (3 tests), Bug E inactive choice branch focus (1 test). 3 pre-existing tests updated to match new `findFirstNode()` behavior.
- 1 new Catch2 test: "Choice with all-optional branches is content_complete" (2 sections).
- **Totals**: C++ 70 test cases / 713 assertions, TypeScript 47 passing.

### Fixed — Elements Panel Focus (Phase 4a-bugfix Round 6)
- **Focus priority algorithm** (`elements-panel.ts`): `computeFocusedChild()` now uses `findFirstNode()` (positionally nearest visible element) as the primary focus strategy for ALL cursor contexts (E, F, G). Previously, the function used an aggressive priority chain (`!is_satisfied` → `current_count > 0` → `can_insert`) that searched the entire content model tree, causing focus to jump to distant required or present elements instead of the nearest insertable element after the cursor. The priority chain is now only a last-resort fallback when no positional match exists.

### Improved — Panel Loading UX (Phase 4a-bugfix Round 6)
- **Loading indicators** (`elements-panel.ts`, `attributes-panel.ts`, `info-panel.ts`): All three helper panels now show a loading message while waiting for engine responses. Timeout increased from 10s to 30s. Timeout errors now display as soft informational messages (not red error text) with a "try again" hint, since the engine may still be processing in the background.

### Fixed — Validation Bugs (Phase 4a-bugfix Round 5)
- **Group ref element_cache_ sync** (`schema_parser_compositor.cpp`): `ProcessGroupRef()` now syncs `element_cache_` entries after propagating the group ref's `minOccurs`/`maxOccurs` to `model.elements`. Previously, `element_cache_` retained the element's own XSD defaults (min=1, max=1), causing `GetElementInfo()` fallback to return wrong cardinality. Fixes Info panel showing "1..1" for `dataLayer` when `AnimatedLayerChoice` group ref has `minOccurs="0" maxOccurs="unbounded"`.

### Added — Regression Tests (Phase 4a-bugfix Round 5)
- New Catch2 test "ObsoleteTimeSeriesSetChoice group validation": 15+ assertions verifying that `timeSeriesSet` inside a group with `<choice><sequence maxOccurs="unbounded">` correctly gets `max_occurs=kUnbounded`. Tests 7 elements, content model, mixed branches, AnimatedLayerChoice branch, and many repetitions.
- New Catch2 test "group ref min/max propagation in choice": 15 assertions verifying that group ref cardinality propagation is reflected in content model, `GetElementInfoByPath()`, and `GetElementInfo()` (element_cache_).
- **Totals**: 69 test cases, 702 assertions — all passing.

### Fixed — Validation Bugs (Phase 4a-bugfix Round 4)
- **Sequence-within-choice maxOccurs** (`schema_validator.cpp`): `choice_member_group_index` now includes elements from sequence groups within choices, mapped via `seq_group.choice_path`. Fixes false "Too many 'upperColor'" / "Too many 'lowerOpaquenessPercentage'" errors for elements in `<choice maxOccurs="unbounded"><sequence>...</sequence></choice>` patterns.
- **Group ref maxOccurs propagation** (`schema_parser_compositor.cpp`): `ProcessGroupRef()` now reads and propagates `maxOccurs` from `<group ref="..." maxOccurs="unbounded"/>` to all child elements. Fixes false "Too many 'dataLayer'" errors when group refs have unbounded repetition.
- **Nested sequence maxOccurs propagation** (`schema_parser_compositor.cpp`): `ProcessSequenceChildren()` now reads and propagates `maxOccurs` from nested `<xs:sequence maxOccurs="unbounded">` to child elements.
- **Info panel choice-group exhaustion** (`helper_data_service.cpp`): `ComputeNodeDetails()` now computes `effective_max` by multiplying element `max_occurs` with parent choice group `max_occurs` (same logic as validator). Fixes incorrect "exhausted" state in Info panel for elements in repeating choice groups.
- **Toolbar button feedback** (`validation-service.ts`, `extension.ts`): Toolbar buttons (Check Well-Formedness, Validate Document) now show a warning when engine is not ready ("XML engine is starting up. Please try again in a moment.") and show success feedback in status bar ("Validation passed — no issues found" / "Well-formedness check complete", 3s auto-dismiss).

### Added — Regression Tests (Phase 4a-bugfix Round 4)
- 3 new Catch2 TEST_CASEs with 9 sections in `test_schema_validator.cpp`:
  - Choice-with-sequence-branch: single sequence, multiple unbounded, mixed with direct elements
  - Group ref maxOccurs in choice: single element, multiple unbounded, many repetitions
  - Nested sequence maxOccurs: no rows, single row, many rows unbounded

### Fixed — Validation Bugs (Phase 4a-bugfix Round 3)
- **Type/element namespace collision** (`schema_validator.cpp`, `schema_parser_types.cpp`, `schema_service.cpp`): Added `GetAllowedAttributesByType()` and `GetContentModelByType()` methods to `ISchemaService` and `SchemaParser` that look up type information WITHOUT falling back through `element_cache_`. Prevents type name `"string"` from colliding with element named `"string"` (FEWS `StringPropertyComplexType` with `key`/`value` attributes). Fixes false "Missing required attribute 'key'/'value'" errors on `exportType`, `name`, `description`, `expression`, `exportMissingValueString`.
- **Validation request timeout** (`validation-service.ts`): Increased timeout for `validation.validateWellFormedness` and `validation.validateSchema` requests from 10s to 60s. Fixes timeout errors on large files like SpatialDisplay.xml (~21K lines).

### Added — Regression Tests (Phase 4a-bugfix Round 3)
- 1 new Catch2 TEST_CASE with 4 sections in `test_schema_validator.cpp`:
  - Type/element name collision: property element valid, simple string no false positive, missing attr detected, mixed document valid

### Fixed — C++ Engine Validation Bugs (Phase 4a-bugfix Round 2)
- **Group ref choice cardinality** (`schema_parser_compositor.cpp`): `ProcessSequenceChildren()` now reads `minOccurs`/`maxOccurs` from `<xs:group ref>` elements and stores them in `choice_groups_occurrences` for any choice groups added by `ProcessGroupRef()`. Fixes false "too many elements" errors for elements like `esriShapeLayer`, `dataLayer` etc. when the group ref has `maxOccurs="unbounded"`.
- **Nested union type recursion** (`schema_validator.cpp`): New `CheckUnionValue()` private method recursively checks union member types up to depth 10. Handles chains like `colorStringType` → `nonReferenceColorStringType` → `rgbColorStringType` (pattern `[0-9A-F]{6}`). Fixes rejection of valid hex color values like `B5D0D0`.
- **Path-based type resolution** (`schema_validator.cpp`): Both `ValidateAttributes()` and `ValidateChildren()` now resolve element type via path first (`CachedResolveType(element_path)`) and use the resolved type as `lookup_key` for all service queries. Fixes `<simple>` elements getting wrong type when they appear at different paths with different XSD types.
- **Validation performance caching** (`schema_validator.cpp`, `schema_validator.h`): Added per-validation caches: `type_resolution_cache_` (path→type) and `content_model_cache_` (key→ContentModelInfo). Uses `CachedResolveType()` and `CachedGetContentModel()` wrapper methods. Eliminates redundant path walks for large files like SpatialDisplay.xml (~21K lines).

### Added — Validation UX Improvements (Phase 4a-bugfix Round 2)
- **"Validating..." spinner** (`validation-service.ts`): `validateFull()` now shows `$(loading~spin) Validating...` status bar message during validation, disposed in `finally` block.
- **"Check Well-Formedness" toolbar button** (`package.json`, `extension.ts`): New `xmlVisualEditor.checkWellFormedness` command with `$(check)` icon in editor title bar. Runs well-formedness validation only (no schema), with its own `$(loading~spin) Checking well-formedness...` spinner.

### Added — Regression Tests (Phase 4a-bugfix Round 2)
- 3 new Catch2 TEST_CASEs with 10 sections in `test_schema_validator.cpp`:
  - Group ref choice in sequence (Bug 4): single element, multiple unbounded, many repetitions
  - Nested union types (Bug 5): inner enum, inner pattern (hex color), outer pattern, invalid rejected
  - Path-based attribute resolution (Bug 6): correct attributes per path, wrong attribute rejected

### Fixed — C++ Engine Validation Bugs (Phase 4a-bugfix)
- **Union/custom simpleType validation** (`schema_types.h`, `schema_parser_types.cpp`, `schema_validator.cpp`): Added `member_types` vector to `TypeInfo` to track union member type names. `ProcessSimpleType()` now populates `member_types` for `xs:union` memberTypes and inline union members. `ValidateTextContent()` iterates all member types: accepts if any member has no restrictions (e.g., `xs:string`), matches an enum value, or matches a pattern. Only rejects if NO member accepts the value. Fixes false positives on `timeSeriesTypeStringType` (`$tstype$`) and `colorStringType` (`B5D0D0`).
- **Choice group cardinality** (`schema_validator.cpp`, `schema_parser_compositor.cpp`): Validator now detects which choice group an element belongs to via `choice_member_group_index` map. For maxOccurs checks, looks up the choice group's own maxOccurs from `choice_groups_occurrences`. When the choice is unbounded, skips the element count check entirely. Also fixed `ProcessCompositor()` to populate `choice_groups_occurrences` when the top-level compositor is a `<xs:choice>` (was only populated for nested choices within sequences). Fixes false positive "Too many 'gridPlotGroup' elements (maxOccurs=1, found=21)" on valid `SpatialDisplay.xml`.
- **Path-based type resolution** (`schema_validator.cpp`, `schema_validator.h`): All `Validate*()` methods now receive and build the full `element_path` (vector of ancestor names). Uses `GetElementInfoByPath()` instead of `GetElementInfo()` for non-root elements, correctly resolving same-named elements with different types in different parent contexts. Falls back to `GetElementInfo()` when path lookup fails. Fixes `<position>bottomRight</position>` inside `<logo>` being resolved as `GridPlotLegendPlacementEnumStringType` instead of `PositioningEnumStringType`.

### Added — Validation Regression Tests (Phase 4a-bugfix)
- 3 new Catch2 TEST_CASEs with 45 new assertions in `test_schema_validator.cpp`:
  - Union type validation: enum member accepted, pattern member accepted, arbitrary string via string member accepted, strict union rejects invalid
  - Choice group cardinality: single element valid, multiple same element in unbounded choice, mixed elements, many repetitions, bounded choice rejects excess
  - Path-based type resolution: same name different parent context, wrong type rejected per parent

### Improved — Test Documentation
- Updated `.github/skills/test-suite-guidelines/SKILL.md` (61→182 lines): comprehensive Catch2 best practices, directory structure, assertion strategy, regression discipline, CMake integration, build commands
- Updated `.github/agents/test-writer.agent.md` (80→180 lines): full project context, 3 test pattern examples, 9-step workflow, regression discipline rules, Windows build commands

### Added — Validation Options & Settings (Phase 4a)
- **Validate on type setting** (`package.json`, `validation-service.ts`): New `xmlVisualEditor.validateOnType` boolean setting (default: true) controls whether validation triggers automatically as you type. When disabled, only manual, save, and open validation run.
- **Validation delay setting** (`package.json`, `validation-service.ts`): New `xmlVisualEditor.validationDelay` number setting (default: 500ms, range: 100–5000ms) configures the debounce delay before on-type validation fires.
- **Full validation (well-formedness + schema)** (`validation-service.ts`): New `validateFull()` method automatically uses schema validation when a schema is associated with the document, falling back to well-formedness-only otherwise. All validation triggers (on type, on save, on open, manual command) now use full validation.
- **Dynamic settings reads** (`extension.ts`): All event handlers now read `xmlVisualEditor.*` settings dynamically instead of caching config at activation time. Settings changes take effect immediately without extension reload.
- **Improved diagnostic ranges** (`validation-service.ts`): Error underlines now highlight the full word at the error position (via `getWordRangeAtPosition()`) instead of just 1 character. Falls back to full line content if no word boundary found.
- **Validation service tests**: 10 new Mocha unit tests covering `validateFull` routing, engine skip, non-XML skip, method dispatch, diagnostic mapping, debounce, and disposal.

### Removed — Debug Logging Cleanup (Phase 4a)
- Removed all 30 `[XVE-DIAG]` debug `console.log`/`console.warn` statements from `xml-completion-provider.ts`, `extension.ts`, and `editor-operations.ts`. These were development-time diagnostics polluting the Debug Console.

### Fixed — Indexed Path & Focus Regressions (Phase 3e bugfix)
- **Indexed path element_name bug** (`xml-completion-provider.ts`): Added `stripPathIndex()` helper that strips `[N]` suffixes from path segments before using them as `element_name` in engine calls. `buildParentPathWithSibling()` produces indexed paths like `variable[2]` for document navigation accuracy, but engine schema lookups need plain names. Applied at all 4 locations where path segments are used as element names (element completions, attribute name completions, attribute value completions, text content completions). Previously, completions for second/subsequent sibling elements (e.g., second `<variable>`) returned empty because the engine couldn't find `"variable[2]"` in the schema.
- **Focus priority for present elements** (`elements-panel.ts`): Added middle priority `(n.current_count ?? 0) > 0` in `computeFocusedChild()` between `!n.is_satisfied` and `n.can_insert` at all 3 focus computation locations (context E, F/G without sibling, F/G fallback). Fixes focus jumping to distant merely-insertable elements instead of existing elements at cursor position — e.g., cursor at `<variable>|` now focuses `variableId` (present) instead of `convertDatum` (insertable but empty).
- **Present-but-not-exhausted check mark** (`schema-table-renderer.ts`): Elements with `current_count > 0` that aren't exhausted now show ✓ indicator with tooltip "Present in document (N instances)". Previously only exhausted elements got a check mark — unbounded elements like `variable 0..∞` showed no presence indicator despite having 10 instances.
- **Attributes panel updates on element click** (`extension.ts`): `onElementSelected` handler now calls `showElementAttributes()` using `lastCursorContext.elementPath`, so clicking any element in the Elements panel updates the Attributes panel. Previously only the Info panel was updated on click.

### Tests — Indexed Path & Focus Regression Tests
- 198 new lines in `completion-provider.test.ts`: regression tests for indexed path handling
- 182 new lines in `elements-focus.test.ts`: regression tests for focus priority with present elements

### Fixed — Completion Provider UX Polish (Rounds 5–9)
- **Depth-based indentation** (`xml-completion-provider.ts`): Choice children indented ~2 spaces, sequence-within-choice children indented ~4 spaces in completion dropdown, using `\u00A0\u00A0.repeat(depth)` (non-breaking space pairs). Matches Elements panel's tree-like visual hierarchy.
- **Boxed icons removed** (`xml-completion-provider.ts`): Changed `CompletionItemKind.Constant` (prominent boxed "E"/"B") to `CompletionItemKind.Text` (minimal "Aa") for both element items and compositor headers.
- **Word-wrapped resolve documentation** (`xml-completion-types.ts`): `buildResolveMarkdown()` now renders attributes as a bullet list instead of a table, preventing horizontal scroll in narrow documentation panels.
- **Placeholder documentation on all elements** (`xml-completion-provider.ts`): All element completion items now get initial `**name** (type)` documentation (removed `type_name` guard), so VS Code always shows the detail panel even before `resolveCompletionItem` completes.
- **Repeatable choice group elements not filtered** (`xml-completion-provider.ts`): Elements in unbounded choice groups (e.g., `activity` in `<xs:choice maxOccurs="unbounded">`) are no longer filtered out when `before_cursor=true`. Filter exception applies when `parentChoiceExhausted === false`.
- **Completions re-queryable** (`xml-completion-provider.ts`): All `CompletionList` results now set `isIncomplete: true`, telling VS Code to re-query on further typing.
- **Auto-retrigger on cursor placement** (`extension.ts`): New `onDidChangeTextEditorSelection` handler triggers `editor.action.triggerSuggest` when cursor is placed after `<` via mouse/keyboard, so completions reappear without requiring Ctrl+Space.
- **Choice header option count** (`xml-completion-provider.ts`): `children.filter(element).length` changed to `children.length` to count all alternatives (including sequences).
- **Sequence headers in dropdown** (`xml-completion-provider.ts`): Sequence branches within choice groups now show a `▶ sequence` header with element count.
- **Checkmark display** (`xml-completion-provider.ts`): `node.is_satisfied` changed to `node.current_count > 0` for accurate checkmark display.

### Added — Completion Provider Design Documentation
- New `docs/DESIGN_COMPLETION_PROVIDER.md` — comprehensive design specification covering architecture, context detection, element/attribute/text completions, resolve popup, visual representation, and Notepad++ replication guide.

### Added — Completion Provider Round 5–9 Tests
- 8 new Mocha tests in `completion-provider.test.ts`: depth indentation (2), CompletionItemKind (2), choice group filtering (2), placeholder documentation (1), isIncomplete flag (1). Total: 29 element completion tests + 14 resolve markdown tests.

### Fixed — Completion Provider Bug Fixes (Phase 3e fixes)
- **Element completions cursor filtering** (`xml-completion-provider.ts`, `xml-completion-context.ts`): Element completions now apply `markCursorPosition()` to filter out elements that are before the cursor and not insertable. Added `buildParentPathWithSibling()` to determine preceding sibling from XML text. Only elements where `can_insert`, `cursor_adjacent`, or after-cursor are shown — matching Elements panel behavior. Previously showed ALL content model children regardless of cursor position.
- **Inactive choice branches removed** (`xml-completion-provider.ts`): Inactive choice branches (elements from a non-active choice alternative) are now excluded from completions entirely. Previously shown with strikethrough at bottom of list. Orphan headers (choice/sequence headers with no remaining children) are also removed.
- **Attribute completions path fix** (`xml-completion-provider.ts`): For `tag-open` and `attribute-value` contexts, element path now includes the current element (`[...ctx.parentPath, ctx.elementName]`). Previously queried the parent element's attributes because `buildParentPath()` excludes unclosed tags.
- **Text content completions** (`xml-completion-provider.ts`): Fixed `schema.getElementInfo` response nesting — cast as `{ element_info?: { type_name?: string } }` and access `info?.element_info?.type_name`. Same bug as fixed in elements-panel.ts.
- **Insert Required toggle** (`xml-completion-provider.ts`, `extension.ts`): When Insert Required mode is ON, element completion items now set `insertText = ''` and attach a `command` that calls `handleInsertElement(name)` via new `xmlVisualEditor.completionInsertElement` command. Previously the toggle item existed but had no effect on completion behavior.
- **resolveCompletionItem** (`xml-completion-provider.ts`): Path fixes for attribute/element queries also improve resolve behavior — engine calls no longer fail silently due to wrong element paths.

### Fixed — Insert Required in closing tag context (Phase 3h)
- **Insert Required path calculation** (`editor-operations.ts`): When cursor is inside a closing tag (context G) and Insert Required mode is active, `handleInsertRequired()` now uses the parent path (`elementPath.slice(0, -1)`) instead of the current element path. The inserted element is a sibling (after the closing tag), so its path is relative to the parent. Previously used the wrong path, causing `helper.insertRequiredChildren` to fail silently — only an empty element was inserted.

### Added — Self-closing element expansion on child insert (Phase 3h)
- **Self-closing element expansion** (`editor-operations.ts`): Both `handleInsertElement()` and `handleInsertRequired()` now detect self-closing elements (`<element ... />`) when cursor is inside an opening tag (contexts B/C/D). Self-closing `/>` is expanded to `>..child..</element>` with proper indentation. Previously inserting a child into a self-closing element produced malformed XML.
- Non-self-closing tags in B/C/D context: insert position is moved to after the `>` (same as context G behavior).

### Added — Enum values display in Elements panel (Phase 3h)
- **Enumeration values in Elements panel** (`elements-panel.ts`): When cursor is on a simple-type element with enumerations (e.g., `<timeSeriesType>`), the Elements panel now shows allowed enum values instead of "has simple content (text only)". Current value highlighted with green bullet (●), other values with gray bullet (○). Panel auto-scrolls to the selected value.
- **Interactive enum selection** (`elements-panel.ts`, `schema-table-scripts.ts`): Clicking an enum value in the Elements panel updates the XML document text content to the selected value. Panel auto-refreshes via `onRequestRefresh` → `forceRefresh()` to show the updated selection.
- **Boolean type support** (`elements-panel.ts`): Elements with `xs:boolean` type (e.g., `<checkMissing>`) display `true` / `false` as clickable enum-like options. Detected by type_name matching `boolean` or `*:boolean`.
- **Fixed `extractSimpleTextContent` for in-tag cursors** (`elements-panel.ts`): Rewrote function to search backward for `<elementName` then forward for `>`, correctly handling cursor contexts A (tag name) and B (after tag name). Previously searched backward for `>`, which found the wrong `>` when cursor was inside the opening tag.
- **Fixed `element_info` response nesting** (`elements-panel.ts`): `schema.getElementInfo` returns `{element_info: {type_name: ...}}` but code was accessing `info.type_name` directly. Fixed to `info.element_info.type_name`.
- New CSS styles for `.enum-values`, `.enum-value`, `.enum-ind-set`, `.enum-ind` (`schema-table-styles.ts`)
- Auto-scroll to `.enum-value.selected` on panel update (`schema-table-scripts.ts`)
- Extracted `extractSimpleTextContent()` as exported pure function for testability

### Tests — Phase 3h regression tests
- 8 new unit tests for `extractSimpleTextContent()` in `elements-focus.test.ts`: basic extraction, empty element, whitespace trimming, no closing tag, self-closing element, cursor in opening tag, nested elements, elements with attributes

### Refactored — VS Code Extension API Best Practices (Phase 3g)
- **`editor.insertSnippet()` with `SnippetString`** (`editor-operations.ts`): Replaced `editor.edit(eb => eb.insert())` + manual cursor offset math with `editor.insertSnippet(new SnippetString(...))`. Cursor now correctly lands between tags `<element>|</element>` (was after tag name). Required-attrs case uses `$1` tabstop for attribute input.
- **Line-based closing tag scanning** (`editor-operations.ts`): Replaced `editor.document.getText()` + `text.indexOf('>', offset)` with `lineAt()`-based scanning for context G insert position. Avoids full document string allocation for a local operation.
- **`WorkspaceEdit` for document replacement** (`editor-operations.ts`): `handleInsertRequired()` Step 4 now uses `vscode.workspace.applyEdit(wsEdit)` instead of `editor.edit(eb => eb.replace(...))`. Full range computed via `lineAt(lineCount - 1).range.end`.
- **`getWordRangeAtPosition()`** (`xml-completion-provider.ts`): Replaced manual backward character scanning in `detectElementReplaceRange()` with `document.getWordRangeAtPosition(position, /<[\w.:_-]+/)`.
- **Async/await command chaining** (`extension.ts`): Replaced nested `setTimeout(500ms)` → `focus` → `setTimeout(200ms)` → `forceRefresh` with clean async/await chain and single 300ms delay for when-clause processing.
- **`vscode.Uri.joinPath()`** (`engine-client.ts`): Replaced `path.dirname()` + `path.join()` with `vscode.Uri.joinPath()` for cross-platform path resolution. Removed `path` import.
- **`LogOutputChannel`** (`engine-client.ts`): Upgraded from `createOutputChannel('name')` to `createOutputChannel('name', { log: true })` with structured logging levels (`info`, `debug`, `warn`, `error`, `trace`).
- **All quality gates pass**: TypeScript compilation clean, ESLint clean, Prettier clean. Zero behavior changes (cursor placement improved).

### Merged to main — VS Code Extension Phase 3b–3e
- Merged `feature/phase-3-vscode-ext` into `main` with all Phase 3 VS Code extension work
- Updated README with comprehensive feature descriptions and granular Phase 3a-3f status table

### Fixed — Helper Panel Insert & Completion Fixes (Round 9) ✅
- **Insert position adjusted for closing tag context** (`editor-operations.ts`): When cursor is inside a closing tag (context G, e.g., `</variab|leId>`), `handleInsertElement()` and `handleInsertRequired()` now find the closing `>` and insert after it. Previously inserted at raw cursor position, producing malformed XML like `</variab<newElement></newElement>leId>`.
- **Focus returned to editor after panel insert** (`editor-operations.ts`): Both `handleInsertElement()` and `handleInsertRequired()` now call `workbench.action.focusActiveEditorGroup` after completing the edit. Previously focus could remain on the webview panel.
- **Empty element cursor context fixed** (`xml-cursor-helpers.ts`): `findEnclosingTag()` backward scan now starts from `offset - 1` instead of `offset`. When cursor is at `<variable>|</variable>` (between `>` and `<`), the function correctly returns `null` (outside any tag) instead of finding the `<` of the closing tag and reporting context G. This fixes the Elements panel showing parent context instead of child context for empty elements.
- **Completion provider type_name parameter** (`xml-completion-provider.ts`): `getTextContentCompletions()` now calls `schema.getElementInfo` first to get the element's `type_name`, then passes it to `schema.getEnumerationValues`. Previously passed `element_name` directly, causing "Missing required parameter: type_name" errors. Also fixed response field from `enum_values` to `values`.
- **Regression tests**: Added `cursor-helpers.test.ts` (5 unit tests for `findEnclosingTag` boundary conditions) and 3 integration tests for text-content completion type_name resolution.
- **All 4 fixes verified by user** — insert position, focus return, empty element context, and completion provider all working correctly.

### Fixed — Panel Visibility on File Switch & Reopen (Round 8)
- **Panels now stay visible when switching XML files** (`extension.ts`): `onDidChangeActiveTextEditor` uses `xmlvisualeditor.elementsPanel.focus` command to ensure panel container is visible, then immediately refocuses editor with `workbench.action.focusActiveEditorGroup`. Previously, panels appeared to "disappear" on file switch because `WebviewView.show()` cannot open collapsed panel containers or secondary sidebars.
- **Sidebar reopens when opening XML after close** (`extension.ts`): Same focus+refocus pattern ensures the secondary sidebar/panel area reopens automatically whenever an XML file becomes active, even after manually closing the sidebar. Previously only worked on initial engine startup.
- **Initial activation also refocuses editor** (`extension.ts`): The `onReady` callback now returns focus to the editor after opening the panel, matching the file-switch behavior.

### Fixed — Focus Algorithm Jumping to Distant Element (Round 7)
- **`computeFocusedChild()` replaced global `nextExisting` with immediate-first-node check** (`elements-panel.ts`): When cursor was after `</parameterId>`, focus jumped to `locationId` (existing inside a choice, count=2) instead of focusing on `domainParameterId` (first insertable after cursor, count=0). New algorithm only focuses on next-existing element if it's the very first element after cursor position.

### Fixed — Unbounded Choice Strikethrough & Insert Button (Round 7)
- **`activeBranchContext` now only propagated for exclusive choices** (`schema-table-renderer.ts`): Non-active branches in unbounded choices (e.g., `parallel`, `sequence` in `<xs:choice maxOccurs="unbounded">`) were getting `inactive-branch` class (strikethrough + 0.4 opacity). Now only applies when `max_occurs === 1`.
- **`cursor_adjacent` no longer requires `child.can_insert`** (`elements-panel.ts`): In unbounded compositors, the preceding sibling is always `cursor_adjacent` regardless of element-level exhaustion. Fixes `activity` element (max_occurs=1 reached) not getting an insert button even though the compositor is unbounded.
- **`showInsert` now includes `cursor_adjacent` condition** (`schema-table-renderer.ts`): Insert button appears for cursor-adjacent elements even when their own `can_insert` is false (compositor allows more iterations).

### Fixed — Auto-activation Panel Reveal (Round 7b)
- **Moved panel reveal to `onReady` callback** (`extension.ts`): Root cause was a race condition — `.focus()` fired at T=500ms (before engine ready), setting `panelsRevealed=true`. When engine became ready (T=2-5s), the flag prevented retry. `resolveWebviewView()` was never called → `this.view` stayed undefined → ALL panel updates silently returned.
- **Removed `panelsRevealed` flag** (`extension.ts`): The one-shot flag prevented recovery from failed focus. Replaced with deterministic sequencing: `onReady` → `Promise.allSettled(documentOpens)` → `setContext(true)` → 500ms delay → `.focus()` → 200ms delay → `forceRefresh()`.
- **`updateXmlContext` simplified to context-only** (`extension.ts`): No longer contains panel reveal logic. Only sets `xmlvisualeditor.isXmlFileOpen` context for view when-clauses.
- **File switch works via `handleDocumentOpen`** (`extension.ts`): `onDidChangeActiveTextEditor` calls `handleDocumentOpen()` which internally calls `forceRefresh()`. Now works because `this.view` is properly set by the `onReady` reveal sequence.

### Fixed — Auto-activation Timing (Round 6)
- **Panel focus command chained after setContext** (`extension.ts`): `setContext('xmlvisualeditor.isXmlFileOpen')` is now awaited (via `.then()`) before calling `elementsPanel.focus`, ensuring the panel's `when` clause is evaluated before the focus command runs. Previously the focus fired while the panel was still hidden, silently failing.

### Fixed — Cursor Deduplication Missing `precedingSiblingName` (Round 6)
- **`fireIfChanged()` now compares `precedingSiblingName`** (`cursor-tracking-service.ts`): Moving cursor between sibling closing tags (e.g., `</parameterId>` → `</locationId>`) now correctly triggers panel updates. Previously both positions resolved to the same parent element, context type, and path — the only differentiator (`precedingSiblingName`) was not in the comparison, so the update event was suppressed.

### Fixed — Embedded Choice max_occurs Hardcoded to 1 (Round 6)
- **`choice_groups_occurrences` added to `ContentModelInfo`** (`schema_types.h`): New `std::vector<std::pair<int,int>>` stores `{min_occurs, max_occurs}` per choice group, parallel to `choice_groups`.
- **Schema parser stores choice occurrence info** (`schema_parser_compositor.cpp`): `ProcessSequenceChildren()` now parses both `minOccurs` and `maxOccurs` from embedded `<xs:choice>` nodes and stores them via `choice_groups_occurrences`.
- **`flush_choice_group()` uses actual occurrence** (`helper_data_service.cpp`): No longer hardcodes `max_occurs = 1`. Reads from `choice_groups_occurrences` when available, falling back to previous heuristic. This fixes unbounded embedded choices (e.g., `<xs:choice maxOccurs="unbounded">`) being incorrectly marked as exhausted after first use.
- **New Catch2 test** (`test_helper_data_service.cpp`): "Unbounded embedded choice has correct occurrence" verifies `max_occurs = -1`, `can_insert = true`, and all branches remain insertable.

### Added — Panel Auto-Activation on XML File Open
- **Auto-populate panels on view ready** (`elements-panel.ts`, `attributes-panel.ts`, `info-panel.ts`): All 3 panel providers now fire pending updates in `resolveWebviewView()` when the webview becomes available, so panels populate immediately without the user clicking on the panel header first.
- **Auto-focus elements panel on first XML file** (`extension.ts`): When the extension activates and the first XML file is opened, the elements panel is focused automatically (opening the secondary sidebar if closed). Uses a `panelsRevealed` flag to ensure one-time auto-reveal.
- **File-switch deduplication fix** (`cursor-tracking-service.ts`): `fireIfChanged()` now includes `documentUri` in the deduplication check, ensuring file switches always trigger panel updates even when the cursor lands on the same element type.
- **5 regression tests** (`elements-focus.test.ts`): Tests for next-existing-element focus, unbounded choice group cursor marking, and exhausted choice group preservation.

### Fixed — Focus Bug: Cursor Between Existing Siblings (Test 4)
- **Focus skipped next existing element** (`elements-panel.ts`): `computeFocusedChild()` added a new priority between cursor_adjacent and unsatisfied — finds first after-cursor element with `current_count > 0`. When cursor is between `</variableId>` and `<timeSeriesSet>`, focus now correctly goes to `timeSeriesSet` instead of jumping to the first insertable `convertDatum`.

### Fixed — Unbounded Choice Group All Greyed Out (Test 5)
- **Unbounded compositor incorrectly marked entirely before_cursor** (`elements-panel.ts`): `markCursorPosition()` now handles unbounded compositor nodes (choice/sequence/all with `can_insert=true`) by marking only the matching child as `before_cursor` and setting the compositor as `cursor_adjacent`, leaving other children available. Previously `markSubtreeBeforeCursor()` was called on the entire compositor regardless of exhaustion state, greying out all alternatives in unbounded choice groups (e.g., `activity|parallel|sequence|completed|deleteTemporary` with 1..∞ cardinality).

### Fixed — Bugfix: Elements Panel Focus Algorithm
- **Focus priority was wrong** (`elements-panel.ts`): `computeFocusedChild()` prioritized elements that already exist in the document (`current_count > 0`) over elements that can be inserted (`can_insert`). This caused focus to jump to distant present-in-doc elements (e.g., `locationId`) instead of the first insertable element after the cursor (e.g., `domainParameterId`). Fixed in all three code paths: Context E, Context F/G with no preceding sibling, and F/G fallback after cursor_adjacent check. New priority: (1) unsatisfied required elements, (2) any insertable element.
- **F/G context without preceding sibling** (`elements-panel.ts`): When cursor was between parent opening tag and first child (e.g., `<activity>|<runIndependent>`), `computeFocusedChild` returned `undefined` instead of computing a focused element. Now uses the same unsatisfied → insertable priority.
- **Webview JS fallback preferred any element over insertable** (`schema-table-scripts.ts`): When no focused-child class was set by TypeScript, the JS fallback picked the first element after cursor regardless of `can_insert`. Now prefers elements with `data-can-insert="true"`.
- **Regression tests added** (`test/unit/elements-focus.test.ts`): 19 tests covering `markCursorPosition`, `computeFocusedChild` in all contexts (A, C, E, F, G, I), inactive choice branch skipping, and two integration tests matching the exact regression scenarios.

### Added — Phase 3e: Schema-Aware Completion Provider
- **XML completion context detection** (`providers/xml-completion-context.ts`, 180 lines): Lightweight backward-scan approach to classify cursor position into 5 contexts: `element-content`, `tag-open`, `attribute-value`, `text-content`, `unknown`. Builds parent element path via stack-based open/close tag matching. Adapted from reference project's proven `xml-context.ts`.
- **Schema-aware completion provider** (`providers/xml-completion-provider.ts`, 491 lines + `xml-completion-types.ts`, 80 lines): `CompletionItemProvider` that reuses existing engine methods (NO new C++ code needed):
  - **Element completions** (typing `<`): calls `helper.getElementsPanelData` — same engine method as Elements panel. Flattens content model tree, shows choice headers, cardinality, instance state, before-cursor sorting.
  - **Attribute name completions** (space in tag): calls `helper.getAttributesPanelData` — filters already-set attributes, shows required/optional labels, re-triggers suggest for value entry.
  - **Attribute value completions** (inside quotes): reuses attributes data, shows enum values with quote-bounded replace range.
  - **Text content completions** (between tags): calls `schema.getEnumerationValues` for simple-type elements.
  - **Toggle Insert Required** mode item always first in completion list, shares same state as Elements panel.
  - **Comment snippet** always last.
- **Extension registration** (`extension.ts`): Registered `XmlCompletionProvider` with trigger characters `<`, ` `, `"`, `'`.

### Improved — Phase 3e: Completion Provider Enhancements
- **Inactive choice branch strikethrough** (`xml-completion-provider.ts`): When a choice group has an active branch (e.g., `moduleInstanceId` selected), other branches (`moduleInstanceSetId`, `filterModuleInstanceSetId`) now render with `CompletionItemTag.Deprecated` (strikethrough) and are sort-demoted. Previously they showed misleadingly as `(required)`.
- **Remaining count in element descriptions**: Element completion descriptions now show remaining insertions: `✓ 1..∞ (∞ left)`, `✓ 1..5 (3 left)`, `✓ 1..1 (present)` instead of just cardinality.
- **Rich compositor headers**: Choice headers now show `── choice (required) ── 3 options · active: moduleInstanceId`. Sequence headers (`▶ sequence`) shown for non-trivial nested sequences (depth > 0, >1 children).
- **Documentation popup (`resolveCompletionItem`)**: When user selects an element in the dropdown, a rich detail panel shows: element documentation, type name, compositor context, attributes table (required/optional/fixed/default indicators), and enumeration values. Uses `helper.getNodeDetails` + `helper.getAttributesPanelData` in parallel.
- **Types extraction** (`xml-completion-types.ts`, 80 lines): Interfaces and `buildResolveMarkdown` helper extracted to keep main provider under 500-line limit.
- **Completion provider tests**: Added `completion-types.test.ts` (14 tests for `buildResolveMarkdown`) and `completion-provider.test.ts` (18 tests covering context detection, choice branch strikethrough, remaining count, compositor headers, resolve documentation).

### Fixed — Bugfix: Extension Freeze on Bare `<` During Typing
- **Infinite loop in XML cursor parser** (`xml-cursor-parser.ts`): When the user typed a bare `<` (not yet followed by a tag name, e.g. during typing), the tag scanning loop in `getElementAtCursor` fell through all tag-matching branches into the "Regular text" handler. `text.indexOf('<', i)` found the same `<` at position `i`, setting `i = nextLt` with no forward progress — infinite loop. The cursor tracking service called this synchronously 150ms after the keystroke, blocking the extension host and freezing all panels and UI. Fixed by adding a catch-all handler that advances past bare `<` characters not matching any recognized tag pattern.

### Added — Phase 3d: Helper Panel Fixes & Enhancements (round 3)
- **Choice minOccurs propagation in schema parser** (`schema_parser_compositor.cpp`): `ProcessSequenceChildren` now propagates `minOccurs="0"` from `<xs:choice>` nodes to all child elements, matching the existing pattern for optional nested `<xs:sequence>` blocks. `ProcessGroupRef` similarly propagates `minOccurs="0"` from `<xs:group ref>` nodes to inlined elements. This ensures InsertRequiredChildren correctly distinguishes required vs optional choices.
- **InsertRequiredChildren single-pass schema-order walk** (`helper_data_service_insert.cpp`): Replaced the two-pass approach (non-choice first, then choices appended) with a single-pass walk through `model->elements` in schema order. Choice groups are handled inline when their first member is encountered via a `processed_groups` set. This produces correct element ordering matching the XSD sequence definition.
- **Choice group min_occurs inference** (`helper_data_service.cpp`): `flush_choice_group` now infers choice optionality from element data — if ALL elements in a choice group have `min_occurs == 0` (set by parser propagation), the choice is optional. Otherwise it's required.

### Fixed
- **Optional choice elements inserted as required** (`schema_parser_compositor.cpp`, `helper_data_service_insert.cpp`): Choices with `minOccurs="0"` (e.g., `relativeViewPeriod | relativeForecastPeriod`, `ensembleMemberId | ensembleMemberIndex | ensembleMemberIndexRange`) were incorrectly treated as required by InsertRequiredChildren because the parser didn't propagate the choice's minOccurs to its children. Now correctly skipped.
- **InsertRequiredChildren wrong element ordering** (`helper_data_service_insert.cpp`): Elements like `moduleInstanceId` were inserted after non-choice elements instead of at their correct schema position. Fixed by single-pass schema-order walk.
- **Required choice group members missing** (`helper_data_service_insert.cpp`): Required choices (e.g., `locationId | locationSetId`) were not being inserted because the two-pass approach processed them in the wrong order. Now handled inline at correct position.
- **After-cursor exhausted elements missing Insert button** (`schema-table-renderer.ts`): Elements after the cursor position that exist in the document but are marked `can_insert: false` by the engine (because they're exhausted globally) now show Insert buttons, since from the cursor position forward they haven't been placed yet. Insert logic: `canInsert || (!before_cursor && currentCount > 0)`.
- **Cursor-adjacent elements missing Insert button on hover** (`schema-table-styles.ts`): CSS specificity fix — `tr.before-cursor .insert-action { display: none !important }` was overriding the cursor-adjacent hover rule. Fixed by using `tr.before-cursor.cursor-adjacent:hover .insert-action { display: inline-block !important }`.

### Added — Phase 3d: Helper Panel Fixes & Enhancements (continued)
- **`xs:group ref` support in schema parser** (`schema_parser.h`, `schema_parser.cpp`, `schema_parser_compositor.cpp`): Added `group_nodes_` cache, `ProcessGroupRef()` method, and group reference handling in `ProcessSequenceChildren`, `ProcessChoiceChildren`, `ProcessAllChildren`. Named groups (`<xs:group name="...">`) are indexed during `ParseSchema`, and `<xs:group ref="..."/>` references are resolved by inlining the group's compositor content. This fixes missing content model children for types using group references (e.g., FEWS `variableDefinitionComplexType` using `TimeSeriesSequenceGroup`).
- **3 Catch2 tests for xs:group ref** (`test_schema_parser.cpp`): Group ref in sequence (AddressGroup inlined into person), group ref with choice (PaymentGroup choice in order sequence), group ref in type extension (TimeSeriesGroup in variableType extending baseVarType). Total: 518 assertions in 56 test cases.
- **EditorOperations class** (`editor-operations.ts`): Extracted `handleInsertElement`, `handleInsertRequired`, `applyAttributeEdit`, and `scheduleDocumentSync` from `extension.ts` into a new `EditorOperations` class with dependency injection via constructor closures. Reduces `extension.ts` from 572 to 315 lines.
- **Toggle Insert Required icon state** (`package.json`, `extension.ts`): Two commands with different icons (`$(circle-outline)` OFF, `$(zap)` ON) and `when` clauses based on `xmlvisualeditor.insertRequiredActive` context key. The panel title bar button now visually changes between active/inactive states.
- **Insert Required: required attributes** (`helper_data_service_insert.cpp`): `InsertRequiredChildren` now populates required attributes on inserted elements using `set_required_attrs` lambda that queries `GetAllowedAttributes` and sets dummy values (enum[0] → default → type-based dummy value).
- **Focus algorithm** (`elements-panel.ts`): `computeFocusedChild()` uses priority chain: (1) cursor_adjacent element if preceding sibling is unbounded, (2) first unsatisfied (required) element after cursor, (3) first insertable element after cursor. Correctly focuses on the next element the user can insert at the cursor position.
- **Backend-first paradigm** (`.github/skills/`): Updated `architecture-guardrails`, `multiplatform-targets`, and `service-layer-usage` skills to mandate that all business logic, schema resolution, content model computation, and data transformation must be in the C++ Core Engine. TypeScript handles only editor-specific UI and cursor tracking.

### Changed
- **ESLint config** (`.eslintrc.json`): Added `leadingUnderscore: "allow"` for parameter and classProperty selectors to support VS Code API patterns (`_context`, `_token`, `_onEvent`).

### Fixed
- **`xs:group ref` not resolved in content model** (`schema_parser_compositor.cpp`): `ProcessSequenceChildren`, `ProcessChoiceChildren`, and `ProcessAllChildren` now handle `<xs:group ref="..."/>` nodes by resolving the reference and processing the group's compositor content inline. Previously, group references were silently ignored, causing missing content model entries (e.g., `variable` only showing `variableId`, missing `timeSeriesSet` choice group).
- **Floating promise in Insert Required** (`editor-operations.ts`): `vscode.window.showErrorMessage` now prefixed with `void` operator to satisfy `@typescript-eslint/no-floating-promises`.

### Added — Phase 3d: Helper Panel Fixes & Enhancements
- **Panel placement in bottom panel** (`package.json`): Moved helper panels from Activity Bar sidebar to VS Code bottom panel area. Panels stay visible regardless of Activity Bar selection and can be dragged to secondary sidebar. Container id `xmlvisualeditor-helpers`, title `XML Helpers`.
- **Cursor focus for all 3 panels** (context F/G): Elements panel emits `onFocusedChildChanged` event with focused child info. Info and Attributes panels now show the focused child's details (not parent's) in context F/G, matching the design spec.
- **Context G cursor parser fix** (`xml-cursor-parser.ts`): Inside a closing tag (`</fold|er>`), the parser now returns the parent element as anchor and the closed element as `precedingSiblingName`, enabling proper focused child computation.
- **Insert Required mode** (`extension.ts`, `package.json`): Toggle `xmlVisualEditor.toggleInsertRequired` command in Elements panel title menu. When active, inserts element with all required children and attributes recursively populated with dummy values.
- **`helper.insertRequiredChildren` engine method** (`helper_data_service_insert.cpp`, `helper_handlers.cpp`): C++ engine method that recursively walks the content model, inserts required children, sets required attributes (enum[0] > default > ""), populates dummy text values by XSD type, and recurses into existing children. Max depth 5. New JSON-RPC method (21 total).
- **Refactored insert code** (`helper_data_navigation.h`, `helper_data_service_insert.cpp`): Extracted shared path navigation utilities and moved insert methods to separate file for maintainability.
- **Request timeout** (`engine-client.ts`): `sendRequest()` now has a 10-second timeout. Rejects promise and cleans up pending requests if engine doesn't respond.
- **Panel update cancellation** (all 3 panels): Generation counter pattern prevents stale results from overwriting newer data when cursor moves rapidly.
- **Attributes panel `showElementAttributes()`** (`attributes-panel.ts`): New method to display attributes for a specific element (used by focused child wiring).

### Changed
- **Simple insert behavior** (`extension.ts`): Rewritten `handleInsertElement()` inserts at cursor position with indentation matching. Without required attrs: `<name></name>` (cursor between tags). With required attrs: `<name />` (cursor before `/>` for attribute input).

### Added — Phase 3c (continued from previous session)
- **HelperDataService** (`core/include/xmlvisualeditor/services/helper_data_service.h`, `helper_data_service_impl.h`, `core/src/services/helper_data_service.cpp`): New C++ service combining SchemaService + DocumentService for panel-ready data. Computes content model trees with instance state (current_count, is_satisfied, is_exhausted, can_insert), choice branch detection (exclusive choices mark inactive branches as non-insertable), compositor context (parent compositor, preceding/following siblings, alternatives), attribute merging (schema definitions + document values), schema-ordered element insertion, and document path navigation with indexed segments (`child[2]`).
- **4 JSON-RPC helper methods** (`core/src/jsonrpc/helper_handlers.cpp`): `helper.getElementsPanelData` (content model tree + instance state), `helper.getAttributesPanelData` (attributes with is_set/current_value/enum_values), `helper.getNodeDetails` (enriched info + compositor context + instance state), `helper.insertElement` (schema-aware insertion returning updated document content). Total JSON-RPC API now 20 methods.
- **Shared table renderer** (`vscode-extension/src/shared/`): 3 new files ported from reference project — `schema-table-renderer.ts` (buildContentModelRows, getTableHtml with icons 🔹◇▶⊕, cardinality chips, compositor badges, instance-state styling), `schema-table-styles.ts` (VS Code theme variable CSS, node-type colors, state classes), `schema-table-scripts.ts` (expand/collapse, filter, insert, column toggles, state persistence)
- **Elements panel V2** (`vscode-extension/src/panels/elements-panel.ts`): Rewritten to use `helper.getElementsPanelData` with structured content model tree, compositor badges, insert buttons on `can_insert` rows, instance state styling (bold unsatisfied, 55% opacity exhausted, strikethrough inactive)
- **Attributes panel V2** (`vscode-extension/src/panels/attributes-panel.ts`): Rewritten with editable form — `<input>` for free text, `<select>` for enums, 🔒 for fixed values, indicators (🟢 required+set, 🔴 required+unset, ⚪ optional), remove buttons, bidirectional editing
- **Info panel V2** (`vscode-extension/src/panels/info-panel.ts`): Rewritten with collapsible `<details>` sections — Compositor Context (parent compositor, siblings, alternatives), Instance State (count, satisfied, can_insert, missing required), documentation, general info
- **Extension wiring** (`vscode-extension/src/extension.ts`): `handleInsertElement()` calling `helper.insertElement` with full document replacement, `applyAttributeEdit()` with regex-based tag modification, throttled `document.update` sync (300ms), element selection → info panel flow
- **HelperDataService tests** (`core/tests/unit/test_helper_data_service.cpp`): 6 Catch2 test cases covering elements panel data (content model nodes, cardinality, insert state), choice exclusion (active branch detection), empty content model, attributes panel data (enum values, required/optional, current values), node details (compositor context, instance state), and InsertElement (schema-ordered insertion). 143 assertions.

### Fixed
- **Choice group interpretation in BuildContentModelTree**: Fixed `BuildContentModelTree()` to correctly treat each name in a `choice_group` as a separate alternative (not a sequence). Previously, a choice with 3 direct element alternatives was incorrectly nested inside a sequence node, preventing choice exclusion logic from working.
- **Elements panel crash on simple-type elements**: `ComputeElementsPanelData` now returns an empty content model (with `content_complete=true`) for elements with simple types (e.g., `importType` with `type="string"`) instead of returning `nullopt`, which caused the JSON-RPC handler to throw `-32603 Internal error: Failed to compute elements panel data`.
- **Enum dropdowns not showing for union types**: `ProcessSimpleType` now resolves `memberTypes` attribute on `<xs:union>` (referenced member types), collecting enumerations from each member type. Previously only inline `<xs:simpleType>` children within `<xs:union>` were handled. Also added lazy type resolution in `GetEnumerationValues()` to trigger on-demand processing of named types not yet in the cache.
- **Document.update failing silently (attributes not picking up current values)**: `UpdateDocumentContent()` now creates a new document if the `doc_id` doesn't exist (upsert semantics), matching the VS Code extension's pattern of using `document.update` with `doc.uri.toString()` as the doc_id without a prior `document.open` call. Previously, the lookup failed and returned `false`, so `NavigateToElement()` never found the document and all `is_set`/`current_value` fields were empty.
- **Embedded choice groups split into separate nodes**: `BuildContentModelTree()` now correctly uses `choice_groups` metadata to group all alternatives of an embedded `<xs:choice>` within a `<xs:sequence>` into a single choice node. Previously, each single-element alternative got its own separate choice node because the grouping logic relied on `choice_path` identity, which is unique per branch.
- **Attributes/elements showing wrong element instance**: The cursor parser (`xml-cursor-parser.ts`) now tracks sibling indices and generates indexed paths like `timeSeriesSet[2]` for repeated siblings. Previously, the path was just element names (`['import', 'timeSeriesSet', 'timeStep']`) which always resolved to the first instance. Also fixed `fireIfChanged()` in `cursor-tracking-service.ts` to compare `elementPath` arrays, so moving between two elements with the same name (different paths) correctly triggers panel updates.
- **Document content not synced on file open**: `handleDocumentOpen()` in `extension.ts` now sends `document.update` with file content to the engine immediately after schema load, before panel refresh. Previously, `scheduleDocumentSync` only fired on `onDidChangeTextDocument` (user edits), so attributes showed "(not set)" until the user made an edit.
- **Schema auto-detection for HTTP URLs**: `resolveSchemaPath()` now handles `xsi:schemaLocation` with HTTP/HTTPS URLs by extracting the filename and looking for a local copy in the document's directory, instead of producing a garbage path via `path.resolve(docDir, httpUrl)`
- **Schema load failure silently ignored**: `ensureSchemaLoaded()` now checks the engine's `success` response field. Previously it stored the schemaId even when `schema.load` returned `{success: false}`, causing all panel queries to silently return empty results
- **Manual schema load not associated with document**: The `loadSchema` command now calls `associateSchemaWithDocument()` to link the loaded schema with the active XML document, so panels can find it. Previously, manual loads only validated but never updated `documentSchemas`
- **Panels not refreshing after schema load**: Added `forceRefresh()` to `CursorTrackingService` and call it after schema auto-detect and manual load. Added `schemaId` to cursor context deduplication so schema changes trigger panel updates
- **Duplicate element names across choice branches**: `flush_choice_group()` in `BuildContentModelTree()` now erases `by_name` map entries after `std::move`, so duplicate element names in different choice branches (e.g., `fileNamePatternFilter` in both folder-seq and server-seq) produce correct nodes instead of moved-from empty ones
- **Info panel content_complete always false**: `ComputeNodeDetails()` now computes `content_complete` and `missing_required` for the SELECTED element's own content model instead of the parent's. Leaf/simple-type elements correctly show `content_complete = true`
- **Enum values not shown in Info panel**: Added `enum_values` field to `NodeDetails` struct, populated via `SchemaService::GetEnumerationValues()`. TypeScript info panel now renders "Allowed Values" section with badge-styled enum values
- **Elements panel cursor position awareness**: Added `precedingSiblingName` tracking to cursor parser and cursor context. Elements panel now marks content model nodes as `before_cursor` (dimmed) and `cursor_adjacent` (focused highlight) based on cursor position between child elements (context F)
- **Insert button visible for unbounded before-cursor elements**: Removed the `before_cursor !== true` guard from insert button rendering and the CSS `display: none !important` rule. Unbounded elements (e.g., `timeSeriesSet` 0..∞) now show Insert buttons even when before the cursor, since they can still be inserted. Visual dimming (opacity 0.55) is preserved.
- **HTTP schema downloading with recursive import resolution**: `SchemaService` now downloads XSD schemas from HTTP/HTTPS URLs when no local copy exists. Downloads all `<xs:import>` and `<xs:include>` references recursively, saves to persistent cache (`globalStorageUri/schema-cache`), and loads from cache on subsequent opens. Uses Node.js built-in `http`/`https` modules with 30s timeout, redirect following, and progress notification.
- **Schema file not found warning**: When a referenced XSD file cannot be found locally and download fails, shows a warning message with the filename and guidance to use the "Load XSD Schema" command

## [0.7.0] — 2026-02-27

### Added
- **Cursor tracking service** (`vscode-extension/src/services/cursor-tracking-service.ts`): `CursorTrackingService` class that monitors cursor position in XML editors, 150ms debounce on selection changes, deduplication by elementName+cursorContext+currentAttribute, fires `onCursorContextChanged` events with full `CursorContext` (elementName, elementPath, cursorContext A–I, currentAttribute, schemaId, documentUri, documentText, cursorOffset)
- **XML cursor parser** (`vscode-extension/src/utils/xml-cursor-parser.ts`): Client-side XML text parsing for cursor context detection without engine calls. `getElementAtCursor(text, offset)` builds tag stack from 0 to offset, classifies position into 9 cursor contexts (A=start-tag name, B=post-name gap, C=attr name, D=attr value, E=empty content, F=between children, G=end-tag, H=text content, I=outside root). Handles self-closing tags, CDATA, comments, processing instructions
- **Elements panel** (`vscode-extension/src/panels/elements-panel.ts`): `ElementsPanelProvider` WebviewViewProvider showing allowed child elements of cursor element. Calls `schema.getAllowedChildren` + `schema.getElementInfo` per child (parallel) for cardinality display `[min..max]` with ∞ for unbounded, type names, 🔹 icons. Click fires `onElementSelected` event → Info panel. States: loaded, no-schema, no-element, engine-not-ready, error
- **Attributes panel** (`vscode-extension/src/panels/attributes-panel.ts`): `AttributesPanelProvider` WebviewViewProvider showing element attributes. Calls `schema.getAllowedAttributes`, extracts current values from document text via `extractAttributeValues()`. Table layout: required ●/optional ○ indicators, name, type, current value. Highlights currently-edited attribute row
- **Info panel** (`vscode-extension/src/panels/info-panel.ts`): `InfoPanelProvider` WebviewViewProvider showing element metadata. Calls `schema.getElementInfo`. Sections: Header with type badge, Documentation, General (type, cardinality), Details (namespace, abstract, nillable, substitution group, default, fixed). Dual mode: cursor-driven `update()` + click-driven `showElementInfo()`
- **Sidebar view container**: Added `xmlvisualeditor-sidebar` activity bar container with 3 webview views (`xmlvisualeditor.elementsPanel`, `xmlvisualeditor.attributesPanel`, `xmlvisualeditor.infoPanel`), conditional on `xmlvisualeditor.isXmlFileOpen` context
- **Panel synchronization**: Cursor context changes update all 3 panels. Elements panel selection updates Info panel. `isXmlFileOpen` context set on active editor change
- **Root `.prettierrc`**: Added root Prettier config matching `vscode-extension/.prettierrc` so files outside the extension directory can be formatted

### Fixed
- **Engine client `require('fs')`**: Replaced dynamic `require('fs')` with proper `import * as fs from 'fs'` top-level import, fixing ESLint `no-var-requires` error

### Changed
- **`extension.ts`**: Added imports and wiring for CursorTrackingService, ElementsPanelProvider, AttributesPanelProvider, InfoPanelProvider, WebviewViewProvider registration, panel synchronization events, `isXmlFileOpen` context management
- **`package.json`**: Added `viewsContainers.activitybar`, `views.xmlvisualeditor-sidebar` (3 panels), `onView:` activation events

## [0.6.0] — 2026-02-27

### Added
- **VS Code Extension scaffold** (`vscode-extension/`): Full TypeScript strict mode extension with ESLint/Prettier configuration, activation on XML language, 3 commands (`validateDocument`, `validateSchema`, `loadSchema`), and user-configurable settings (`enginePath`, `validateOnSave`, `validateOnOpen`)
- **Developer launch configuration** (`.vscode/`): `launch.json` with "Run Extension" extensionHost config (F5 to launch Extension Development Host with sample files), `tasks.json` with `compile-extension` pre-launch task, `settings.json` for workspace defaults
- **Engine client** (`vscode-extension/src/engine/engine-client.ts`): `EngineClient` class that spawns `xve-engine` as a child process, communicates via line-delimited JSON-RPC 2.0 over stdin/stdout, correlates requests/responses via incrementing integer IDs with Map-based promise tracking, monitors stderr for "Engine server ready" signal, auto-restarts on unexpected exit (max 3 attempts), and provides graceful shutdown
- **JSON-RPC protocol types** (`vscode-extension/src/engine/types.ts`): TypeScript interfaces for `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `Diagnostic`, `DocumentOpenResult`, `ValidationResult`, `ElementInfo`, `AttributeInfo`
- **Validation service** (`vscode-extension/src/services/validation-service.ts`): `ValidationService` class with `DiagnosticCollection` integration, well-formedness validation via `validation.validateWellFormedness`, schema validation via `validation.validateSchema`, debounced validation on document change (300ms), and diagnostic severity mapping (error/warning/info/hint)
- **Schema service** (`vscode-extension/src/services/schema-service.ts`): `SchemaService` class with XSD auto-detection from `xsi:noNamespaceSchemaLocation` and `xsi:schemaLocation` attributes (scans first 50 lines), relative/absolute path resolution, schema deduplication (same file loaded once), and engine `schema_id` correlation tracking
- **Extension activation** (`vscode-extension/src/extension.ts`): Full wiring of engine client, validation service, schema service, status bar item ("XVE: Ready/Starting/Error"), event handlers for document open/save/change/close, disposable lifecycle management
- **Test infrastructure**: Mocha test suite with `@vscode/test-electron`, test runner (`src/test/runTest.ts`), suite index (`src/test/suite/index.ts`)
- **Engine client tests** (`src/test/suite/engine-client.test.ts`): 4 tests covering `isReady()` state, JSON-RPC request formatting, error response rejection, partial line buffering, and concurrent request correlation with out-of-order responses
- **Schema service tests** (`src/test/suite/schema-service.test.ts`): 4 tests covering `noNamespaceSchemaLocation` detection with relative path resolution, `schemaLocation` namespace-pair parsing, absolute path passthrough, and missing schema reference handling
- **ESLint configuration** (`.eslintrc.json`): typescript-eslint with recommended + type-checking rules, naming conventions (camelCase default, PascalCase types, snake_case allowed for wire protocol properties), test file overrides for mocking
- **Prettier configuration** (`.prettierrc`): Single quotes, trailing commas, 100 char width, 2-space indent
- **Engine auto-detection**: `EngineClient.resolveEnginePath()` now auto-discovers `build/debug/core/Debug/xve-engine.exe` relative to workspace root during development, eliminating the need for manual path configuration

### Changed
- **package.json**: Updated to v0.3.0, added activation events (`onLanguage:xml`), contributes (commands, configuration), scripts (watch, lint:fix, format, format:check, pretest), devDependencies (eslint, prettier, typescript-eslint, mocha, glob, @vscode/test-electron)
- **tsconfig.json**: Added `forceConsistentCasingInFileNames`, `resolveJsonModule`, `declaration`, `declarationMap`, `include` pattern for test files

## [0.5.0] — 2026-02-27

### Added
- **Schema Validator** (`core/include/xmlvisualeditor/schema/schema_validator.h`, `core/src/schema/schema_validator.cpp`): `SchemaValidator::Validate()` validates XML against loaded XSD schemas via `ISchemaService`, producing rich diagnostics with line/column positions (via pugixml `offset_debug()`), element paths, and actionable error messages. Validates root elements, child element names, attribute presence/unknown, required elements/attributes, cardinality (minOccurs/maxOccurs), and text content (enumerations, string length restrictions).
- **ValidateAgainstSchema** method added to `IValidationService` / `ValidationServiceImpl`: schema-aware validation that auto-delegates to `SchemaValidator`, with `ISchemaService` dependency wired through `ServiceContainer`
- **8 JSON-RPC schema handlers** (`core/src/jsonrpc/schema_handlers.cpp`): `schema.load`, `schema.loadFromString`, `schema.unload`, `schema.getRootElements`, `schema.getElementInfo`, `schema.getAllowedChildren`, `schema.getAllowedAttributes`, `schema.getEnumerationValues`
- **`validation.validateSchema`** JSON-RPC method: full XSD validation returning diagnostics with line, column, message, severity, and element_path
- **`element_path`** field added to `Diagnostic` struct for richer error context
- **2 new Catch2 test files** (`test_schema_validator.cpp`, extended `test_jsonrpc_server.cpp`): 11 validator test cases covering valid XML, invalid root/child/attribute, missing required elements/attributes, cardinality violations, line/column tracking, element_path, malformed XML, and namespace attribute handling; 7 JSON-RPC schema handler tests (43 total test cases, 278 assertions)

### Fixed
- **schema_parser.cpp** (`FindXsdPrefix`/`XsdName`): Schema parser now correctly handles XSD schemas that use the default namespace (`xmlns="http://www.w3.org/2001/XMLSchema"`) instead of a prefixed namespace (`xmlns:xs=...`). Previously returned empty root elements and children for such schemas.
- **schema_parser.cpp** (`ParseSchema`): Added `xs:include` processing (Phase 0) — included XSD files are now loaded relative to the base schema directory, and their type/element definitions are merged into the parser's caches. Previously, types from included schemas (e.g. `sharedTypes.xsd`) were unknown, causing false "Unknown attribute" validation errors.
- **schema_validator.cpp** (`ValidateChildren`): Elements in `xs:choice` groups and `xs:sequence` groups within choices no longer produce false-positive "required element" errors. Choice members are now correctly exempted from individual `minOccurs` checks.
- **schema_parser_compositor.cpp** (`ProcessSequenceChildren`): Nested `<sequence minOccurs="0">` blocks now correctly propagate `minOccurs=0` to their child elements when flattened into the parent model.

### Changed
- **validation_service_impl.h**: Constructor now takes `ISchemaService*` in addition to `IDocumentService*`
- **service_container.cpp**: Passes `SchemaService` pointer to `ValidationServiceImpl` during initialization
- **method_handlers.cpp**: Added `element_path` to diagnostics JSON serialization; added `validation.validateSchema` handler
- **method_handlers.h**: Added `RegisterSchemaHandlers()` declaration
- **engine_main.cpp**: Registers schema handlers on startup
- **core/CMakeLists.txt**: Added `schema_validator.cpp`, `schema_handlers.cpp` sources and `test_schema_validator.cpp` test file

## [0.4.0] — 2026-02-27

### Added
- **Schema data model** (`core/include/xmlvisualeditor/schema/schema_types.h`): `ElementInfo`, `TypeInfo`, `AttributeInfo`, `ContentModelInfo`, `SequenceGroupInfo`, `RestrictionInfo` with support for enumerations, facets, choice groups, sequence groups, and type inheritance
- **XSD schema parser** (`core/include/xmlvisualeditor/schema/schema_parser.h`, `core/src/schema/schema_parser.cpp`, `core/src/schema/schema_parser_compositor.cpp`): Full XSD parser with `ParseString()`/`ParseFile()` factory methods, global/inline element processing, complex/simple type resolution, compositor handling (sequence/choice/all), extension/restriction inheritance, ref resolution, attribute extraction, and child element caching
- **SchemaService** (`core/include/xmlvisualeditor/services/schema_service_impl.h`, `core/src/services/schema_service.cpp`): `SchemaServiceImpl` with 14 query methods — `LoadSchema`, `UnloadSchema`, `GetElementInfo`, `GetContentModel`, `GetAllowedChildren`, `GetAllowedAttributes`, `GetTypeInfo`, `GetEnumerationValues`, `GetDocumentation`, `GetRootElements`, `GetOrderedChildren`, plus ServiceContainer integration
- **13 new Catch2 tests** (`test_schema_types.cpp`, `test_schema_parser.cpp`, `test_schema_service.cpp`): Schema type defaults, XSD parsing (library schema, choice groups, nested compositors, simple types, type extension, prefix handling, error handling), and SchemaService integration (41 total tests)

### Changed
- **core/CMakeLists.txt**: Added `schema_parser.cpp`, `schema_parser_compositor.cpp`, `schema_service.cpp` sources and 3 new test files
- **schema_service.h**: Expanded `ISchemaService` interface from stub to 14 query methods
- **service_container.cpp**: Added `SchemaService` accessor to `ServiceContainer`

## [0.3.0] — 2026-02-27

### Added
- **JSON-RPC types** (`core/include/xmlvisualeditor/jsonrpc/jsonrpc_types.h`, `core/src/jsonrpc/jsonrpc_types.cpp`): `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcErrorCode` enum, `ParseJsonRpcRequest()` with full JSON-RPC 2.0 validation
- **JSON-RPC server** (`core/include/xmlvisualeditor/jsonrpc/jsonrpc_server.h`, `core/src/jsonrpc/jsonrpc_server.cpp`): `JsonRpcServer` class with `RegisterMethod()`, `HandleRequest()`, `Run()` (stdin/stdout line-delimited protocol)
- **Method handlers** (`core/include/xmlvisualeditor/jsonrpc/method_handlers.h`, `core/src/jsonrpc/method_handlers.cpp`): 6 JSON-RPC methods — `document.open`, `document.openFromString`, `document.close`, `document.getContent`, `document.update`, `validation.validateWellFormedness`
- **Engine main** (`core/src/engine_main.cpp`): Fully wired JSON-RPC server with ServiceContainer initialization, handler registration, and server loop
- **22 new Catch2 tests** (`test_jsonrpc_types.cpp`, `test_jsonrpc_server.cpp`): JSON-RPC parsing, serialization, dispatch, error handling, and full method handler integration tests (33 total tests now)
- **Local toolchain paths** in cmake-build-system skill: CMake at VS BuildTools path, vcpkg at `C:\vcpkg`

### Changed
- **core/CMakeLists.txt**: Added `src/jsonrpc/method_handlers.cpp` source and 2 new test files

## [0.2.0] — 2026-02-27

### Added
- **Document model** (`core/include/xmlvisualeditor/core/document.h`, `core/src/core/document.cpp`): `Element` and `Document` classes wrapping pugixml with full navigation, mutation, attribute CRUD, namespace support, XPath-like path generation, and schema URL auto-detection (`xsi:noNamespaceSchemaLocation` / `xsi:schemaLocation`)
- **XML parsing & serialization**: `Document::ParseString()`, `Document::ParseFile()`, `Document::Create()`, `Document::ToString()`, `Document::SaveToFile()` with pretty-print support and round-trip fidelity
- **Service layer interfaces**: `IDocumentService`, `IFileService`, `IValidationService`, `ISchemaService` abstract base classes in `core/include/xmlvisualeditor/services/`
- **Service implementations**: `DocumentServiceImpl` (document lifecycle with counter-based IDs), `FileServiceImpl` (`std::filesystem` + `std::expected` error handling), `ValidationServiceImpl` (well-formedness checking via pugixml)
- **ServiceContainer**: Dependency injection container with `Initialize()`/`Shutdown()` lifecycle, pImpl pattern, typed service accessors
- **Version header**: `core/include/xmlvisualeditor/version.h` with `xve::version()` returning "0.1.0"
- **Catch2 test suite**: 11 tests covering document parsing, element navigation/mutation, attribute CRUD, schema detection, service lifecycle, file I/O, validation, and ServiceContainer
- **500-line file size limit**: Enforced across all agent definitions, skill files, coding standards, quality gates, and copilot instructions

### Changed
- **vcpkg.json**: Moved `catch2` and `benchmark` from `dev-dependencies` (unsupported) to `dependencies`
- **core/CMakeLists.txt**: Added `cxx_std_23` compile feature for `std::expected` support; replaced `placeholder.cpp` with 6 new source files

### Removed
- **core/src/placeholder.cpp**: Replaced by `version.cpp` and actual implementation modules

## [0.1.0] — 2026-02-27

### Added
- **Project scaffold**: CMakeLists.txt (root + core + cli + notepad-plus-plus), vcpkg.json, CMakePresets.json (debug/release/ci)
- **C++ core engine stubs**: `core/` with placeholder library, engine entry point, Catch2 test stub
- **VS Code extension stubs**: `vscode-extension/` with package.json, tsconfig.json, extension.ts
- **Notepad++ plugin stubs**: `notepad-plus-plus/` with plugin entry point
- **CLI stubs**: `cli/` with validate_main.cpp
- **Quality tooling**: .clang-format (Google, 120 chars), .clang-tidy, quality_check scripts (PS1 + sh)
- **CI/CD**: GitHub Actions workflow (.github/workflows/ci.yml) for multi-platform builds
- **9 agent definitions**: workflow-orchestrator, cpp-core-dev, vscode-ext-dev, npp-plugin-dev, test-writer, code-janitor, git-commit, adr-generator, ci-cd-expert
- **12 skill definitions**: architecture-guardrails, coding-standards, quality-gates, test-suite-guidelines, service-layer-usage, schema-aware-editing, xml-validation, cmake-build-system, multiplatform-targets, git-workflow, feature-development-protocol, ai-assistant-usage
- **Documentation**: ARCHITECTURE.md (full layer diagram), CODING_STANDARDS.md (C++20 + TypeScript), PROJECT_PLAN.md (6-phase roadmap), SKILLS.md (agent/skill reference table), NEXT_SESSION_PROMPT.md (Phase 1 flying start)
- **Copilot instructions**: .github/instructions/copilot-instructions.md with project context
- **License**: MIT (compatible with pugixml, nlohmann_json, Catch2, Google Benchmark)
- **Sample files**: XSD/XML test resources from Python reference project
- **.gitignore**: C++, CMake, vcpkg, VS Code, Node.js ignores

