import { GridNode } from '../model/grid-node';
import { GridSelectionModel } from '../model/grid-selection';
import { GridTableRunUnion } from '../grid-view-types';
import { attrColumnId, elemColumnId } from '../model/grid-selection-entry';
import { columnHeaderSelectedSuffix } from './emit-cell-selection';

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

/** True iff a child element's column is chevron-bearing — has
 *  sub-elements or attributes. */
export function isChevronBearingChild(child: GridNode | undefined): boolean {
  if (!child || child.type !== 'element') return false;
  return child.children.some((c) => c.type === 'element') || child.attributes.length > 0;
}

/** A hybrid-mode column descriptor. */
export interface HybridColumn {
  readonly kind: 'attr' | 'elem-scalar' | 'elem-chevron';
  readonly name: string;
}

/** Derive column list from the first row's shape. */
export function deriveHybridColumns(head: GridNode): HybridColumn[] {
  const cols: HybridColumn[] = [];
  for (const a of head.attributes) cols.push({ kind: 'attr', name: a.name });
  for (const c of head.children) {
    if (c.type !== 'element') continue;
    cols.push({
      kind: isChevronBearingChild(c) ? 'elem-chevron' : 'elem-scalar',
      name: c.name,
    });
  }
  return cols;
}

/** Derive column list from the engine-supplied union-shape descriptor. */
export function deriveColumnsFromUnion(
  run: GridTableRunUnion,
  nodes: readonly GridNode[],
): HybridColumn[] {
  const cols: HybridColumn[] = [];
  for (const a of run.attrUnion) cols.push({ kind: 'attr', name: a });
  for (const name of run.childUnion) {
    let chevron = false;
    for (const n of nodes) {
      const c = n.children.find((x) => x.type === 'element' && x.name === name);
      if (isChevronBearingChild(c)) { chevron = true; break; }
    }
    cols.push({ kind: chevron ? 'elem-chevron' : 'elem-scalar', name });
  }
  return cols;
}

/** Render a chevron-bearing cell's visible content (collapsed OR expanded
 *  label). `extraStyle` is appended to the inline `style` attribute so
 *  callers can stamp `grid-row: span N` for column-scoped drill-down. */
export function renderChevronCell(
  child: GridNode | undefined,
  gridCol: string,
  axisSuffix = '',
  cellColumnId = '',
  extraStyle = '',
): string {
  const colAttr = cellColumnId
    ? ` data-cell-column-id="${escapeAttr(cellColumnId)}"`
    : '';
  if (!child) {
    return `<span class="t-cell g-editable${axisSuffix}"${colAttr} style="grid-column: ${gridCol};${extraStyle}"></span>`;
  }
  const chevron = child.isExpanded ? '\u25bc' : '\u25b6';
  const toggleHtml =
    `<span class="expand-toggle cell-toggle" data-node-id="${escapeAttr(child.nodeId)}"` +
    ` data-expanded="${child.isExpanded}">${chevron}</span>`;
  const sameNameRun = child.siblingCount > 1 ? `(${child.siblingCount})` : '\u2026';
  return (
    `<span class="t-cell t-cell-hybrid g-editable${axisSuffix}"${colAttr} style="grid-column: ${gridCol};${extraStyle}">` +
    toggleHtml +
    `<span class="cell-elem-name">${escapeHtml(child.name)}</span> ` +
    `<span class="cell-hybrid-summary">${sameNameRun}</span>` +
    '</span>'
  );
}

/** Flipped variant of `renderChevronCell` — stamps `data-flip-row-id`
 *  for selection paint of original-row-kind selections. */
export function renderFlippedChevronCell(
  child: GridNode | undefined,
  gridCol: string,
  axisSuffix: string,
  flipRowId: string,
  extraStyle = '',
): string {
  const rowAttr = ` data-flip-row-id="${escapeAttr(flipRowId)}"`;
  if (!child) {
    return `<span class="t-cell g-editable${axisSuffix}"${rowAttr} style="grid-column: ${gridCol};${extraStyle}"></span>`;
  }
  const chevron = child.isExpanded ? '\u25bc' : '\u25b6';
  const toggleHtml =
    `<span class="expand-toggle cell-toggle" data-node-id="${escapeAttr(child.nodeId)}"` +
    ` data-expanded="${child.isExpanded}">${chevron}</span>`;
  const sameNameRun = child.siblingCount > 1 ? `(${child.siblingCount})` : '\u2026';
  return (
    `<span class="t-cell t-cell-hybrid g-editable${axisSuffix}"${rowAttr} style="grid-column: ${gridCol};${extraStyle}">` +
    toggleHtml +
    `<span class="cell-elem-name">${escapeHtml(child.name)}</span> ` +
    `<span class="cell-hybrid-summary">${sameNameRun}</span>` +
    '</span>'
  );
}

/** Emit the header row of a hybrid table region (unflipped layout). */
export function emitHybridHeader(
  cols: readonly HybridColumn[],
  depth: number,
  headerIndent: string,
  flipCorner: string,
  rows: string[],
  parentNodeId: string,
  selection: GridSelectionModel | undefined,
): void {
  rows.push(
    `<div class="g-row r-trow t-header g-col-headers d-${depth}" data-depth="${depth}" style="--depth: ${depth}">`,
  );
  rows.push(headerIndent);
  rows.push(flipCorner);
  let colIdx = 1;
  for (const col of cols) {
    const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
    const klass = col.kind === 'attr' ? 'attr-col-header' : 'elem-col-header';
    const prefix = col.kind === 'attr' ? '=' : '&lt;&gt;';
    const cid =
      col.kind === 'attr'
        ? attrColumnId(parentNodeId, col.name)
        : elemColumnId(parentNodeId, col.name);
    const selSuffix = columnHeaderSelectedSuffix(cid, selection);
    rows.push(
      `<span class="t-cell t-th g-col-header ${klass}${selSuffix}"` +
        ` data-column-id="${escapeAttr(cid)}" style="grid-column: ${gc};">${prefix} ${escapeHtml(
          col.name,
        )}</span>`,
    );
    colIdx++;
  }
  rows.push('</div>');
}

/** Resolve a (row, col) cell value. `text` is the inline text for
 *  attr/scalar columns; `child` points at the chevron child element. */
export function resolveCell(
  row: GridNode,
  col: HybridColumn,
): { text: string; child?: GridNode } {
  if (col.kind === 'attr') {
    const a = row.attributes.find((x) => x.name === col.name);
    return { text: a ? a.value : '' };
  }
  const child = row.children.find(
    (c) => c.type === 'element' && c.name === col.name,
  );
  if (col.kind === 'elem-scalar') {
    return { text: child?.value ?? '', child };
  }
  return { text: '', child };
}
