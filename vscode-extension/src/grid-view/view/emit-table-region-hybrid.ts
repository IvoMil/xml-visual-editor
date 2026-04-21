import { GridNode } from '../model/grid-node';
import { GridSelectionModel } from '../model/grid-selection';
import { GridTableRunUnion } from '../grid-view-types';
import { ToggleState } from '../model/toggle-state';
import { attrColumnId, elemColumnId } from '../model/grid-selection-entry';
import { emitCommentRow } from './emit-comment-row';
import {
  axisClassSuffix,
  columnHeaderSelectedSuffix,
  resolveCellAxisClass,
} from './emit-cell-selection';
import { emitFlipIcon, emitTableModeOnIcon } from './emit-toggle-icons';
import {
  HybridColumn,
  deriveColumnsFromUnion,
  deriveHybridColumns,
  emitHybridHeader,
  renderChevronCell,
  renderFlippedChevronCell,
  resolveCell,
} from './emit-hybrid-helpers';

/** Callback that wraps a chevron host's subtree in a self-contained
 *  `<div class="g-drill-box">` grid item and appends it to `rows`. The
 *  wrapper carries its own `display: grid` template so the subtree
 *  renders independently of the outer grid's column tracks. Exactly
 *  one item is appended per call. */
export type RenderDrillBox = (
  host: GridNode,
  gridColumn: string,
  parentRowId: string,
  hostColumnId: string,
  rows: string[],
) => void;

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

function indentCells(depth: number): string {
  let html = '';
  for (let k = 1; k <= depth; k++) {
    html += `<span class="g-indent" data-ancestor-expanded="1" style="grid-column: ${k} / ${k + 1};"></span>`;
  }
  return html;
}

/** Re-stamp every inline `style="grid-column: …"` attribute inside a
 *  pre-rendered indent-cell block with the given extra CSS so the
 *  indent cells reserve the whole drill-down block height. */
function applySpanToCells(indentHtml: string, extraStyle: string): string {
  if (!extraStyle) return indentHtml;
  return indentHtml.replace(
    /(style="grid-column: \d+ \/ \d+;)(")/g,
    (_m, p1, p2) => `${p1}${extraStyle}${p2}`,
  );
}

/** Header-row indent cells with the tableMode-ON (⊟) icon injected
 *  into the leftmost gutter cell. */
function headerIndentCellsWithModeIcon(depth: number, parentNodeId: string): string {
  let html = indentCells(depth);
  const iconCol = `${depth + 1} / ${depth + 2}`;
  html +=
    `<span class="g-indent g-tm-on-gutter" data-ancestor-expanded="1"` +
    ` style="grid-column: ${iconCol};">${parentNodeId ? emitTableModeOnIcon(parentNodeId) : ''}</span>`;
  return html;
}

/** Top-left corner cell of a tableMode:ON table — carries the flip
 *  (⇆) icon in place of the plain "#" row-id label. */
function flipCornerCell(
  rowidCol: string,
  parentNodeId: string,
  flipped: boolean,
): string {
  const icon = parentNodeId ? emitFlipIcon(parentNodeId, flipped) : '#';
  return `<span class="t-cell t-rowid g-flip-corner" style="grid-column: ${rowidCol};">${icon}</span>`;
}

/** Emit an UNFLIPPED hybrid table region: K data cols, N data rows,
 *  chevron cells inject a `.g-drill-box` wrapper per expanded host
 *  immediately after the data row. */
