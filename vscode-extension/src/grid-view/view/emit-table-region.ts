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
import {
  emitTableRegionHybrid,
  isHybridRun,
  RenderDrillBox,
} from './emit-table-region-hybrid';
import { emitFlipIcon, emitTableModeOnIcon } from './emit-toggle-icons';

/** Minimal HTML escaping mirror of GridRenderer.escapeHtml (kept local so
 *  this module does not depend on GridRenderer internals). */
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

/** Mirror of GridRenderer.indentCells — produces D empty indent cells so
 *  table rows align column-for-column with sibling tree rows. */
function indentCells(depth: number): string {
  let html = '';
  for (let k = 1; k <= depth; k++) {
    html += `<span class="g-indent" data-ancestor-expanded="1" style="grid-column: ${k} / ${k + 1};"></span>`;
  }
  return html;
}

/** Indent cells for the column-headers row of a tableMode:ON
 *  table. Emits `depth` plain indent cells followed by a gutter cell at
 *  `grid-column: depth+1 / depth+2` carrying the table-mode-ON icon.
 *  Leftmost gutter of the column-headers row holds the ⊡ icon,
 *  always visible regardless of selection. */
function headerIndentCellsWithModeIcon(depth: number, parentNodeId: string): string {
  let html = indentCells(depth);
  const iconCol = `${depth + 1} / ${depth + 2}`;
  html +=
    `<span class="g-indent g-tm-on-gutter" data-ancestor-expanded="1"` +
    ` style="grid-column: ${iconCol};">${parentNodeId ? emitTableModeOnIcon(parentNodeId) : ''}</span>`;
  return html;
}

/** The "top-left corner" cell of a tableMode:ON table. Shares the
 *  row-index column (`grid-column: depth+2 / depth+3`) in the header row
 *  only; replaces the plain "#" label with the flip (⇆) icon so flip
 *  clicks land outside every column-header click surface. */
function flipCornerCell(
  rowidCol: string,
  parentNodeId: string,
  flipped: boolean,
): string {
  const icon = parentNodeId ? emitFlipIcon(parentNodeId, flipped) : '#';
  return `<span class="t-cell t-rowid g-flip-corner" style="grid-column: ${rowidCol};">${icon}</span>`;
}

/** Render an expandable attribute-only cell used inside a table data cell
 *  (e.g. a row whose value column is itself an element with attributes but
 *  no text content). The chevron toggles inline expansion of the cell. */
function renderExpandableCell(child: GridNode): string {
  const cellToggle =
    `<span class="expand-toggle cell-toggle" data-node-id="${escapeAttr(child.nodeId)}"` +
    ` data-expanded="${child.isExpanded}">${child.isExpanded ? '▼' : '▶'}</span>`;
  if (child.isExpanded) {
    let content =
      cellToggle +
      `<span class="cell-elem-name">${escapeHtml(child.name)}</span>` +
      '<div class="cell-nv">';
    for (const attr of child.attributes) {
      content +=
        `<span class="cell-nv-name"><span class="node-icon attribute-icon">=</span> ${escapeHtml(attr.name)}</span>` +
        `<span class="cell-nv-value">${escapeHtml(attr.value)}</span>`;
    }
    content += '</div>';
    return content;
  }
  const attrSummary = child.attributes
    .map((a) => `${escapeHtml(a.name)}="${escapeHtml(a.value)}"`)
    .join(' ');
  return (
    cellToggle +
    `<span class="cell-elem-name">${escapeHtml(child.name)}</span> ` +
    `<span class="cell-attr-summary">${attrSummary}</span>`
  );
}

/** Emit a table region — rows participate directly in the root grid at
 *  depth = parent depth + 1.
 *
 *  Column discovery deliberately SKIPS comment children: a comment
 *  inside a row would otherwise synthesise an empty-name data column
 *  and its text would leak into that column. Instead, each row's
 *  comment children are emitted as standalone r-comment rows (via
 *  emitCommentRow, spanning grid-column `(D+2)/-1`) immediately BEFORE
 *  the owning data row. */
