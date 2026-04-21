/**
 * Tree-ladder OFF icon injection.
 *
 * When a hybrid table-candidate run is rendered as a tree ladder
 * (because tableMode is OFF for the parent), the ⊞ icon sits in the
 * gutter column immediately to the left of the element name axis, on
 * the FIRST BODY ROW of the FIRST run member — i.e. the same visual
 * column the ⊟ icon occupies in tableMode:ON, but one row LOWER so
 * the icon appears alongside the first attribute / child row of
 * item[1], not on the item header row itself.
 *
 * Subsequent run members paint an EMPTY gutter cell on their own
 * first-body row at the same grid track, keeping the gutter column
 * visually continuous down the run. The icon is placed once; the
 * carryover cells are purely for alignment.
 *
 * Each body row inside the run already emits an indent cell at
 * `grid-column: childDepth+1 / childDepth+2` (since run members
 * render their body at `childDepth + 2` via bodyDepthShift=1 — two
 * indent levels below the header). We REPLACE that existing indent
 * cell with either the icon-bearing gutter cell or an empty gutter
 * cell so the column track carries the intended visual without
 * shifting any name or value cells.
 *
 * Attribute, text, comment and deeper-nested rows inside the run
 * keep every other aspect unchanged. Scanning stops on the first
 * row whose `data-depth` is strictly less than `childDepth` — that
 * marks the end of the parent's subtree.
 */
import { emitTableModeOffIcon } from './emit-toggle-icons';

/** Path-based parent lookup for XPath-style nodeIds. Returns undefined
 *  for top-level ids (`/root[1]` and above) or attribute ids below the
 *  document root. */
export function parentIdFromNodeId(nodeId: string): string | undefined {
  const at = nodeId.lastIndexOf('/');
  if (at <= 0) return undefined;
  return nodeId.substring(0, at);
}

/** Read the `data-depth="N"` attribute from an emitted row. Returns
 *  `undefined` when the row does not carry a depth attribute. */
function readDepth(row: string): number | undefined {
  const m = row.match(/data-depth="(\d+)"/);
  return m ? Number(m[1]) : undefined;
}

/** Replace the indent cell at the gutter column of `row` with a new
 *  span (icon-bearing or empty). Returns the row unchanged when no
 *  indent cell is found at that exact column (defensive). */
function replaceGutterIndent(row: string, childDepth: number, replacement: string): string {
  const existing =
    `<span class="g-indent" data-ancestor-expanded="1"` +
    ` style="grid-column: ${childDepth + 1} / ${childDepth + 2};"></span>`;
  const at = row.indexOf(existing);
  if (at === -1) return row;
  return row.substring(0, at) + replacement + row.substring(at + existing.length);
}

/** Inject the tree-ladder OFF icon onto the first body row of the run
 *  and paint an empty gutter cell on every other body row of every
 *  run member so the gutter column stays visually continuous.
 *
 *  A body row is any row whose `data-depth` equals `childDepth + 1`
 *  AND whose nearest preceding element row at `data-depth ===
 *  childDepth` is a run member (or a unique sibling — both get painted
 *  for visual consistency).
 *
 *  Scanning stops once we leave the parent's subtree (a row at
 *  `data-depth < childDepth`). If the run has no body rows at all
 *  (every member is a collapsed non-leaf or a leaf with no body),
 *  no gutter cell is painted. */
export function injectTableModeOffIcon(
  rows: string[],
  fromIdx: number,
  parentNodeId: string,
  childDepth: number,
): void {
  const iconHtml = emitTableModeOffIcon(parentNodeId);
  const gutterCol = `grid-column: ${childDepth + 1} / ${childDepth + 2};`;
  const gutterWithIcon =
    `<span class="g-indent g-tm-off-gutter" data-ancestor-expanded="1"` +
    ` style="${gutterCol}">${iconHtml}</span>`;
  const gutterEmpty =
    `<span class="g-indent" data-ancestor-expanded="1"` +
    ` style="${gutterCol}"></span>`;

  let iconPlaced = false;
  // True while we are inside the body of a run-member (or unique
  // sibling) at depth childDepth. Cleared whenever we see a row at a
  // depth less than or equal to childDepth that is not another
  // member header.
  let inMemberBody = false;
  const depthMarker = ` d-${childDepth}"`;
  for (let i = fromIdx; i < rows.length; i++) {
    const row = rows[i];
    const depth = readDepth(row);
    if (depth !== undefined && depth < childDepth) break;

    // Element header row at childDepth → start of a new member body.
    if (
      depth === childDepth &&
      row.includes('data-node-type="element"') &&
      row.includes(depthMarker)
    ) {
      inMemberBody = true;
      continue;
    }

    // Any other row at depth <= childDepth ends the current body span.
    if (depth !== undefined && depth <= childDepth) {
      inMemberBody = false;
      continue;
    }

    // Body row at childDepth + 1 — paint the gutter cell (icon on
    // the very first row, empty on every other).
    if (inMemberBody && depth === childDepth + 1) {
      const replacement = iconPlaced ? gutterEmpty : gutterWithIcon;
      rows[i] = replaceGutterIndent(row, childDepth, replacement);
      iconPlaced = true;
    }
  }
}