function emitHybridUnflipped(
  nodes: readonly GridNode[],
  cols: readonly HybridColumn[],
  depth: number,
  rows: string[],
  renderDrillBox: RenderDrillBox,
  parentNodeId: string,
  selection: GridSelectionModel | undefined,
  iconKey: string,
  _toggleState: ToggleState | undefined,
): void {
  const rowidCol = `${depth + 2} / ${depth + 3}`;
  const tableIndent = indentCells(depth + 1);
  const headerIndent = headerIndentCellsWithModeIcon(depth, iconKey);

  emitHybridHeader(
    cols,
    depth,
    headerIndent,
    flipCornerCell(rowidCol, iconKey, false),
    rows,
    parentNodeId,
    selection,
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // Comment children of this row → r-comment rows before the data row.
    for (const child of node.children) {
      if (child.type === 'comment') emitCommentRow(child, depth, rows);
    }

    // Emit one drill-box per expanded chevron host. Each drill-box is a
    // standalone grid item at the host column's track; auto-placement
    // drops them all into the SAME outer grid row (one row below the
    // owning data row), so multiple expanded hosts in the same row
    // share a single drill-down band.
    const hostColIdxs = new Set<number>();
    const drillBoxes: string[] = [];
    {
      let colIdx = 1;
      for (const col of cols) {
        if (col.kind === 'elem-chevron') {
          const r = resolveCell(node, col);
          if (r.child && r.child.isExpanded) {
            hostColIdxs.add(colIdx);
            const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
            const hostCid = elemColumnId(parentNodeId, col.name);
            renderDrillBox(r.child, gc, node.nodeId, hostCid, drillBoxes);
          }
        }
        colIdx++;
      }
    }
    // Each expanded host contributes exactly one outer grid row: the
    // drill-box wrapper. Non-host cells in the owning row span 2 rows
    // so the drill-box band sits directly beneath them.
    const hasExpandedHost = hostColIdxs.size > 0;
    const outerSpan = hasExpandedHost ? ' grid-row: span 2;' : '';

    const rowSelected = !!selection?.has(node.nodeId);
    const wrapperSelClass = rowSelected ? ' selected' : '';
    rows.push(
      `<div class="g-row r-trow d-${depth}${wrapperSelClass}"` +
        ` data-node-id="${escapeAttr(node.nodeId)}"` +
        ` data-node-type="element"` +
        ` data-depth="${depth}"` +
        ` style="--depth: ${depth}">`,
    );
    // Indent cells and rowid cell span the full row band so column
    // tracks stay reserved across the taller row.
    rows.push(applySpanToCells(tableIndent, outerSpan));
    rows.push(
      `<span class="t-cell t-rowid" style="grid-column: ${rowidCol};${outerSpan}">${i + 1}</span>`,
    );

    let colIdx = 1;
    for (const col of cols) {
      const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
      const r = resolveCell(node, col);
      const cellColKind: 'attr' | 'elem' = col.kind === 'attr' ? 'attr' : 'elem';
      const axis = resolveCellAxisClass(
        parentNodeId, node.nodeId, cellColKind, col.name, false, selection,
      );
      const suffix = axisClassSuffix(axis);
      // Only the expanded chevron host cell stays at span 1 so the
      // drill-box below it can auto-place into its column track.
      const isHost = hostColIdxs.has(colIdx);
      const cellSpan = isHost ? '' : outerSpan;
      if (col.kind === 'attr' || col.kind === 'elem-scalar') {
        rows.push(
          `<span class="t-cell g-editable${suffix}"` +
            ` data-cell-column-id="${escapeAttr(
              col.kind === 'attr'
                ? attrColumnId(parentNodeId, col.name)
                : elemColumnId(parentNodeId, col.name),
            )}"` +
            ` style="grid-column: ${gc};${cellSpan}">${escapeHtml(r.text)}</span>`,
        );
      } else {
        rows.push(
          renderChevronCell(
            r.child,
            gc,
            suffix,
            col.kind === 'elem-chevron' ? elemColumnId(parentNodeId, col.name) : '',
            cellSpan,
          ),
        );
      }
      colIdx++;
    }
    rows.push('</div>');

    // Flush the per-host drill-box grid items AFTER the owning row
    // wrapper. Each drill-box carries `grid-column: <hostCol>` so
    // auto-placement drops them into the host column's next free slot
    // — with the non-host cells spanning 2 rows, that slot is the
    // drill-box band one outer row below the data row.
    for (const line of drillBoxes) rows.push(line);
  }
}

/** Emit a FLIPPED hybrid table region (B.1.d / Q4=C): rows and columns
 *  interchanged. The header row's data cells contain the ORIGINAL row
 *  ids (1..N). Each subsequent data row corresponds to one ORIGINAL
 *  column (attr name or element name). Chevron cells keep their child
 *  nodeId so `toggleExpand` still drives `GridNode.isExpanded`; when a
 *  chevron is expanded we inject a `.g-drill-box` at the host's grid
 *  column in the outer row band below the owning flipped row. */
