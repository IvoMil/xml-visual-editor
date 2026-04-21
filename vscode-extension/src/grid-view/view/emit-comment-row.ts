import { GridNode } from '../model/grid-node';

/** Minimal HTML escaping mirror of GridRenderer.escapeHtml (kept local to
 *  avoid exporting internals from GridRenderer). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Emit D empty indent cells at grid-columns 1/2 .. D/(D+1). Matches the
 *  private helper in GridRenderer so comment rows align with sibling
 *  element rows column-for-column. */
function indentCells(depth: number): string {
  let html = '';
  for (let k = 1; k <= depth; k++) {
    html += `<span class="g-indent" data-ancestor-expanded="1" style="grid-column: ${k} / ${k + 1};"></span>`;
  }
  return html;
}

/** Emit an XML-comment pseudo-row into `rows`.
 *
 *  Layout (see DESIGN_GRID_ALIGNMENT.md):
 *    - Leading `g-indent` chain for columns 1..depth (same as sibling
 *      elements, so vertical grid lines line up).
 *    - A `.c-comment-icon` cell in the chevron/name track at
 *      (depth+1)/(depth+2). Glyph is the XML comment opener `<!--`,
 *      chosen because it is unambiguous, ASCII-only, and does not rely
 *      on a Unicode font being present in the webview.
 *    - A `.c-comment-text` cell that stretches from (depth+2) to `-1`,
 *      so the comment text spans all remaining columns without
 *      introducing any new column tracks (Requirement 2).
 *
 *  The row is explicitly NOT editable (no `.g-editable`) and NOT
 *  expandable (no chevron / expand-toggle). It carries the standard
 *  `data-node-id` attribute for DOM lookup / selection-restore, plus
 *  `data-node-type="comment"` so the keyboard navigation helper can
 *  filter comment rows out of the selectable-node list (see
 *  `grid-view-panel.ts`).
 */
export function emitCommentRow(
  node: GridNode,
  depth: number,
  rows: string[],
): void {
  const iconGridCol = `${depth + 1} / ${depth + 2}`;
  const textGridCol = `${depth + 2} / -1`;
  rows.push(
    `<div class="g-row r-comment d-${depth}"` +
      ` data-node-id="${escapeAttr(node.nodeId)}"` +
      ` data-node-type="comment"` +
      ` data-depth="${depth}"` +
      ` style="--depth: ${depth}">` +
      indentCells(depth) +
      `<span class="g-cell c-comment-icon" style="grid-column: ${iconGridCol};">&lt;!--</span>` +
      `<span class="g-cell c-comment-text" style="grid-column: ${textGridCol};">${escapeHtml(node.value)}</span>` +
      '</div>',
  );
}
