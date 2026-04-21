/**
 * Inline toggle-icon emitters.
 *
 * Three glyphs, each returning a small HTML fragment:
 *   - ⊟ (U+229F) table-mode-ON — dropped into the leftmost gutter of
 *     the column-headers row of every `tableMode: ON` table.
 *   - ⊞ (U+229E) table-mode-OFF — dropped into the leftmost gutter of
 *     the TOP ELEMENT ROW of a table-candidate run currently rendered
 *     as a tree ladder. Always visible on every such run; selection
 *     does not gate this icon.
 *   - ⇆ (U+21C6) flip — dropped into the top-left corner cell
 *     (`grid-column: depth+2`, above the row-index column) of every
 *     `tableMode: ON` table.
 *
 * Every span carries BOTH the current class / data attributes
 * (`g-icon`, `g-tm-on` / `g-tm-off` / `g-flip`, `data-toggle-target` /
 * `data-flip-target`) AND the legacy attributes used by the existing
 * webview click delegation (`toggle-icon` class, `data-parent-node-id`,
 * `data-action`, `data-state`). Keeping the legacy attributes avoids
 * touching the mouse-bindings twin — the `.toggle-icon` selector in
 * `grid-view-webview-script.ts` continues to match.
 */

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Common attribute block shared by the three icon emitters. */
function commonAttrs(
  nodeId: string,
  action: 'toggle-table-mode' | 'toggle-flip',
  targetAttr: 'data-toggle-target' | 'data-flip-target',
  stateOn: boolean,
  ariaLabel: string,
): string {
  const pid = escapeAttr(nodeId);
  return (
    ` ${targetAttr}="${pid}"` +
    ` data-parent-node-id="${pid}"` +
    ` data-action="${action}"` +
    ` data-state="${stateOn ? 'on' : 'off'}"` +
    ` role="button"` +
    ` tabindex="0"` +
    ` aria-pressed="${stateOn}"` +
    ` aria-label="${escapeAttr(ariaLabel)}"` +
    ` title="${escapeAttr(ariaLabel)}"`
  );
}

/** ⊟ — table-mode ON. Always visible on every `tableMode: ON` node. */
export function emitTableModeOnIcon(nodeId: string): string {
  const label = 'Table-mode ON (click to collapse to tree)';
  return (
    `<span class="g-icon g-tm-on toggle-icon"` +
    commonAttrs(nodeId, 'toggle-table-mode', 'data-toggle-target', true, label) +
    '>\u229f</span>'
  );
}

/** ⊞ — table-mode OFF. Always emitted on every table-candidate run
 *  currently rendered as a tree ladder. */
export function emitTableModeOffIcon(nodeId: string): string {
  const label = 'Table-mode OFF (click to show as table)';
  return (
    `<span class="g-icon g-tm-off toggle-icon"` +
    commonAttrs(nodeId, 'toggle-table-mode', 'data-toggle-target', false, label) +
    '>\u229e</span>'
  );
}

/** ⇆ — flip rows/columns. Always visible on every `tableMode: ON` node.
 *  `flipped` controls `data-state` + aria-pressed so the click handler
 *  can compute the new value as `!current`. */
export function emitFlipIcon(nodeId: string, flipped: boolean): string {
  const label = flipped
    ? 'Flip rows/columns: ON (click to restore)'
    : 'Flip rows/columns: OFF (click to transpose)';
  return (
    `<span class="g-icon g-flip toggle-icon"` +
    commonAttrs(nodeId, 'toggle-flip', 'data-flip-target', flipped, label) +
    '>\u21c6</span>'
  );
}