function emitHybridFlipped(
  nodes: readonly GridNode[],
  cols: readonly HybridColumn[],
  depth: number,
  rows: string[],
  renderDrillBox: RenderDrillBox,
  parentNodeId: string,
  selection: GridSelectionModel | undefined,
  iconKey: string,
  _toggleState: ToggleState | undefined,
): void {
  const rowidCol = `${depth + 2} / ${depth + 3}`;
  const tableIndent = indentCells(depth + 1);
  const headerIndent = headerIndentCellsWithModeIcon(depth, iconKey);
  const N = nodes.length;

  // Header row: # | 1 | 2 | ... | N  (column labels are original row ids).
  // Each numeric cell carries `data-row-click-id` so clicks select the
  // underlying original row (kind=row) via the row-click dispatch arm.
  rows.push(
    `<div class="g-row r-trow t-header r-flipped d-${depth}" data-depth="${depth}" style="--depth: ${depth}">`,
  );
  rows.push(headerIndent);
  rows.push(flipCornerCell(rowidCol, iconKey, true));
  for (let i = 0; i < N; i++) {
    const gc = `${depth + 3 + i} / ${depth + 4 + i}`;
    rows.push(
      `<span class="t-cell t-th"` +
        ` data-row-click-id="${escapeAttr(nodes[i].nodeId)}"` +
        ` style="grid-column: ${gc};">${i + 1}</span>`,
    );
  }
  rows.push('</div>');

  // One data row per original column.
  for (const col of cols) {
    const klass = col.kind === 'attr' ? 'attr-col-header' : 'elem-col-header';
    const prefix = col.kind === 'attr' ? '=' : '&lt;&gt;';
    const cellColKind: 'attr' | 'elem' = col.kind === 'attr' ? 'attr' : 'elem';
    // B.1.e / Q9 — flipped view: the visual row corresponds to an
    // ORIGINAL column, so a column-kind selection (axis → 'selected')
    // highlights the whole visual-row wrapper.
    const wrapperAxis =
      N > 0
        ? resolveCellAxisClass(
            parentNodeId, nodes[0].nodeId, cellColKind, col.name, true, selection,
          )
        : 'none';
    const wrapperSelClass = wrapperAxis === 'selected' ? ' selected' : '';
    // Synthesize the column id once so it can be mirrored onto both the
    // wrapper (for empty-space click resolution) and the leading header
    // cell (for header-click resolution + column-selected painting).
    const cid =
      col.kind === 'attr'
        ? attrColumnId(parentNodeId, col.name)
        : elemColumnId(parentNodeId, col.name);
    rows.push(
      `<div class="g-row r-trow r-flipped d-${depth}${wrapperSelClass}"` +
        ` data-flip-col-name="${escapeAttr(col.name)}"` +
        ` data-column-id="${escapeAttr(cid)}"` +
        ` data-depth="${depth}"` +
        ` style="--depth: ${depth}">`,
    );

    // Emit one drill-box per expanded chevron host in this visual
    // row. Each lives at its own grid-column track (the original row's
    // slot) and auto-places into the SAME outer row band below the
    // flipped row — non-host cells span 2 so the band is reserved.
    const hostItemIdxs = new Set<number>();
    const drillBoxes: string[] = [];
    const hostCid = col.kind === 'attr'
      ? attrColumnId(parentNodeId, col.name)
      : elemColumnId(parentNodeId, col.name);
    if (col.kind === 'elem-chevron') {
      for (let i = 0; i < N; i++) {
        const r = resolveCell(nodes[i], col);
        if (r.child && r.child.isExpanded) {
          hostItemIdxs.add(i);
          const gc = `${depth + 3 + i} / ${depth + 4 + i}`;
          renderDrillBox(r.child, gc, nodes[i].nodeId, hostCid, drillBoxes);
        }
      }
    }
    const hasExpandedHost = hostItemIdxs.size > 0;
    const outerSpan = hasExpandedHost ? ' grid-row: span 2;' : '';

    rows.push(applySpanToCells(tableIndent, outerSpan));
    // Leading header cell (original column label) spans the full row
    // band so auto-placement does not back-fill its column.
    const headerSelSuffix = columnHeaderSelectedSuffix(cid, selection);
    rows.push(
      `<span class="t-cell t-th g-col-header ${klass}${headerSelSuffix}"` +
        ` data-column-id="${escapeAttr(cid)}" style="grid-column: ${rowidCol};${outerSpan}">${prefix} ${escapeHtml(
          col.name,
        )}</span>`,
    );

    for (let i = 0; i < N; i++) {
      const gc = `${depth + 3 + i} / ${depth + 4 + i}`;
      const r = resolveCell(nodes[i], col);
      const axis = resolveCellAxisClass(
        parentNodeId, nodes[i].nodeId, cellColKind, col.name, true, selection,
      );
      const suffix = axisClassSuffix(axis);
      const isHost = hostItemIdxs.has(i);
      const cellSpan = isHost ? '' : outerSpan;
      if (col.kind === 'attr' || col.kind === 'elem-scalar') {
        rows.push(
          `<span class="t-cell g-editable${suffix}"` +
            ` data-flip-row-id="${escapeAttr(nodes[i].nodeId)}"` +
            ` style="grid-column: ${gc};${cellSpan}">${escapeHtml(r.text)}</span>`,
        );
      } else {
        rows.push(
          renderFlippedChevronCell(r.child, gc, suffix, nodes[i].nodeId, cellSpan),
        );
      }
    }
    rows.push('</div>');

    // Flush the per-host drill-box grid items below this flipped row.
    for (const line of drillBoxes) rows.push(line);
  }
}