export function emitTableRegion(
  nodes: GridNode[],
  depth: number,
  rows: string[],
  renderDrillBox?: RenderDrillBox,
  flipped = false,
  parentNodeId = '',
  selection?: GridSelectionModel,
  tableRuns?: readonly GridTableRunUnion[],
  toggleKey?: string,
  toggleState?: ToggleState,
): void {
  if (nodes.length === 0) return;

  // Dispatch: if the engine flags this run as a hybrid candidate
  // (same-shape repeated siblings with non-scalar element children), route
  // to the hybrid emitter. Otherwise the legacy scalar-only path below
  // preserves regression coverage against the legacy scalar-only emitter
  // (groupB pure tables, attribute-only cells via legacy cell-nv path).
  if (renderDrillBox && isHybridRun(nodes)) {
    emitTableRegionHybrid(
      nodes, depth, rows, renderDrillBox, flipped, parentNodeId, selection, tableRuns,
      toggleKey, toggleState,
    );
    return;
  }

  const iconKey = toggleKey ?? parentNodeId;

  // When the engine provides a per-run union descriptor, use it
  // directly for column order. For pure (scalar) runs the union is
  // identical to the per-member derivation so this is a no-op; falls
  // back to the legacy per-member scan when no descriptor exists.
  const runTag = nodes[0].name;
  const run = tableRuns?.find((r) => r.tag === runTag);
  let attrCols: string[];
  let elemCols: string[];
  if (run) {
    attrCols = [...run.attrUnion];
    elemCols = [...run.childUnion];
  } else {
    const attrMinIndex = new Map<string, number>();
    const elemMinIndex = new Map<string, number>();
    for (const node of nodes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const name = node.attributes[i].name;
        const current = attrMinIndex.get(name);
        if (current === undefined || i < current) attrMinIndex.set(name, i);
      }
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'comment') continue;
        const current = elemMinIndex.get(child.name);
        if (current === undefined || i < current) elemMinIndex.set(child.name, i);
      }
    }
    attrCols = Array.from(attrMinIndex.keys()).sort(
      (a, b) => attrMinIndex.get(a)! - attrMinIndex.get(b)!,
    );
    elemCols = Array.from(elemMinIndex.keys()).sort(
      (a, b) => elemMinIndex.get(a)! - elemMinIndex.get(b)!,
    );
  }

  // Text-only repeated leaves (e.g. <plotGroupId>…</plotGroupId>) synthesise
  // a single "(value)" column so the table is not a sea of empty rows.
  const hasTextValue =
    attrCols.length === 0 && elemCols.length === 0 && nodes.some((n) => !!n.value);

  const rowidCol = `${depth + 2} / ${depth + 3}`;
  const tableIndent = indentCells(depth + 1);
  const headerIndent = headerIndentCellsWithModeIcon(depth, iconKey);

  if (flipped) {
    emitScalarFlipped(
      nodes, attrCols, elemCols, hasTextValue, depth, rowidCol, tableIndent,
      headerIndent, rows, parentNodeId, selection, flipped, iconKey,
    );
    return;
  }

  // Header row — carries the tableMode-ON icon in its leftmost gutter and
  // the flip icon in the top-left-corner cell (replaces plain "#" label).
  rows.push(
    `<div class="g-row r-trow t-header g-col-headers d-${depth}" data-depth="${depth}" style="--depth: ${depth}">`,
  );
  rows.push(headerIndent);
  rows.push(flipCornerCell(rowidCol, iconKey, flipped));
  let colIdx = 1;
  for (const name of attrCols) {
    const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
    const cid = attrColumnId(parentNodeId, name);
    const selSuffix = columnHeaderSelectedSuffix(cid, selection);
    rows.push(
      `<span class="t-cell t-th g-col-header attr-col-header${selSuffix}"` +
        ` data-column-id="${escapeAttr(cid)}" style="grid-column: ${gc};">= ${escapeHtml(name)}</span>`,
    );
    colIdx++;
  }
  for (const name of elemCols) {
    const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
    const cid = elemColumnId(parentNodeId, name);
    const selSuffix = columnHeaderSelectedSuffix(cid, selection);
    rows.push(
      `<span class="t-cell t-th g-col-header elem-col-header${selSuffix}"` +
        ` data-column-id="${escapeAttr(cid)}" style="grid-column: ${gc};">&lt;&gt; ${escapeHtml(name)}</span>`,
    );
    colIdx++;
  }
  if (hasTextValue) {
    const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
    rows.push(
      `<span class="t-cell t-th" style="grid-column: ${gc};">(value)</span>`,
    );
    colIdx++;
  }
  rows.push('</div>');

  // Data rows (with interleaved in-row comments)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // Comment children of this row → r-comment rows before the data row.
    for (const child of node.children) {
      if (child.type === 'comment') emitCommentRow(child, depth, rows);
    }
    // Row-wrapper selection class. In unflipped scalar mode a
    // row-kind entry maps to the visual row; column-kind entries do
    // NOT highlight the wrapper (they highlight individual cells instead).
    const rowSelected = !!selection?.has(node.nodeId);
    const wrapperSelClass = rowSelected ? ' selected' : '';
    rows.push(
      `<div class="g-row r-trow d-${depth}${wrapperSelClass}"` +
        ` data-node-id="${escapeAttr(node.nodeId)}"` +
        ` data-node-type="element"` +
        ` data-depth="${depth}"` +
        ` style="--depth: ${depth}">`,
    );
    rows.push(tableIndent);
    rows.push(`<span class="t-cell t-rowid" style="grid-column: ${rowidCol};">${i + 1}</span>`);

    colIdx = 1;
    for (const name of attrCols) {
      const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
      const attr = node.attributes.find((a) => a.name === name);
      const axis = resolveCellAxisClass(
        parentNodeId, node.nodeId, 'attr', name, false, selection,
      );
      rows.push(
        `<span class="t-cell g-editable${axisClassSuffix(axis)}"` +
          ` data-cell-column-id="${escapeAttr(attrColumnId(parentNodeId, name))}"` +
          ` style="grid-column: ${gc};">` +
          `${attr ? escapeHtml(attr.value) : ''}</span>`,
      );
      colIdx++;
    }
    for (const name of elemCols) {
      const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
      // Match on element children only (comments are filtered out).
      const child = node.children.find((c) => c.type !== 'comment' && c.name === name);
      let cellContent = '';
      if (child) {
        if (child.value) {
          cellContent = escapeHtml(child.value);
        } else if (child.children.length > 0) {
          cellContent = `<span class="complex-content">{${child.children.length} children}</span>`;
        } else if (child.attributes.length > 0) {
          cellContent = renderExpandableCell(child);
        }
      }
      const axis = resolveCellAxisClass(
        parentNodeId, node.nodeId, 'elem', name, false, selection,
      );
      rows.push(
        `<span class="t-cell g-editable${axisClassSuffix(axis)}"` +
          ` data-cell-column-id="${escapeAttr(elemColumnId(parentNodeId, name))}"` +
          ` style="grid-column: ${gc};">${cellContent}</span>`,
      );
      colIdx++;
    }
    if (hasTextValue) {
      const gc = `${depth + 2 + colIdx} / ${depth + 3 + colIdx}`;
      // The synthetic "(value)" column cannot be independently column-
      // selected (no column id is synthesised for it); stamp only the
      // row-axis class via the helper's row-selected branch.
      const axis = resolveCellAxisClass(
        parentNodeId, node.nodeId, 'elem', '(value)', false, selection,
      );
      rows.push(
        `<span class="t-cell g-editable${axisClassSuffix(axis)}" style="grid-column: ${gc};">` +
          `${node.value ? escapeHtml(node.value) : ''}</span>`,
      );
      colIdx++;
    }
    rows.push('</div>');
  }
}

