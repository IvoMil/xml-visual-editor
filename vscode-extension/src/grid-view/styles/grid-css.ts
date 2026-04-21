/**
 * Grid webview static CSS.
 *
 * Extracted from grid-view-panel.ts to keep that file under the 500-line
 * cap. The panel concatenates this string with GRID_THEME_CSS (CSS vars)
 * and dynamically-generated depth rules inside the <style> element.
 */
export const GRID_STATIC_CSS = `
html, body {
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
  background: var(--grid-bg);
  color: var(--grid-fg);
  font-family: var(--grid-font-family);
  font-size: var(--grid-font-size);
}
.grid-root { display: grid; row-gap: 0; column-gap: 1px; align-content: start; background-color: var(--grid-border); --indent: 20px; padding: 4px 8px; user-select: none; border: 1px solid var(--grid-border); min-width: min-content; }
.grid-empty { display: flex; align-items: center; justify-content: center; height: 100vh; opacity: 0.6; }
.g-row { display: contents; }
/* Structural (read-only scaffolding) cells: indent, name, chevron gutters,
   collapsed summaries, # row-ids, and headers. Shaded to distinguish
   from editable data cells. Because backgrounds are per-cell (not on
   the grid-root), horizontal scroll preserves the editable/structural
   distinction column-by-column — no extra sticky styling needed. */
.g-indent { background-color: var(--grid-structural-bg); min-width: var(--indent); }
/* Tree guide ("expansion bar"): Option B. With row-gap: 0, adjacent
   indent cells stack without a gap; drawing the guide as a background
   gradient on each cell yields a CONTINUOUS vertical stripe down the
   entire visible subtree of each expanded ancestor. The gradient
   layers on top of the structural background-color and draws the
   stroke centred at x=10px of the 20px indent track.

   Chevron/guide alignment: a parent's chevron sits in its name cell,
   and its descendants' indent cells share that same grid column. To
   keep the guide centred on the chevron, .c-name padding-left is 3px
   so the 14px-wide .expand-toggle is centred at x=3+7=10px — exactly
   the guide centre. Changing either value breaks alignment.

   Width decision: the VS Code Explorer spec is 1px, but a 1px stripe
   inside a webview at typical DPI renders as a faint hairline (user
   feedback). We use 2px (spanning x=9px → x=11px) for visibility
   while remaining subtle.

   Colour decision: we keep the --vscode-tree-indentGuidesStroke
   token as the primary token, but bump the fallback alpha from
   0.4 → 0.75 so the guide is clearly visible when the token is
   absent (tests, headless renders). Indent cells deliberately omit a
   bottom border so the stripe is uninterrupted between rows. */
.g-indent[data-ancestor-expanded="1"] {
  background-image: linear-gradient(to right, transparent 0, transparent 9px, var(--vscode-tree-indentGuidesStroke, rgba(127,127,127,0.75)) 9px, var(--vscode-tree-indentGuidesStroke, rgba(127,127,127,0.75)) 11px, transparent 11px, transparent 100%);
}
/* Row separator: 1px border-bottom on non-indent cells gives a
   continuous horizontal rule across editable/structural columns
   without interrupting the indent-column tree guide. */
.g-cell, .t-cell, .t-rowid { border-bottom: 1px solid var(--grid-border); }
.g-row > .c-name { background-color: var(--grid-structural-bg); padding-left: 3px; padding-right: 4px; padding-top: 2px; padding-bottom: 2px; display: flex; align-items: center; white-space: nowrap; cursor: default; overflow: hidden; text-overflow: ellipsis; }
/* Default value cell is structural (e.g. summary / empty). Editable
   value cells opt in via .g-editable, which sits on top of the
   default selector via the more specific combined class. */
.g-row > .c-value { background-color: var(--grid-structural-bg); padding: 2px 8px; white-space: nowrap; cursor: default; overflow: hidden; text-overflow: ellipsis; }
.g-row > .c-value.g-editable { background-color: var(--grid-bg); }
/* Expandable name cells: subtle hover + pointer cursor so users learn
   which structural cells respond to click / Enter / +/-. */
.g-row > .c-name:has(.expand-toggle) { cursor: pointer; }
.g-row > .c-name:has(.expand-toggle):hover { background-color: var(--grid-structural-hover-bg); }
.g-row:hover > .c-name,
.g-row:hover > .c-value,
.g-row:hover > .c-value.g-editable,
.g-row:hover > .t-cell,
.g-row:hover > .t-cell.g-editable,
.g-row:hover > .t-rowid,
.g-row:hover > .c-comment-icon,
.g-row:hover > .c-comment-text { background-color: var(--grid-hover-bg); }
.g-row.selected > .c-name,
.g-row.selected > .c-value,
.g-row.selected > .c-value.g-editable,
.g-row.selected > .t-cell,
.g-row.selected > .t-cell.g-editable,
.g-row.selected > .t-rowid { background-color: var(--grid-selection-bg); color: var(--grid-selection-fg); }
.g-row.selected > .g-indent { background-color: var(--grid-structural-bg); color: inherit; }
/* B.6 post-verification fix: comment rows need their own selection rule
   because the cells are .c-comment-icon / .c-comment-text, not .c-name /
   .c-value. Reuse the same selection background token so the row is
   clearly highlighted. Italic styling is preserved by CSS cascade — we
   only override background and foreground. .g-indent cells on comment
   rows stay structural (handled by the rule above). */
.g-row.r-comment.selected > .c-comment-icon,
.g-row.r-comment.selected > .c-comment-text { background-color: var(--grid-selection-bg); color: var(--grid-selection-fg); }
.g-row.r-attr > .c-value { opacity: 0.7; }
.g-row.r-elem > .c-value, .g-row.r-tree > .c-value { opacity: 0.8; }
.g-row.r-tregion-label > .c-name { font-weight: 600; }
.g-row.r-text > .c-name { opacity: 0.8; }
/* Round B.2: XML comment pseudo-rows. Italic + muted colour via the
   standard VS Code description token; icon cell uses the same token
   at reduced opacity. Backgrounds deliberately omitted so the 1px
   column-gap/row-gap grid lines from .grid-root show through. */
.g-row.r-comment > .c-comment-icon { color: var(--vscode-descriptionForeground); opacity: 0.7; padding: 2px 4px; white-space: nowrap; }
.g-row.r-comment > .c-comment-text { font-style: italic; color: var(--vscode-descriptionForeground); padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Chevron size unification (Round 8 Bug O): every chevron in the grid
   — tree rows, element-label rows inside drill-boxes, table-cell
   chevrons (.cell-toggle), and segment-header toggle arrows — shares
   the smaller font-size: 10px metric previously only applied to the
   in-cell .cell-toggle variant. Width/height/margin chosen so the
   14px-wide hit target stays aligned with the depth-guide centreline
   documented above. The .cell-toggle rule below is now a no-op style
   passthrough but kept as a semantic marker class for JS selectors
   such as querySelectorAll('.expand-toggle.cell-toggle'). */
.expand-toggle { display: inline-flex; width: 14px; height: 16px; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-right: 2px; font-size: 10px; }
.expand-spacer { display: inline-block; width: 18px; flex-shrink: 0; }
.mixed-summary { display: inline-flex; align-items: center; gap: 6px; opacity: 0.85; }
.mixed-summary .ms-attr { display: inline-flex; gap: 2px; }
.mixed-summary .ms-attr-name { font-style: italic; color: var(--grid-attribute-icon-color); }
.mixed-summary .ms-attr-value { opacity: 0.8; }
.mixed-summary .ms-text { }
.node-icon { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; margin-right: 4px; font-size: 10px; font-weight: bold; border-radius: 2px; flex-shrink: 0; }
.element-icon { color: var(--grid-element-icon-color); }
.attribute-icon { color: var(--grid-attribute-icon-color); }
.text-icon { color: var(--grid-fg); opacity: 0.7; font-style: italic; width: auto; min-width: 20px; padding: 0 2px; }
.node-name { margin-right: 8px; font-weight: 500; }
.attr-name { font-style: italic; }
.node-value { opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }
.sibling-index { opacity: 0.5; font-size: 0.85em; }
.child-count { opacity: 0.5; font-size: 0.85em; }
.t-cell { background-color: var(--grid-structural-bg); padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-cell.g-editable { background-color: var(--grid-bg); }
.t-header > .t-th { font-weight: 600; background-color: var(--grid-header-bg); }
.t-rowid { background-color: var(--grid-header-bg); font-weight: 600; text-align: right; padding-right: 6px; }
.attr-col-header { color: var(--grid-attribute-icon-color); }
.elem-col-header { color: var(--grid-element-icon-color); }
/* B.1.h — column-axis selection highlight. Column-header cells (the
   .g-col-header cells inside the .g-col-headers row in unflipped view,
   and the leading label cell of each flipped row) carry a stronger
   .column-selected background matching the row-selection token so the
   header reads as "this column is selected". Data cells belonging to a
   selected column carry the softer selectionHighlight token. */
.g-col-header { cursor: pointer; }
.g-col-header.column-selected { background-color: var(--grid-selection-bg); color: var(--grid-selection-fg); }
.t-cell.column-selected { background-color: var(--vscode-editor-selectionHighlightBackground, var(--grid-selection-bg)); }
/* Drill-box wrapper — a self-contained grid item in the outer
   .grid-root that hosts a chevron host's full subtree. The wrapper
   lives at a bounded grid-column (the host column track) and carries
   its own inline display:grid + grid-template-columns so the inner
   subtree renders independently of the outer column layout.

   Visual affordance: a subtle 1px left-border gives the drill-down a
   distinct box shape matching the reference design, and row-gap 0
   inside keeps the inner table flush with the group label row. */
.g-drill-box {
  background-color: var(--grid-bg);
  border-left: 1px solid var(--grid-border);
  row-gap: 0;
  padding: 0;
}
/* Column-axis paint inside a drill-box. The JS paint loop stamps
   .column-selected on the wrapper (it carries data-cell-column-id);
   the descendant rule catches every name / value / table cell inside
   so column paint reaches the full drilled-down block. Softer
   selectionHighlight token matches the .t-cell.column-selected rule. */
.g-drill-box.column-selected,
.g-drill-box.column-selected .g-cell,
.g-drill-box.column-selected .t-cell,
.g-drill-box.column-selected .t-rowid,
.g-drill-box.column-selected .g-indent {
  background-color: var(--vscode-editor-selectionHighlightBackground, var(--grid-selection-bg));
}
/* Colour semantics — intentional gray vs blue distinction:
    - Row-axis selection (.g-row.selected) paints with --grid-selection-bg
      (typically the stronger editor/list selection BLUE) because row
      selection is the primary interaction surface for keyboard nav,
      clipboard, and helper-panel sync.
    - Column-axis selection (.t-cell.column-selected) paints with the
      softer --vscode-editor-selectionHighlightBackground (typically a
      subtle GRAY) so that a selected column reads as "highlighted, not
      focused" — distinct from the active row selection and harmless to
      layer behind a row selection without fighting for visual weight.
    When both axes are selected, the row colour wins on the row-selected
    cells because .selected rules are more specific than the class-only
    .column-selected variant. */
/* Standalone selected table-cell (no .g-row.selected parent). Used by
   flipped-view numeric header cells that carry data-row-click-id: when
   the underlying original row is in the row-axis selection, the header
   cell lights up with the full row-selection colour so the user can
   see which visual column corresponds to the selected row. */
.t-cell.selected { background-color: var(--grid-selection-bg); color: var(--grid-selection-fg); }
.cell-toggle { font-size: 10px; cursor: pointer; margin-right: 2px; }
.cell-elem-name { font-weight: 500; margin-right: 4px; color: var(--grid-element-icon-color); }
.cell-attr-summary { opacity: 0.6; }
.cell-nv { display: grid; grid-template-columns: auto 1fr; gap: 0 4px; margin-top: 2px; }
.cell-nv-name { opacity: 0.8; }
.cell-nv-value { opacity: 0.7; }
.complex-content { opacity: 0.5; font-style: italic; }
/* B.1.g - inline toggle icons (supersedes the B.1.d .r-toggle-strip row). */
.g-icon { cursor: pointer; user-select: none; display: inline-block; min-width: 1em; text-align: center; line-height: 1; padding: 0 2px; }
.g-tm-on, .g-tm-off { color: var(--vscode-icon-foreground, currentColor); }
.g-flip-corner { display: flex; align-items: center; justify-content: center; }
.toggle-icon { background: transparent; color: var(--grid-fg); border: 1px solid var(--grid-border); border-radius: 3px; padding: 0 6px; cursor: pointer; font-size: 11px; line-height: 16px; height: 18px; opacity: 0.75; }
.toggle-icon:hover { opacity: 1; background-color: var(--grid-hover-bg); }
.toggle-icon[aria-pressed="true"] { opacity: 1; background-color: var(--grid-selection-bg); color: var(--grid-selection-fg); }
#grid-container {
  position: absolute;
  inset: 0;
  padding: 8px;
  overflow: auto;
  box-sizing: border-box;
}
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  opacity: 0.6;
}
`;