/** Emit a hybrid table region: like scalar but chevron-bearing element
 *  columns render a chevron cell whose expanded state injects a
 *  `.g-drill-box` wrapper at the host column in the outer row band
 *  below the data row. See `docs/designs/DESIGN_GRID_ALIGNMENT.md`
 *  §9.0 Q1/Q2/Q6. When `flipped` is true, rows and columns are
 *  interchanged (Q4=C): renderer-side HTML rebuild.
 *
 *  Round 7 / §9.8 — if `tableRuns` is provided and carries an entry for
 *  this run's tag, columns are derived from `attrUnion`/`childUnion`
 *  instead of the first member's shape. Rows that lack a given column
 *  render an empty cell at the correct grid track. */
export function emitTableRegionHybrid(
  nodes: readonly GridNode[],
  depth: number,
  rows: string[],
  renderDrillBox: RenderDrillBox,
  flipped = false,
  parentNodeId = '',
  selection?: GridSelectionModel,
  tableRuns?: readonly GridTableRunUnion[],
  toggleKey?: string,
  toggleState?: ToggleState,
): void {
  if (nodes.length === 0) return;
  const tag = nodes[0].name;
  const run = tableRuns?.find((r) => r.tag === tag);
  const cols = run ? deriveColumnsFromUnion(run, nodes) : deriveHybridColumns(nodes[0]);
  const iconKey = toggleKey ?? parentNodeId;
  if (flipped) {
    emitHybridFlipped(
      nodes, cols, depth, rows, renderDrillBox, parentNodeId, selection, iconKey, toggleState,
    );
  } else {
    emitHybridUnflipped(
      nodes, cols, depth, rows, renderDrillBox, parentNodeId, selection, iconKey, toggleState,
    );
  }
}

/** True iff this run should render in hybrid mode.
 *
 *  Primary signal: the engine's B.1.a `isHybridTableCandidate` flag on any
 *  member. Fallback (for pre-B.1.a engine binaries / unit-test fixtures
 *  that do not set the flag): any element-child contains sub-elements —
 *  i.e. a true structural nested case. Attribute-only element-children
 *  without the flag continue to render via the legacy scalar inline
 *  `cell-nv` path for backwards compatibility. */
export function isHybridRun(run: readonly GridNode[]): boolean {
  for (const n of run) if (n.isHybridTableCandidate) return true;
  for (const n of run) {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if (c.children.some((g) => g.type === 'element')) return true;
    }
  }
  return false;
}