/** Flipped (transposed) scalar-only table: one row per original column
 *  (attr / elem / synthesised "(value)"); one data column per original
 *  row. No chevron cells here (hybrid is handled elsewhere). */
function emitScalarFlipped(
  nodes: readonly GridNode[],
  attrCols: readonly string[],
  elemCols: readonly string[],
  hasTextValue: boolean,
  depth: number,
  rowidCol: string,
  tableIndent: string,
  headerIndent: string,
  rows: string[],
  parentNodeId: string,
  selection: GridSelectionModel | undefined,
  flipped: boolean,
  iconKey: string,
): void {
  const N = nodes.length;

  // Header: # | 1 | 2 | ... | N. In flipped view, each numeric header
  // cell is the click target for selecting the underlying original row
  // (kind=row). Click dispatch finds it via `[data-row-click-id]`.
  rows.push(
    `<div class="g-row r-trow t-header r-flipped d-${depth}" data-depth="${depth}" style="--depth: ${depth}">`,
  );
  rows.push(headerIndent);
  rows.push(flipCornerCell(rowidCol, iconKey, flipped));
  for (let i = 0; i < N; i++) {
    const gc = `${depth + 3 + i} / ${depth + 4 + i}`;
    rows.push(
      `<span class="t-cell t-th"` +
        ` data-row-click-id="${escapeAttr(nodes[i].nodeId)}"` +
        ` style="grid-column: ${gc};">${i + 1}</span>`,
    );
  }
  rows.push('</div>');

  // Flipped view: axis is swapped literally. The visual "row" corresponds
  // to an ORIGINAL column (attr / elem / value); each data cell
  // corresponds to ONE original row. So column-selected entries now
  // highlight the visual-row wrapper, and row-selected entries highlight
  // the individual data cells within each visual row.
  const emitDataRow = (
    label: string,
    colKind: 'attr' | 'elem',
    klass: string,
    prefix: string,
    getCell: (node: GridNode) => string,
  ): void => {
    // The representative cell (first data cell) decides the wrapper
    // class: if its axis is 'selected' — i.e. the original column is
    // selected — the whole visual row carries .selected.
    const wrapperAxis =
      N > 0
        ? resolveCellAxisClass(
            parentNodeId, nodes[0].nodeId, colKind, label, true, selection,
          )
        : 'none';
    const wrapperSelClass = wrapperAxis === 'selected' ? ' selected' : '';
    // Mirror `data-column-id` onto the wrapper so a click anywhere in
    // the flipped data row (including empty-space gaps between cells)
    // resolves to a column click via `closest('[data-column-id]')`.
    // The synthetic "(value)" row has no column id and stays plain.
    const hasWrapperColumnId = klass === 'attr-col-header' || klass === 'elem-col-header';
    const wrapperCid = hasWrapperColumnId
      ? (colKind === 'attr'
          ? attrColumnId(parentNodeId, label)
          : elemColumnId(parentNodeId, label))
      : '';
    const wrapperColAttr = hasWrapperColumnId
      ? ` data-column-id="${escapeAttr(wrapperCid)}"`
      : '';
    rows.push(
      `<div class="g-row r-trow r-flipped d-${depth}${wrapperSelClass}"` +
        ` data-flip-col-name="${escapeAttr(label)}"` +
        wrapperColAttr +
        ` data-depth="${depth}"` +
        ` style="--depth: ${depth}">`,
    );
    rows.push(tableIndent);
    // The first t-th cell of a flipped row IS the column header
    // (visually the row label, semantically the original column). Carry
    // data-column-id + .g-col-header so click dispatch treats it as a
    // column target. Only attr / elem columns synthesise an id; the
    // synthetic "(value)" row is left plain (no column id, no class).
    const hasColumnId = klass === 'attr-col-header' || klass === 'elem-col-header';
    const cid = hasColumnId
      ? (colKind === 'attr'
          ? attrColumnId(parentNodeId, label)
          : elemColumnId(parentNodeId, label))
      : '';
    const headerKlass = hasColumnId ? `g-col-header ${klass}` : klass;
    const headerSelSuffix = hasColumnId ? columnHeaderSelectedSuffix(cid, selection) : '';
    const headerAttr = hasColumnId ? ` data-column-id="${escapeAttr(cid)}"` : '';
    rows.push(
      `<span class="t-cell t-th ${headerKlass}${headerSelSuffix}"${headerAttr}` +
        ` style="grid-column: ${rowidCol};">${prefix} ${escapeHtml(label)}</span>`,
    );
    for (let i = 0; i < N; i++) {
      const gc = `${depth + 3 + i} / ${depth + 4 + i}`;
      const axis = resolveCellAxisClass(
        parentNodeId, nodes[i].nodeId, colKind, label, true, selection,
      );
      rows.push(
        `<span class="t-cell g-editable${axisClassSuffix(axis)}"` +
          ` data-flip-row-id="${escapeAttr(nodes[i].nodeId)}"` +
          ` style="grid-column: ${gc};">${getCell(nodes[i])}</span>`,
      );
    }
    rows.push('</div>');
  };

  for (const name of attrCols) {
    emitDataRow(name, 'attr', 'attr-col-header', '=', (node) => {
      const a = node.attributes.find((x) => x.name === name);
      return a ? escapeHtml(a.value) : '';
    });
  }
  for (const name of elemCols) {
    emitDataRow(name, 'elem', 'elem-col-header', '&lt;&gt;', (node) => {
      const child = node.children.find((c) => c.type !== 'comment' && c.name === name);
      if (!child) return '';
      if (child.value) return escapeHtml(child.value);
      if (child.children.length > 0) {
        return `<span class="complex-content">{${child.children.length} children}</span>`;
      }
      if (child.attributes.length > 0) return renderExpandableCell(child);
      return '';
    });
  }
  if (hasTextValue) {
    // The "(value)" row has no synthesized column id, so column-axis
    // selection never applies — the helper reduces to pure row-axis.
    emitDataRow('(value)', 'elem', '', '', (node) => (node.value ? escapeHtml(node.value) : ''));
  }
}
