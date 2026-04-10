/**
 * CSS styles for schema tables — used by Elements panel V2 and shared renderers.
 * Ported from reference project with VS Code theme variable integration.
 */

export interface SchemaTableColors {
  tagColor?: string;
  attrColor?: string;
}

export function getStyles(colors?: SchemaTableColors): string {
  const tagColor = colors?.tagColor ?? '#569CD6';
  const attrColor = colors?.attrColor ?? '#9CDCFE';
  return `:root { --indent: 20px; --xve-tag-color: ${tagColor}; --xve-attr-color: ${attrColor}; }
* { box-sizing:border-box; margin:0; padding:0; }
body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  overflow-x: auto;
}
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { position: sticky; top: 0; z-index: 5;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  text-align: left; padding: 4px 8px;
  border-bottom: 2px solid var(--vscode-editorWidget-border, #555);
  font-weight: 600; white-space: nowrap; }
th.col-name { width: 48%; } th.col-doc { width: 36%; } th.col-type { width: 16%; }
.col-name-inner { display: flex; align-items: center; gap: 4px; }
.header-title { flex: 1; }
.header-actions { display: flex; gap: 2px; margin-left: auto; }
.header-btn {
  background: transparent;
  border: 1px solid var(--vscode-editorWidget-border, #444);
  color: var(--vscode-foreground, #ccc);
  font-size: 14px;
  width: 22px; height: 22px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 3px;
  padding: 0;
  line-height: 1;
}
.header-btn:hover {
  background: var(--vscode-toolbar-hoverBackground, #5a5d5e50);
}
td { padding: 2px 8px; vertical-align: top;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
td.cell-doc { white-space: normal; }
tr.schema-row { cursor: pointer; scroll-margin-top: 80px; }
tr.schema-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
tr.schema-row.selected { background: var(--vscode-list-activeSelectionBackground, #094771);
  color: var(--vscode-list-activeSelectionForeground, #fff); }
tr.schema-row.hidden-row { display: none; }
.node-name { display: inline-flex; align-items: center; gap: 4px; }
.arrow { display: inline-block; width: 16px; text-align: center; user-select: none; transition: transform 0.12s;
  color: var(--vscode-foreground, #ccc); font-size: 10px; }
.arrow.expanded { transform: rotate(90deg); } .arrow.leaf { visibility: hidden; }
.icon { width: 16px; text-align: center; flex-shrink: 0; }
.icon.nt-element { font-weight: 700; font-size: 11px; color: var(--vscode-foreground, #ccc); }
.badge { font-size: 10px; opacity: 0.7; margin-left: 2px; color: var(--vscode-descriptionForeground, #888); }
.nt-element { color: var(--xve-tag-color, #4EC9B0); }
.nt-attribute { color: var(--vscode-symbolIcon-propertyForeground, #e6a855); } .nt-choice { color: var(--vscode-descriptionForeground, #888); }
.nt-sequence { color: var(--vscode-descriptionForeground, #888); } .nt-all { color: var(--vscode-descriptionForeground, #888); }
.required { font-weight: 700; } .optional-attr { font-style: italic; opacity: 0.85; }
body.hide-doc .col-doc, body.hide-doc .cell-doc { display: none; }
body.hide-type .col-type, body.hide-type .cell-type { display: none; }
.unsatisfied { font-weight: 700; }
.insert-action { display: none; padding: 1px 6px; margin-left: 4px; font-size: 11px; cursor: pointer;
  background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff);
  border: none; border-radius: 2px; }
tr.schema-row:hover .insert-action { display: inline-block; }
.cardinality-chip { font-size: 10px; padding: 0 4px; margin-left: 4px; border-radius: 8px;
  background: var(--vscode-badge-background, #4d4d4d); color: var(--vscode-badge-foreground, #ccc); }
.compositor-badge { font-size: 10px; opacity: 0.7; margin-left: 2px;
  color: var(--vscode-descriptionForeground, #888); font-style: italic; }
.filter-bar { position: sticky; top: 0; z-index: 11; padding: 4px 8px;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-editorWidget-border, #444); }
.filter-bar input { width: 100%; padding: 3px 6px;
  background: var(--vscode-input-background, #3c3c3c); color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--vscode-input-border, #555); border-radius: 2px; font-size: 12px; outline: none; }
.filter-bar input:focus { border-color: var(--vscode-focusBorder, #007acc); }
.filter-bar input::placeholder { color: var(--vscode-input-placeholderForeground, #888); }
.empty-state { padding: 16px; text-align: center; color: var(--vscode-descriptionForeground, #888); font-style: italic; }
body.filter-visible th { top: 33px; }
tr.schema-row.filtered-out { display: none; }
tr.schema-row.exhausted-row .insert-action { display: none !important; }
tr.schema-row.before-cursor { opacity: 0.55; }
tr.schema-row.before-cursor.cursor-adjacent { opacity: 1; }
tr.schema-row.before-cursor .insert-action { display: none !important; }
tr.schema-row.before-cursor.cursor-adjacent:hover .insert-action { display: inline-block !important; }
.exhausted-indicator, .active-branch-indicator { color: var(--vscode-testing-iconPassed, #73c991); margin-left: 4px; font-size: 11px; }
.inactive-branch { opacity: 0.4; text-decoration: line-through; }
.focused-child { background: var(--vscode-list-activeSelectionBackground, #094771);
  color: var(--vscode-list-activeSelectionForeground, #fff); }
tr.schema-row.focused-child .nt-element,
tr.schema-row.focused-child .nt-choice,
tr.schema-row.focused-child .nt-sequence,
tr.schema-row.focused-child .nt-all,
tr.schema-row.focused-child .badge,
tr.schema-row.focused-child .compositor-badge,
tr.schema-row.focused-child .cardinality-chip,
tr.schema-row.selected .nt-element,
tr.schema-row.selected .nt-choice,
tr.schema-row.selected .nt-sequence,
tr.schema-row.selected .nt-all,
tr.schema-row.selected .badge,
tr.schema-row.selected .compositor-badge,
tr.schema-row.selected .cardinality-chip {
  color: var(--vscode-list-activeSelectionForeground, #fff);
}
tr.schema-row.focused-child .cardinality-chip,
tr.schema-row.selected .cardinality-chip {
  background: rgba(255,255,255,0.15);
  color: var(--vscode-list-activeSelectionForeground, #fff);
}
.enum-values { padding: 8px 12px; }
.enum-header { font-weight: 600; margin-bottom: 6px; color: var(--vscode-editor-foreground); }
.enum-value { padding: 2px 4px; font-size: 12px; display: flex; align-items: center; gap: 6px;
  color: var(--vscode-editor-foreground); border-radius: 2px; }
.enum-value.selected { background: var(--vscode-list-activeSelectionBackground, #094771);
  color: var(--vscode-list-activeSelectionForeground, #fff); font-weight: 600; }
.enum-ind-set { color: var(--vscode-testing-iconPassed, #73c991); font-size: 10px; }
.enum-ind { color: var(--vscode-descriptionForeground, #888); font-size: 10px; }`;
}
